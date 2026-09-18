import { db, collection, onSnapshot, query, orderBy } from "./firebase-config.js";
import { formatarMoeda, aplicarMascaraMoeda, obterValorNumericoMascara, definirValorMascara } from "./core/formatters.js";
import { calcularMetricasOrcamento, calcularVelocimetroPacing, calcularSaldoLivre } from "./core/engine.js";
import { salvarTransacao, removerTransacao, processarFechamentoMes } from "./core/transactions.js";

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

let saldoLivreMemoria = 0;
let envelopesConfig = {};
let snapshotTransactions = null;
let valorFaturaPendenteAtual = 0;

// Seleção de Elementos DOM
const filtroMesInput = document.getElementById('filtro-mes');
const form = document.getElementById('form-transacao');
const inputTransacaoId = document.getElementById('transacao-id');
const inputValorTransacao = document.getElementById('valor');
const tituloForm = document.getElementById('titulo-form');
const btnCancelarEdicao = document.getElementById('btn-cancelar-edicao');
const selectCategoria = document.getElementById('categoria');
const listaTransacoes = document.getElementById('lista-transacoes');
const listaEnvelopes = document.getElementById('lista-envelopes');
const elEntradas = document.getElementById('total-entradas');
const elSaidas = document.getElementById('total-saidas');
const elFaturaCartao = document.getElementById('fatura-cartao');
const elSaldo = document.getElementById('saldo-atual');
const btnQuitarFatura = document.getElementById('btn-quitar-fatura');
const modalFechamentoMes = document.getElementById('modal-fechamento-mes');
const selectCaixinhaDestino = document.getElementById('select-caixinha-destino');
const inputValorAporteSobra = document.getElementById('input-valor-aporte-sobra');
const formFechamentoMes = document.getElementById('form-fechamento-mes');

// Aplicação de Máscaras nos Inputs
aplicarMascaraMoeda(inputValorTransacao);
aplicarMascaraMoeda(document.getElementById('cat-teto'));
aplicarMascaraMoeda(inputValorAporteSobra);

filtroMesInput.value = `${anoAtual}-${mesAtual}`;
document.getElementById('data').value = hoje.toISOString().split('T')[0];

// Processamento da Tela e Atualização Visual
function processarDados() {
  if (!snapshotTransactions) return;

  const mesSelecionado = filtroMesInput.value;
  listaTransacoes.innerHTML = "";

  let totalEntradas = 0;
  let totalSaidasSemFatura = 0;
  let totalFaturaCartao = 0;
  let totalPagamentosFatura = 0;
  const acmCategoriasMes = {};

  snapshotTransactions.forEach((docSnapshot) => {
    const item = docSnapshot.data();
    if (item.date && item.date.substring(0, 7) === mesSelecionado) {
      if (item.type === "SAIDA") {
        if (item.account_id === "ACC_CARTAO_CREDITO") totalFaturaCartao += item.amount;
        else if (item.category_id === "CAT_FATURA_CARTAO") totalPagamentosFatura += item.amount;
        else totalSaidasSemFatura += item.amount;

        if (item.category_id !== "CAT_FATURA_CARTAO") {
          acmCategoriasMes[item.category_id] = (acmCategoriasMes[item.category_id] || 0) + item.amount;
        }
      } else {
        totalEntradas += item.amount;
      }
    }
  });

  valorFaturaPendenteAtual = Math.max(0, totalFaturaCartao - totalPagamentosFatura);
  saldoLivreMemoria = calcularSaldoLivre(totalEntradas, totalSaidasSemFatura, totalPagamentosFatura, valorFaturaPendenteAtual);

  elEntradas.textContent = formatarMoeda(totalEntradas);
  elSaidas.textContent = formatarMoeda(totalSaidasSemFatura + totalPagamentosFatura);
  elFaturaCartao.textContent = formatarMoeda(totalFaturaCartao);
  elSaldo.textContent = formatarMoeda(saldoLivreMemoria);
}

// Evento de Submissão do Formulário de Lançamento
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idEditando = inputTransacaoId.value;
    const dadosTransacao = {
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
    };

    await salvarTransacao(idEditando, dadosTransacao);
    form.reset();
    definirValorMascara(inputValorTransacao, 0);
  });
}

// Evento de Fechamento de Mês
if (formFechamentoMes) {
  formFechamentoMes.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mesSel = filtroMesInput.value;
    const catDestinoId = selectCaixinhaDestino.value;
    const valorAporte = obterValorNumericoMascara(inputValorAporteSobra);
    const nomeCaixinha = envelopesConfig[catDestinoId]?.nome || "Caixinha";

    await processarFechamentoMes(mesSel, catDestinoId, valorAporte, nomeCaixinha, document.getElementById('usuario').value);
    modalFechamentoMes.classList.add('hidden');
  });
}

// Escuta em Tempo Real do Banco de Dados
onSnapshot(collection(db, "categories"), (snapshot) => {
  envelopesConfig = {};
  snapshot.forEach(docSnap => envelopesConfig[docSnap.id] = docSnap.data());
  processarDados();
});

const q = query(collection(db, "transactions"), orderBy("date", "desc"));
onSnapshot(q, (snapshot) => {
  snapshotTransactions = snapshot;
  processarDados();
});