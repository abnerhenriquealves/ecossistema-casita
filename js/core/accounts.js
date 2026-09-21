import { db, setDoc, doc, updateDoc, deleteDoc, collection, query, where, getDocs } from "../firebase-config.js";

// Semente das Contas Padrão
export async function restaurarContasPadrao() {
  const contasPadrao = [
    { id: "ACC_BRADESCO_ABNER", nome: "Conta Corrente / PIX", tipo: "CORRENTE", saldo_inicial: 0 },
    { id: "ACC_CARTAO_CREDITO", nome: "Cartão de Crédito", tipo: "CARTAO", limite: 0, dia_fechamento: 1, dia_vencimento: 10 }
  ];

  for (const acc of contasPadrao) {
    await setDoc(doc(db, "accounts", acc.id), {
      ...acc,
      created_at: new Date().toISOString()
    });
  }
}

// Operações de CRUD
export async function salvarConta(id, dadosConta) {
  if (id) {
    await updateDoc(doc(db, "accounts", id), {
      ...dadosConta,
      updated_at: new Date().toISOString()
    });
  } else {
    // Sanitização de ID: Remove acentos e caracteres especiais, garantindo índice limpo no Firestore
    const baseNome = (dadosConta.nome || "ACC")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const novoId = "ACC_" + baseNome + "_" + Date.now();
    
    await setDoc(doc(db, "accounts", novoId), {
      ...dadosConta,
      created_at: new Date().toISOString()
    });
  }
}

export async function removerConta(id) {
  // 📌 Fase 2: Integridade Relacional (Guardião de Orfandade)
  const q = query(collection(db, "transactions"), where("account_id", "==", id));
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    alert(`⛔ BLOQUEIO DE INTEGRIDADE:\nNão é possível excluir esta conta pois existem ${snapshot.size} lançamento(s) vinculado(s) a ela.\nExclua ou altere a conta pagadora destes lançamentos primeiro.`);
    return false;
  }

  await deleteDoc(doc(db, "accounts", id));
  return true;
}