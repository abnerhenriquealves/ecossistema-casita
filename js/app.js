import { db, collection, onSnapshot, query, orderBy, deleteDoc, setDoc, doc, updateDoc, addDoc } from "./firebase-config.js";
import { formatarMoeda, aplicarMascaraMoeda, obterValorNumericoMascara, definirValorMascara } from "./core/formatters.js";
import { calcularMetricasOrcamento, calcularVelocimetroPacing, calcularSaldoLivre } from "./core/engine.js";
import { salvarTransacao, removerTransacao, processarFechamentoMes, sincronizarGoogleSheets } from "./core/transactions.js";
import { renderizarGraficoMacroGrupos, renderizarGraficoOrcadoVsRealizado, renderizarGraficoHistoricoMensal } from "./core/charts.js";
import { atualizarCardsSaldo, renderizarExtrato, atualizarSelectsCategorias } from "./core/ui.js";

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

let saldoLivreMemoria = 0;
let envelopesConfig = {};
let snapshotTransactions = null;
let valorFaturaPendenteAtual = 0;

// Seletores de DOM
const filtroMesInput = document.getElementById('filtro-mes');
const form = document.getElementById('form-transacao');
const inputTransacaoId = document.getElementById('transacao-id');
const inputValorTransacao = document.getElementById('valor');
const listaTransacoes = document.getElementById('lista-transacoes');
const listaEnvelopes = document.getElementById('lista-envelopes');
const selectCategoria = document.getElementById('categoria');
const listaGerenciadorCat = document.getElementById('lista-gerenciador-categorias');

filtroMesInput.value = `${anoAtual}-${mesAtual}`;
document.getElementById('data').value = hoje.toISOString().split('T')[0];

aplicarMascaraMoeda(inputValorTransacao);
aplicarMascaraMoeda(document.getElementById('cat-teto'));
aplicarMascaraMoeda(document.getElementById('input-valor-aporte-sobra'));

// Handlers Globais para Botões HTML
window.prepararEdicao = (id, data, tipo, valor, descricao, categoria, conta, usuario) => {
  inputTransacaoId.value = id;
  document.getElementById('data').value = data;
  document.getElementById('tipo').value = tipo;
  definirValorMascara(inputValorTransacao, valor);
  document.getElementById('descricao').value = descricao;
  document.getElementById('categoria').value = categoria;
  document.getElementById('conta').value = conta;
  document.getElementById('usuario').value = usuario;
  document.getElementById('titulo-form').textContent = "Editar Lançamento";
};

window.excluirTransacao = async (id, descricao) => {
  if (confirm(`Excluir "${descricao}"?`)) await removerTransacao(id);
};

window.prepararEdicaoCat = (id, nome, teto, macro, rigidez, isAcumulativa) => {
  document.getElementById('cat-id').value = id;
  document.getElementById('cat-nome').value = nome;
  definirValorMascara(document.getElementById('cat-teto'), teto);
  document.getElementById('cat-macro').value = macro || "Reservas & Outros";
  document.getElementById('cat-rigidez').value = rigidez || "RIGIDO";
  document.getElementById('cat-acumulativa').checked = !!isAcumulativa;
};

window.excluirCat = async (id, nome) => {
  if (confirm(`Excluir categoria "${nome}"?`)) await deleteDoc(doc(db, "categories", id));
};

// Processamento do Fluxo
function processarDados() {
  if (!snapshotTransactions) return;
  const mesSel = filtroMesInput.value;
  const anoSel = mesSel.substring(0, 4);

  let totalEntradas = 0, totalSaidasDiretas = 0, totalFatura = 0, totalPagtoFatura = 0;
  const acmCatMes = {}, acmCatSaidaHist = {}, acmCatEntradaHist = {}, acmHistMes = {};
  const itensExibicao = [];

  snapshotTransactions.forEach(docSnap => {
    const item = docSnap.data();
    const id = docSnap.id;
    if (!item.date) return;

    const itemMes = item.date.substring(0, 7);
    const isSaida = item.type === "SAIDA";
    const isCartao = item.account_id === "ACC_CARTAO_CREDITO";
    const isPagto = item.category_id === "CAT_FATURA_CARTAO";

    if (item.date.substring(0, 4) === anoSel && isSaida && !isPagto) {
      const mChave = item.date.substring(5, 7);
      acmHistMes[mChave] = (acmHistMes[mChave] || 0) + item.amount;
    }

    if (itemMes === mesSel) {
      if (isSaida) {
        if (isCartao) totalFatura += item.amount;
        else if (isPagto) totalPagtoFatura += item.amount;
        else totalSaidasDiretas += item.amount;
        if (!isPagto) acmCatMes[item.category_id] = (acmCatMes[item.category_id] || 0) + item.amount;
      } else {
        totalEntradas += item.amount;
      }
      itensExibicao.push({ id, item });
    }
  });

  valorFaturaPendenteAtual = Math.max(0, totalFatura - totalPagtoFatura);
  saldoLivreMemoria = calcularSaldoLivre(totalEntradas, totalSaidasDiretas, totalPagtoFatura, valorFaturaPendenteAtual);

  atualizarCardsSaldo(
    document.getElementById('total-entradas'),
    document.getElementById('total-saidas'),
    document.getElementById('fatura-cartao'),
    document.getElementById('saldo-atual'),
    totalEntradas, totalSaidasDiretas + totalPagtoFatura, totalFatura, saldoLivreMemoria
  );

  renderizarExtrato(listaTransacoes, itensExibicao, envelopesConfig);
  
  const metricas = calcularMetricasOrcamento(envelopesConfig, acmCatMes);
  renderizarGraficoMacroGrupos(acmCatMes);
  renderizarGraficoOrcadoVsRealizado(envelopesConfig, acmCatMes);
  renderizarGraficoHistoricoMensal(acmHistMes);
}

// Eventos e Subscrições
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idEditando = inputTransacaoId.value;
    await salvarTransacao(idEditando, {
      date: document.getElementById('data').value,
      type: document.getElementById('tipo').value,
      amount: obterValorNumericoMascara(inputValorTransacao),
      description: document.getElementById('descricao').value,
      category_id: document.getElementById('categoria').value,
      account_id: document.getElementById('conta').value,
      status: "VALIDATED",
      user_owner: document.getElementById('usuario').value,
      source_satellite: "core_dimdim",
      updated_at: new Date().toISOString()
    });
    form.reset();
  });
}

onSnapshot(collection(db, "categories"), (snapshot) => {
  envelopesConfig = {};
  snapshot.forEach(docSnap => envelopesConfig[docSnap.id] = docSnap.data());
  atualizarSelectsCategorias(selectCategoria, listaGerenciadorCat, envelopesConfig);
  processarDados();
});

onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
  snapshotTransactions = snapshot;
  processarDados();
});