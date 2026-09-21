import { db, collection, addDoc, doc, updateDoc, deleteDoc } from "../firebase-config.js";

const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx18ow_I8Clf0K1hw4X3QnBQjfbfX2ZHLD__-sYuDqJPp37l0i0pPepAL4DG1Nzj0TS/exec";

export async function sincronizarGoogleSheets(payload) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) return;
  try {
    await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("[Sheets Sync] Aviso no espelhamento:", err);
  }
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

// 📌 [Processa o fechamento de mês debitando da conta dinamente selecionada]
export async function processarFechamentoMes(mesSel, catDestinoId, valorAporte, nomeCaixinha, usuario, contaId = "ACC_BRADESCO_ABNER") {
  const [anoSel, mSel] = mesSel.split('-').map(Number);
  const ultimoDiaMes = new Date(anoSel, mSel, 0).getDate();
  const dataUltimoDiaMes = `${mesSel}-${String(ultimoDiaMes).padStart(2, '0')}`;

  const dadosAporte = {
    date: dataUltimoDiaMes,
    type: "SAIDA",
    amount: valorAporte,
    description: `Aporte Sobra Fechamento Mês (${mesSel}) ➔ ${nomeCaixinha}`,
    category_id: catDestinoId,
    account_id: contaId, // 🟢 Dinâmico
    status: "VALIDATED",
    user_owner: usuario || "Abner",
    source_satellite: "core_dimdim",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const docRef = await addDoc(collection(db, "transactions"), dadosAporte);
  sincronizarGoogleSheets({ action: "UPSERT", id: docRef.id, ...dadosAporte });
}