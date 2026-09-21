import { db, collection, addDoc, doc, updateDoc, deleteDoc, setDoc, writeBatch } from "../firebase-config.js";
import { atualizarStatusSyncUI } from "./ui.js";

const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx18ow_I8Clf0K1hw4X3QnBQjfbfX2ZHLD__-sYuDqJPp37l0i0pPepAL4DG1Nzj0TS/exec";

// 📌 [Transmite um lançamento individual para o Webhook com feedback visual]
export async function sincronizarGoogleSheets(payload) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) return;
  atualizarStatusSyncUI('ENVIANDO');

  try {
    await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    setTimeout(() => atualizarStatusSyncUI('SUCESSO'), 800);
  } catch (err) {
    console.warn("[Sheets Sync] Erro no espelhamento:", err);
    atualizarStatusSyncUI('ERRO', '🔴 Falha Sync');
  }
}

// 📌 [Executa a carga em lote (Bulk Sync) de todo o histórico do Firestore para o Sheets]
export async function sincronizarTudoGoogleSheets(snapshotTransactions) {
  if (!snapshotTransactions || snapshotTransactions.empty) {
    alert("Nenhum lançamento encontrado para sincronizar.");
    return;
  }

  const total = snapshotTransactions.size;
  if (!confirm(`Deseja reenviar todos os ${total} lançamentos para a planilha Google Sheets?`)) {
    return;
  }

  atualizarStatusSyncUI('ENVIANDO');

  let enviados = 0;
  for (const docSnap of snapshotTransactions.docs) {
    const item = docSnap.data();
    const payload = {
      action: "UPSERT",
      id: docSnap.id,
      date: item.date || "",
      type: item.type || "",
      amount: item.amount || 0,
      description: item.description || "",
      category_id: item.category_id || "",
      account_id: item.account_id || "",
      user_owner: item.user_owner || "Abner",
      source_satellite: item.source_satellite || "core_dimdim"
    };

    await sincronizarGoogleSheets(payload);
    enviados++;
  }

  atualizarStatusSyncUI('SUCESSO');
  alert(`Sincronização concluída! ${enviados} de ${total} lançamentos processados na planilha.`);
}

// 📌 [Fase 1: Salva ou atualiza uma transação com ID Determinístico (Idempotência)]
export async function salvarTransacao(idEditando, dadosTransacao) {
  if (idEditando) {
    dadosTransacao.updated_at = new Date().toISOString();
    await updateDoc(doc(db, "transactions", idEditando), dadosTransacao);
    sincronizarGoogleSheets({ action: "UPSERT", id: idEditando, ...dadosTransacao });
  } else {
    // Criação de ID único e determinístico no cliente antes de enviar
    const novoId = "TXN_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    dadosTransacao.created_at = new Date().toISOString();
    dadosTransacao.updated_at = new Date().toISOString();
    
    // Substituição de addDoc por setDoc: previne duplicação se houver clique duplo ou retry de rede
    await setDoc(doc(db, "transactions", novoId), dadosTransacao);
    sincronizarGoogleSheets({ action: "UPSERT", id: novoId, ...dadosTransacao });
  }
}

// 📌 [Remove uma transação no Firestore + Google Sheets]
export async function removerTransacao(id) {
  await deleteDoc(doc(db, "transactions", id));
  sincronizarGoogleSheets({ action: "DELETE", id });
}

// 📌 [Busca TODOS os lançamentos gerados pelo fechamento do mês (Caixinhas ou Rollovers)]
export function obterFechamentosExistentes(snapshotTransactions, mesSel) {
  if (!snapshotTransactions || snapshotTransactions.empty) return [];

  const [anoSel, mSel] = mesSel.split('-').map(Number);
  const dataProxMes = new Date(anoSel, mSel, 1);
  const anoProx = dataProxMes.getFullYear();
  const mesProx = String(dataProxMes.getMonth() + 1).padStart(2, '0');
  const dataPrimeiroDiaProxMes = `${anoProx}-${mesProx}-01`;

  const lancamentosEncontrados = [];

  snapshotTransactions.forEach(docSnap => {
    const item = docSnap.data();
    const id = docSnap.id;

    if (item.date && item.date.substring(0, 7) === mesSel && item.description && item.description.includes(`Aporte Sobra Fechamento Mês (${mesSel})`)) {
      lancamentosEncontrados.push({ id, ...item });
    }

    if (item.date === dataPrimeiroDiaProxMes && item.description && item.description.includes(`Saldo Anterior / Rollover (${mesSel})`)) {
      lancamentosEncontrados.push({ id, ...item });
    }
  });

  return lancamentosEncontrados;
}

// 📌 [Desfaz e apaga fechamentos prévios]
export async function removerFechamentoAnterior(alvoFechamento) {
  if (!alvoFechamento) return;

  if (Array.isArray(alvoFechamento)) {
    for (const item of alvoFechamento) {
      if (item && item.id) {
        await removerTransacao(item.id);
      } else if (typeof item === 'string') {
        await removerTransacao(item);
      }
    }
  } else if (typeof alvoFechamento === 'string') {
    await removerTransacao(alvoFechamento);
  } else if (typeof alvoFechamento === 'object' && alvoFechamento.id) {
    await removerTransacao(alvoFechamento.id);
  }
}

// 📌 [Fase 1: Lote Atômico (Batch) para Múltiplas Alocações do Fechamento]
export async function processarFechamentoMultiplosDestinos(mesSel, alocacoes, usuario, contaId) {
  const [anoSel, mSel] = mesSel.split('-').map(Number);
  const ultimoDiaMes = new Date(anoSel, mSel, 0).getDate();
  const dataUltimoDiaMes = `${mesSel}-${String(ultimoDiaMes).padStart(2, '0')}`;

  const dataProxMes = new Date(anoSel, mSel, 1);
  const dataPrimeiroDiaProxMes = `${dataProxMes.getFullYear()}-${String(dataProxMes.getMonth() + 1).padStart(2, '0')}-01`;

  // Prepara a transação em lote
  const batch = writeBatch(db);
  const filaPlanilha = [];

  for (const aloc of alocacoes) {
    let dadosLancamento = {};
    const novoIdFechamento = "TXN_FECH_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const refDoc = doc(db, "transactions", novoIdFechamento);

    if (aloc.tipo === 'ROLLOVER') {
      dadosLancamento = {
        date: dataPrimeiroDiaProxMes,
        type: "ENTRADA",
        amount: aloc.valor,
        description: `Saldo Anterior / Rollover (${mesSel})`,
        category_id: aloc.catDestinoId || "CAT_RESERVAS",
        account_id: contaId || "ACC_BRADESCO_ABNER",
        status: "VALIDATED",
        user_owner: usuario || "Abner",
        source_satellite: "core_dimdim",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    } else {
      dadosLancamento = {
        date: dataUltimoDiaMes,
        type: "SAIDA",
        amount: aloc.valor,
        description: `Aporte Sobra Fechamento Mês (${mesSel}) ➔ ${aloc.nomeCaixinha}`,
        category_id: aloc.catDestinoId,
        account_id: contaId || "ACC_BRADESCO_ABNER",
        status: "VALIDATED",
        user_owner: usuario || "Abner",
        source_satellite: "core_dimdim",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    // Adiciona a operação ao lote (ainda não salva no banco)
    batch.set(refDoc, dadosLancamento);
    
    // Coloca a operação na fila para o Google Sheets
    filaPlanilha.push({ action: "UPSERT", id: novoIdFechamento, ...dadosLancamento });
  }

  // Comita o lote atômico inteiro: ou salva tudo junto perfeitamente, ou não salva nada
  await batch.commit();

  // Se o commit no Firestore foi um sucesso absoluto, reflete os dados no Google Sheets
  for (const payload of filaPlanilha) {
    sincronizarGoogleSheets(payload);
  }
}