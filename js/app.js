import { db, collection, onSnapshot, query, orderBy } from "./firebase-config.js";
import { formatarMoeda, aplicarMascaraMoeda, obterValorNumericoMascara, definirValorMascara } from "./core/formatters.js";
import { calcularMetricasOrcamento, calcularVelocimetroPacing, calcularSaldoLivre } from "./core/engine.js";
import { salvarTransacao, removerTransacao, processarFechamentoMes } from "./core/transactions.js";
import { restaurarCategoriasPadrao, salvarCategoria, removerCategoria, agruparPorMacroGrupo } from "./core/envelopes.js";
import { renderizarGraficoMacroGrupos, renderizarGraficoOrcadoVsRealizado, renderizarGraficoHistoricoMensal } from "./core/charts.js";
import { atualizarCardsSaldo, renderizarExtrato, atualizarSelectsCategorias, renderizarEnvelopesAgrupados } from "./core/ui.js";

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

let saldoLivreMemoria = 0;
let envelopesConfig = {};
let snapshotTransactions = null;
let valorFaturaPendenteAtual = 0;

// Seletores do DOM
const filtroMesInput = document.getElementById('filtro-mes');
const formTransacao = document.getElementById('form-transacao');
const formCategoria = document.getElementById('form-categoria');
const formFechamentoMes = document.getElementById('form-fechamento-mes');

filtroMesInput.value = `${anoAtual}-${mesAtual}`;
document.getElementById('data').value = hoje.toISOString().split('T')[0];

aplicarMascaraMoeda(document.getElementById('valor'));
aplicarMascaraMoeda(document.getElementById('cat-teto'));
aplicarMascaraMoeda(document.getElementById('input-valor-aporte-sobra'));

// Handlers Globais para Ações do HTML
window.prepararEdicao = (id, data, tipo, valor, descricao, categoria, conta, usuario) => {
  document.getElementById('transacao-id').value = id;
  document.getElementById('data').value = data;
  document.getElementById('tipo').value = tipo;
  definirValorMascara(document.getElementById('valor'), valor);
  document.getElementById('descricao').value = descricao;
  document.getElementById('categoria').value = categoria;
  document.getElementById('conta').value = conta;
  document.getElementById('usuario').value = usuario;
  document.getElementById('titulo-form').textContent = "Editar Lançamento";
  document.getElementById('btn-cancelar-edicao').classList.remove('hidden');
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
  document.getElementById('titulo-form-cat').textContent = "Editar Envelope / Categoria";
  document.getElementById('btn-cancelar-cat').classList.remove('hidden');
};

window.excluirCat = async (id, nome) => {
  if (confirm(`Excluir categoria "${nome}"?`)) await removerCategoria(id);
};

// Eventos de Interface
document.getElementById('btn-toggle-gerenciar-cat')?.addEventListener('click', () => {
  document.getElementById('painel-gerenciar-categorias').classList.toggle('aberto');
});

document.getElementById('btn-restaurar-padroes')?.addEventListener('click', async () => {
  if (confirm("Restaurar os envelopes padrão da Casita?")) await restaurarCategoriasPadrao();
});

document.getElementById('btn-mes-anterior')?.addEventListener('click', () => alterarMes(-1));
document.getElementById('btn-mes-proximo')?.addEventListener('click', () => alterarMes(1));
filtroMesInput?.addEventListener('change', processarDados);

function alterarMes(delta) {
  const [ano, mes] = filtroMesInput.value.split('-').map(Number);
  const novaData = new Date(ano, mes - 1 + delta, 1);
  filtroMesInput.value = `${novaData.getFullYear()}-${String(novaData.getMonth() + 1).padStart(2, '0')}`;
  processarDados();
}

// Submissão de Formulários
if (formTransacao) {
  formTransacao.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idEditando = document.getElementById('transacao-id').value;
    await salvarTransacao(idEditando, {
      date: document.getElementById('data').value,
      type: document.getElementById('tipo').value,
      amount: obterValorNumericoMascara(document.getElementById('valor')),
      description: document.getElementById('descricao').value,
      category_id: document.getElementById('categoria').value,
      account_id: document.getElementById('conta').value,
      status: "VALIDATED",
      user_owner: document.getElementById('usuario').value,
      source_satellite: "core_dimdim",
      updated_at: new Date().toISOString()
    });
    formTransacao.reset();
    definirValorMascara(document.getElementById('valor'), 0);
  });
}

if (formCategoria) {
  formCategoria.addEventListener('submit', async (e) => {
    e.preventDefault();
    const catId = document.getElementById('cat-id').value;
    await salvarCategoria(catId, {
      nome: document.getElementById('cat-nome').value.trim(),
      teto: obterValorNumericoMascara(document.getElementById('cat-teto')),
      macro_grupo: document.getElementById('cat-macro').value,
      rigidez: document.getElementById('cat-rigidez').value,
      is_sinking_fund: document.getElementById('cat-acumulativa').checked
    });
    formCategoria.reset();
    definirValorMascara(document.getElementById('cat-teto'), 0);
  });
}

// Processamento Central
function processarDados() {
  if (!snapshotTransactions) return;
  const mesSel = filtroMesInput.value;
  const anoSel = mesSel.substring(0, 4);

  let totalEntradas = 0, totalSaidasDiretas = 0, totalFatura = 0, totalPagtoFatura = 0;
  const acmCatMes = {}, acmHistMes = {}, acmCatSaidaHist = {}, acmCatEntradaHist = {};
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

    if (itemMes <= mesSel && item.category_id && !isPagto) {
      if (isSaida) acmCatSaidaHist[item.category_id] = (acmCatSaidaHist[item.category_id] || 0) + item.amount;
      else acmCatEntradaHist[item.category_id] = (acmCatEntradaHist[item.category_id] || 0) + item.amount;
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

  renderizarExtrato(document.getElementById('lista-transacoes'), itensExibicao, envelopesConfig);
  renderizarEnvelopesAgrupados(document.getElementById('lista-envelopes'), envelopesConfig, acmCatMes, acmCatSaidaHist, acmCatEntradaHist);

  const { gastosMacro, tetosMacro } = agruparPorMacroGrupo(envelopesConfig, acmCatMes);
  renderizarGraficoMacroGrupos(gastosMacro);
  renderizarGraficoOrcadoVsRealizado(tetosMacro, gastosMacro);
  renderizarGraficoHistoricoMensal(acmHistMes);
}

// Subscrições do Firestore
onSnapshot(collection(db, "categories"), (snapshot) => {
  envelopesConfig = {};
  if (snapshot.empty) restaurarCategoriasPadrao();
  snapshot.forEach(docSnap => envelopesConfig[docSnap.id] = docSnap.data());
  atualizarSelectsCategorias(document.getElementById('categoria'), document.getElementById('lista-gerenciador-categorias'), envelopesConfig);
  processarDados();
});

onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
  snapshotTransactions = snapshot;
  processarDados();
});