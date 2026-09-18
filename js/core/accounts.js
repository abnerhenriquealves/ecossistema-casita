import { db, setDoc, doc, updateDoc, deleteDoc } from "../firebase-config.js";

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
    const novoId = "ACC_" + dadosConta.nome.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_" + Date.now();
    await setDoc(doc(db, "accounts", novoId), {
      ...dadosConta,
      created_at: new Date().toISOString()
    });
  }
}

export async function removerConta(id) {
  await deleteDoc(doc(db, "accounts", id));
}