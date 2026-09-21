import { db, setDoc, doc, updateDoc, deleteDoc, collection, query, where, getDocs } from "../firebase-config.js";

// Semente dos Envelopes Padrão
export async function restaurarCategoriasPadrao() {
  const padroes = [
    { id: "CAT_DIZIMO", nome: "Dízimo & Ofertas", teto: 600.00, macro_grupo: "Fé", rigidez: "RIGIDO", is_sinking_fund: false },
    { id: "CAT_CASITA_PREST", nome: "Prestação Casita", teto: 2000.00, macro_grupo: "Habitação & Custos Fixos", rigidez: "RIGIDO", is_sinking_fund: false },
    { id: "CAT_MERCADO", nome: "Supermercado", teto: 1500.00, macro_grupo: "Alimentação & Social", rigidez: "FLEXIVEL", is_sinking_fund: false },
    { id: "CAT_COMBUSTIVEL", nome: "Combustível", teto: 500.00, macro_grupo: "Transporte", rigidez: "FLEXIVEL", is_sinking_fund: false },
    { id: "CAT_PETS", nome: "Ração, Banho & Pets", teto: 400.00, macro_grupo: "Nossos Meninos (Pets)", rigidez: "RIGIDO", is_sinking_fund: false },
    { id: "CAT_MANUT_CASITA", nome: "Caixinha Manutenção da Casita", teto: 1000.00, macro_grupo: "Habitação & Custos Fixos", rigidez: "FLEXIVEL", is_sinking_fund: true }
  ];

  for (const cat of padroes) {
    await setDoc(doc(db, "categories", cat.id), {
      nome: cat.nome,
      teto: cat.teto,
      macro_grupo: cat.macro_grupo,
      rigidez: cat.rigidez,
      is_sinking_fund: cat.is_sinking_fund,
      created_at: new Date().toISOString()
    });
  }
}

// Persistência de Categorias
export async function salvarCategoria(catId, dadosCat) {
  if (catId) {
    await updateDoc(doc(db, "categories", catId), { 
      ...dadosCat, 
      updated_at: new Date().toISOString() 
    });
  } else {
    // Sanitização de ID: Remove acentos e caracteres especiais, garantindo índice limpo no Firestore
    const baseNome = (dadosCat.nome || "CAT")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const novoId = "CAT_" + baseNome + "_" + Date.now();
    
    await setDoc(doc(db, "categories", novoId), { 
      ...dadosCat, 
      created_at: new Date().toISOString() 
    });
  }
}

export async function removerCategoria(catId) {
  // 📌 Fase 2: Integridade Relacional (Guardião de Orfandade)
  const q = query(collection(db, "transactions"), where("category_id", "==", catId));
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    alert(`⛔ BLOQUEIO DE INTEGRIDADE:\nNão é possível excluir este envelope pois existem ${snapshot.size} lançamento(s) vinculado(s) a ele.\nAltere a classificação destes lançamentos antes de excluir.`);
    return false;
  }

  await deleteDoc(doc(db, "categories", catId));
  return true;
}

// Agrupador para Gráficos e Envelopes
export function agruparPorMacroGrupo(envelopesConfig, acmCatMes) {
  const gastosMacro = {};
  const tetosMacro = {};

  Object.keys(envelopesConfig).forEach(catId => {
    const cat = envelopesConfig[catId];
    const macroNome = cat.macro_grupo || cat.macro || "Reservas & Outros";

    if (!gastosMacro[macroNome]) gastosMacro[macroNome] = 0;
    if (!tetosMacro[macroNome]) tetosMacro[macroNome] = 0;

    gastosMacro[macroNome] += (acmCatMes[catId] || 0);
    tetosMacro[macroNome] += (cat.teto || 0);
  });

  return { gastosMacro, tetosMacro };
}