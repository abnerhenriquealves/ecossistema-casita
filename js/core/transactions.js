import { db, collection, addDoc, doc, updateDoc, deleteDoc } from "../firebase-config.js";
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

export async function salvarTransacao(idEditando, dadosTransacao) {
  if (idEditando) {
    await updateDoc(doc(db, "transactions", idEditando), dadosTransacao);
    sincronizarGoogleSheets({ action: "UPSERT", id: idEditando, ...dadosTransacao });
  } else {
    dadosTransacao.created_at = new Date().toISOString();
    const docRef = await addDoc(collection(db, "transactions"), dadosTransacao);
    sincronizarGoogleSheets({ action: "UPSERT", id: docRef.id, ...dadosTransacao });
  }
}

export async function removerTransacao(id) {
  await deleteDoc(doc(db, "transactions", id));
  sincronizarGoogleSheets({ action: "DELETE", id });
}

// 📌 [Processa o fechamento de mês: Aporte em Caixinha (SAIDA) ou Rollover (ENTRADA no prox. mês)]
export async function processarFechamentoMes(mesSel, tipoFechamento, catDestinoId, valorAporte, nomeCaixinha, usuario, contaId = "ACC_BRADESCO_ABNER") {
  const [anoSel, mSel] = mesSel.split('-').map(Number);
  let dadosLancamento = {};

  if (tipoFechamento === 'ROLLOVER') {
    // 📌 Rollover: Gera lançamento de ENTRADA no dia 01 do mês seguinte
    const dataProxMes = new Date(anoSel, mSel, 1);
    const anoProx = dataProxMes.getFullYear();
    const mesProx = String(dataProxMes.getMonth() + 1).padStart(2, '0');
    const dataPrimeiroDiaProxMes = `${anoProx}-${mesProx}-01`;

    dadosLancamento = {
      date: dataPrimeiroDiaProxMes,
      type: "ENTRADA",
      amount: valorAporte,
      description: `Saldo Anterior / Rollover (${mesSel})`,
      category_id: catDestinoId || "CAT_RESERVAS",
      account_id: contaId,
      status: "VALIDATED",
      user_owner: usuario || "Abner",
      source_satellite: "core_dimdim",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  } else {
    // 📌 Caixinha: Gera lançamento de SAÍDA no último dia do mês atual
    const ultimoDiaMes = new Date(anoSel, mSel, 0).getDate();
    const dataUltimoDiaMes = `${mesSel}-${String(ultimoDiaMes).padStart(2, '0')}`;

    dadosLancamento = {
      date: dataUltimoDiaMes,
      type: "SAIDA",
      amount: valorAporte,
      description: `Aporte Sobra Fechamento Mês (${mesSel}) ➔ ${nomeCaixinha}`,
      category_id: catDestinoId,
      account_id: contaId,
      status: "VALIDATED",
      user_owner: usuario || "Abner",
      source_satellite: "core_dimdim",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  const docRef = await addDoc(collection(db, "transactions"), dadosLancamento);
  sincronizarGoogleSheets({ action: "UPSERT", id: docRef.id, ...dadosLancamento });
}