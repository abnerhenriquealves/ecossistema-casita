import { db, collection, onSnapshot, query, orderBy, setDoc, doc, updateDoc, deleteDoc } from "./firebase-config.js";
import { formatarMoeda, aplicarMascaraMoeda, obterValorNumericoMascara, definirValorMascara } from "./core/formatters.js";
import { calcularMetricasOrcamento, calcularVelocimetroPacing, calcularSaldoLivre } from "./core/engine.js";
import { salvarTransacao, removerTransacao, processarFechamentoMes, sincronizarGoogleSheets } from "./core/transactions.js";

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

let saldoLivreMemoria = 0;
let envelopesConfig = {};
let snapshotTransactions = null;
let valorFaturaPendenteAtual = 0;

let graficoMacroInstance = null;
let graficoOrcadoVsRealizadoInstance = null;
let graficoHistoricoInstance = null;

// Elementos de Interface
const filtroMesInput = document.getElementById('filtro-mes');
const btnAnterior = document.getElementById('btn-mes-anterior');
const btnProximo = document.getElementById('btn-mes-proximo');
const btnAbrirPicker = document.getElementById('btn-abrir-picker');

filtroMesInput.value = `${anoAtual}-${mesAtual}`;
document.getElementById('data').value = hoje.toISOString().split('T')[0];

const form = document.getElementById('form-transacao');
const secaoFormulario = document.getElementById('secao-formulario');
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
const badgeFaturaStatus = document.getElementById('badge-fatura-status');
const resumoExecutivoTexto = document.getElementById('resumo-executivo-texto');

// Metrics DOM
const badgeDiagnosticoMargem = document.getElementById('badge-diagnostico-margem');
const barraRigido = document.getElementById('barra-rigido');
const barraFlexivel = document.getElementById('barra-flexivel');
const txtValorRigido = document.getElementById('txt-valor-rigido');
const txtValorFlexivel = document.getElementById('txt-valor-flexivel');
const txtRaioxMargem = document.getElementById('txt-raiox-margem');

const badgeStatusPacing = document.getElementById('badge-status-pacing');
const txtPacingTempo = document.getElementById('txt-pacing-tempo');
const barraPacingTempo = document.getElementById('barra-pacing-tempo');
const txtPacingConsumo = document.getElementById('txt-pacing-consumo');
const barraPacingConsumo = document.getElementById('barra-pacing-consumo');
const txtStatusPacingMensagem = document.getElementById('txt-status-pacing-mensagem');

// Busca e Filtros
const buscaExtratoInput = document.getElementById('busca-extrato');
const filtroUsuarioExtrato = document.getElementById('filtro-usuario-extrato');
const filtroContaExtrato = document.getElementById('filtro-conta-extrato');
const filtroTipoExtrato = document.getElementById('filtro-tipo-extrato');
const contadorExtrato = document.getElementById('contador-extrato');

// Categorias DOM
const btnToggleGerenciarCat = document.getElementById('btn-toggle-gerenciar-cat');
const painelGerenciarCat = document.getElementById('painel-gerenciar-categorias');
const btnRestaurarPadroes = document.getElementById('btn-restaurar-padroes');
const formCategoria = document.getElementById('form-categoria');
const inputCatId = document.getElementById('cat-id');
const inputCatNome = document.getElementById('cat-nome');
const inputCatTeto = document.getElementById('cat-teto');
const selectCatMacro = document.getElementById('cat-macro');
const selectCatRigidez = document.getElementById('cat-rigidez');
const checkCatAcumulativa = document.getElementById('cat-acumulativa');
const tituloFormCat = document.getElementById('titulo-form-cat');
const btnCancelarCat = document.getElementById('btn-cancelar-cat');
const btnSalvarCat = document.getElementById('btn-salvar-cat');
const listaGerenciadorCat = document.getElementById('lista-gerenciador-categorias');

// Modal Fechamento
const btnAbrirFechamentoMes = document.getElementById('btn-abrir-fechamento-mes');
const modalFechamentoMes = document.getElementById('modal-fechamento-mes');
const btnFecharModalFechamento = document.getElementById('btn-fechar-modal-fechamento');
const btnCancelarFechamento = document.getElementById('btn-cancelar-fechamento');
const txtFechamentoMesRef = document.getElementById('txt-fechamento-mes-ref');
const txtFechamentoSaldoSobra = document.getElementById('txt-fechamento-saldo-sobra');
const boxAlertaFaturaPendente = document.getElementById('box-alerta-fatura-pendente');
const selectCaixinhaDestino = document.getElementById('select-caixinha-destino');
const inputValorAporteSobra = document.getElementById('input-valor-aporte-sobra');
const formFechamentoMes = document.getElementById('form-fechamento-mes');

// Aplicação de Máscaras
aplicarMascaraMoeda(inputValorTransacao);
aplicarMascaraMoeda(inputCatTeto);
aplicarMascaraMoeda(inputValorAporteSobra);

// Funções Globais no Window para cliques do HTML
window.prepararEdicao = function(id, data, tipo, valor, descricao, categoria, conta, usuario) {
  inputTransacaoId.value = id;
  document.getElementById('data').value = data;
  document.getElementById('tipo').value = tipo;
  definirValorMascara(inputValorTransacao, valor);
  document.getElementById('descricao').value = descricao;
  document.getElementById('categoria').value = categoria;
  document.getElementById('conta').value = conta;
  document.getElementById('usuario').value = usuario;

  tituloForm.textContent = "Editar Lançamento";
  document.getElementById('btn-salvar').textContent = "Atualizar Lançamento";
  btnCancelarEdicao.classList.remove('hidden');

  secaoFormulario.scrollIntoView({ behavior: 'smooth', block: 'center' });
  inputValorTransacao.focus();
};

window.excluirTransacao = async function(id, descricao) {
  if (confirm(`Deseja realmente excluir o lançamento "${descricao}"?`)) {
    try {
      await removerTransacao(id);
    } catch (err) {
      alert("Erro ao excluir: " + err.message);
    }
  }
};

window.prepararEdicaoCat = function(id, nome, teto, macro, rigidez, isAcumulativa) {
  inputCatId.value = id;
  inputCatNome.value = nome;
  definirValorMascara(inputCatTeto, teto);
  if (macro) selectCatMacro.value = macro;
  if (rigidez) selectCatRigidez.value = rigidez;
  checkCatAcumulativa.checked = !!isAcumulativa;
  
  tituloFormCat.textContent = "Editar Envelope / Categoria";
  btnSalvarCat.textContent = "Atualizar Envelope";
  btnCancelarCat.classList.remove('hidden');
};

window.excluirCat = async function(id, nome) {
  if (confirm(`Deseja excluir a categoria "${nome}"?`)) {
    try {
      await deleteDoc(doc(db, "categories", id));
    } catch (err) {
      alert("Erro ao excluir categoria: " + err.message);
    }
  }
};

[buscaExtratoInput, filtroUsuarioExtrato, filtroContaExtrato, filtroTipoExtrato].forEach(el => {
  if (el) {
    el.addEventListener('input', processarDados);
    el.addEventListener('change', processarDados);
  }
});

if (btnToggleGerenciarCat) {
  btnToggleGerenciarCat.addEventListener('click', () => painelGerenciarCat.classList.toggle('aberto'));
}

function alterarMes(delta) {
  const [ano, mes] = filtroMesInput.value.split('-').map(Number);
  const novaData = new Date(ano, mes - 1 + delta, 1);
  filtroMesInput.value = `${novaData.getFullYear()}-${String(novaData.getMonth() + 1).padStart(2, '0')}`;
  processarDados();
}

if (btnAnterior) btnAnterior.addEventListener('click', () => alterarMes(-1));
if (btnProximo) btnProximo.addEventListener('click', () => alterarMes(1));

function resetarFormulario() {
  inputTransacaoId.value = "";
  form.reset();
  definirValorMascara(inputValorTransacao, 0);
  document.getElementById('data').value = new Date().toISOString().split('T')[0];
  tituloForm.textContent = "Novo Lançamento";
  document.getElementById('btn-salvar').textContent = "Registrar Lançamento";
  btnCancelarEdicao.classList.add('hidden');
}

if (btnCancelarEdicao) btnCancelarEdicao.addEventListener('click', resetarFormulario);

function processarDados() {
  if (!snapshotTransactions) return;

  const mesSelecionado = filtroMesInput.value;
  const anoSelecionado = mesSelecionado.substring(0, 4);
  listaTransacoes.innerHTML = "";

  let totalEntradas = 0;
  let totalSaidasDiretasSemFatura = 0;
  let totalFaturaCartao = 0;
  let totalPagamentosFatura = 0;

  const acmCategoriasMes = {};
  const acmCategoriasHistSaida = {};
  const acmCategoriasHistEntrada = {};

  Object.keys(envelopesConfig).forEach(catId => {
    acmCategoriasMes[catId] = 0;
    acmCategoriasHistSaida[catId] = 0;
    acmCategoriasHistEntrada[catId] = 0;
  });

  const termoBusca = buscaExtratoInput.value.toLowerCase().trim();
  const usrFiltro = filtroUsuarioExtrato.value;
  const contaFiltro = filtroContaExtrato.value;
  const tipoFiltro = filtroTipoExtrato.value;

  let totalItensMes = 0;
  let totalItensExibidos = 0;

  snapshotTransactions.forEach((docSnapshot) => {
    const item = docSnapshot.data();
    const docId = docSnapshot.id;
    if (!item.date) return;

    const itemMesFormatado = item.date.substring(0, 7);
    const isAteMesSelecionado = itemMesFormatado <= mesSelecionado;
    const isMesAtual = itemMesFormatado === mesSelecionado;
    const isSaida = item.type === "SAIDA";
    const isCartao = item.account_id === "ACC_CARTAO_CREDITO";
    const isPagtoFatura = item.category_id === "CAT_FATURA_CARTAO";

    if (isAteMesSelecionado && item.category_id && !isPagtoFatura) {
      if (isSaida) acmCategoriasHistSaida[item.category_id] = (acmCategoriasHistSaida[item.category_id] || 0) + item.amount;
      else acmCategoriasHistEntrada[item.category_id] = (acmCategoriasHistEntrada[item.category_id] || 0) + item.amount;
    }

    if (isMesAtual) {
      totalItensMes++;
      const usuarioItem = item.user_owner || 'Abner';

      if (isSaida) {
        if (isCartao) totalFaturaCartao += item.amount;
        else if (isPagtoFatura) totalPagamentosFatura += item.amount;
        else totalSaidasDiretasSemFatura += item.amount;

        if (!isPagtoFatura) acmCategoriasMes[item.category_id] = (acmCategoriasMes[item.category_id] || 0) + item.amount;
      } else {
        totalEntradas += item.amount;
      }

      const nomeCatExibicao = envelopesConfig[item.category_id]?.nome || (isPagtoFatura ? '💳 Quitação de Fatura' : item.category_id);
      const matchBusca = !termoBusca || item.description.toLowerCase().includes(termoBusca) || (nomeCatExibicao && nomeCatExibicao.toLowerCase().includes(termoBusca));
      const matchUsuario = usrFiltro === "TODOS" || usuarioItem === usrFiltro;
      const matchConta = contaFiltro === "TODAS" || item.account_id === contaFiltro;
      const matchTipo = tipoFiltro === "TODOS" || item.type === tipoFiltro;

      if (matchBusca && matchUsuario && matchConta && matchTipo) {
        totalItensExibidos++;
        const corValor = isSaida ? (isCartao ? "text-amber-400" : (isPagtoFatura ? "text-sky-400" : "text-rose-400")) : "text-emerald-400";
        const sinal = isSaida ? "-" : "+";
        const seloConta = isCartao ? "💳 Cartão" : "🏦 Conta Corrente";

        const card = document.createElement('div');
        card.className = "bg-slate-950/60 border border-slate-800 p-3 rounded-lg flex items-center justify-between text-sm gap-2";
        card.innerHTML = `
          <div class="space-y-0.5 overflow-hidden">
            <p class="font-medium text-slate-200 truncate">${item.description}</p>
            <p class="text-xs text-slate-400">${item.date} • <span class="text-emerald-400/80">${nomeCatExibicao}</span> • <span class="text-slate-500">${seloConta}</span> • <span class="text-slate-500">${usuarioItem}</span></p>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <p class="font-bold font-mono ${corValor}">${sinal} ${formatarMoeda(item.amount)}</p>
            <div class="flex items-center gap-1 border-l border-slate-800 pl-2">
              <button onclick="prepararEdicao('${docId}', '${item.date}', '${item.type}', ${item.amount}, '${item.description.replace(/'/g, "\\'")}', '${item.category_id}', '${item.account_id}', '${usuarioItem}')" class="p-1 text-slate-400 hover:text-sky-400">✏️</button>
              <button onclick="excluirTransacao('${docId}', '${item.description.replace(/'/g, "\\'")}')" class="p-1 text-slate-400 hover:text-rose-400">🗑️</button>
            </div>
          </div>
        `;
        listaTransacoes.appendChild(card);
      }
    }
  });

  if (totalItensMes === 0) listaTransacoes.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center">Nenhum lançamento no mês.</p>`;

  valorFaturaPendenteAtual = Math.max(0, totalFaturaCartao - totalPagamentosFatura);
  const totalSaidasTotaisConta = totalSaidasDiretasSemFatura + totalPagamentosFatura;
  
  saldoLivreMemoria = calcularSaldoLivre(totalEntradas, totalSaidasDiretasSemFatura, totalPagamentosFatura, valorFaturaPendenteAtual);

  elEntradas.textContent = formatarMoeda(totalEntradas);
  elSaidas.textContent = formatarMoeda(totalSaidasTotaisConta);
  elFaturaCartao.textContent = formatarMoeda(totalFaturaCartao);
  elSaldo.textContent = formatarMoeda(saldoLivreMemoria);

  // Renderização dos Envelopes
  listaEnvelopes.innerHTML = "";
  const grupos = {};

  Object.keys(envelopesConfig).forEach(catId => {
    const cat = envelopesConfig[catId];
    const macro = cat.macro || "Reservas & Outros";
    if (!grupos[macro]) grupos[macro] = [];
    grupos[macro].push({ id: catId, ...cat });
  });

  Object.keys(grupos).forEach(macroNome => {
    const grupoBloco = document.createElement('div');
    grupoBloco.className = "bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3";
    grupoBloco.innerHTML = `<span class="text-xs font-bold uppercase tracking-wider text-emerald-400">📁 ${macroNome}</span>`;

    const gridEnvelopes = document.createElement('div');
    gridEnvelopes.className = "grid grid-cols-1 md:grid-cols-2 gap-3";

    grupos[macroNome].forEach(env => {
      const gastoMes = acmCategoriasMes[env.id] || 0;
      const pct = env.teto > 0 ? Math.min(Math.round((gastoMes / env.teto) * 100), 100) : 0;

      const envCard = document.createElement('div');
      envCard.className = "bg-slate-900/60 border border-slate-800 p-3 rounded-lg space-y-2";
      envCard.innerHTML = `
        <div class="flex justify-between items-center text-xs">
          <span class="font-medium text-slate-200">${env.nome}</span>
          <span class="font-mono text-emerald-400">${formatarMoeda(gastoMes)} / ${formatarMoeda(env.teto)}</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div class="bg-emerald-500 h-2 rounded-full" style="width: ${pct}%"></div>
        </div>
      `;
      gridEnvelopes.appendChild(envCard);
    });

    grupoBloco.appendChild(gridEnvelopes);
    listaEnvelopes.appendChild(grupoBloco);
  });
}

// Submissão do Formulário de Lançamento
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
    resetarFormulario();
  });
}

// Modal de Fechamento
function abrirModalFechamento() {
  txtFechamentoMesRef.textContent = filtroMesInput.value;
  txtFechamentoSaldoSobra.textContent = formatarMoeda(saldoLivreMemoria);
  definirValorMascara(inputValorAporteSobra, Math.max(0, saldoLivreMemoria));

  selectCaixinhaDestino.innerHTML = "";
  Object.keys(envelopesConfig).filter(id => envelopesConfig[id].is_sinking_fund).forEach(catId => {
    const opt = document.createElement('option');
    opt.value = catId;
    opt.textContent = `🧰 ${envelopesConfig[catId].nome}`;
    selectCaixinhaDestino.appendChild(opt);
  });

  modalFechamentoMes.classList.remove('hidden');
}

if (btnAbrirFechamentoMes) btnAbrirFechamentoMes.addEventListener('click', abrirModalFechamento);
if (btnFecharModalFechamento) btnFecharModalFechamento.addEventListener('click', () => modalFechamentoMes.classList.add('hidden'));

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

// Subscrições do Firebase
onSnapshot(collection(db, "categories"), (snapshot) => {
  envelopesConfig = {};
  selectCategoria.innerHTML = "";
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    envelopesConfig[docSnap.id] = data;
    const opt = document.createElement('option');
    opt.value = docSnap.id;
    opt.textContent = data.nome;
    selectCategoria.appendChild(opt);
  });
  processarDados();
});

const q = query(collection(db, "transactions"), orderBy("date", "desc"));
onSnapshot(q, (snapshot) => {
  snapshotTransactions = snapshot;
  processarDados();
});