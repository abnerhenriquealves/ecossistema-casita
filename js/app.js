import { db, collection, onSnapshot, query, orderBy, setDoc, doc, updateDoc, deleteDoc, addDoc } from "./firebase-config.js";
import { formatarMoeda, aplicarMascaraMoeda, obterValorNumericoMascara, definirValorMascara } from "./core/formatters.js";
import { calcularMetricasOrcamento, calcularVelocimetroPacing, calcularSaldoLivre } from "./core/engine.js";
import { salvarTransacao, removerTransacao, processarFechamentoMes, sincronizarGoogleSheets } from "./core/transactions.js";
import { renderizarGraficoMacroGrupos, renderizarGraficoOrcadoVsRealizado, renderizarGraficoHistoricoMensal } from "./core/charts.js";

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

let saldoLivreMemoria = 0;
let envelopesConfig = {};
let snapshotTransactions = null;
let valorFaturaPendenteAtual = 0;

// Seletores do DOM
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

// Métricas DOM
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

// Filtros DOM
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

// Modal Fechamento DOM
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

// Aplicação de Máscaras Bancárias
aplicarMascaraMoeda(inputValorTransacao);
aplicarMascaraMoeda(inputCatTeto);
aplicarMascaraMoeda(inputValorAporteSobra);

// Handlers Globais para Ações do HTML (Edição e Exclusão)
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
      alert("Erro ao excluir lançamento: " + err.message);
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

// Eventos de Navegação e Filtros
[buscaExtratoInput, filtroUsuarioExtrato, filtroContaExtrato, filtroTipoExtrato].forEach(el => {
  if (el) {
    el.addEventListener('input', processarDados);
    el.addEventListener('change', processarDados);
  }
});

if (btnToggleGerenciarCat) {
  btnToggleGerenciarCat.addEventListener('click', () => painelGerenciarCat.classList.toggle('aberto'));
}

if (btnAbrirPicker) {
  btnAbrirPicker.addEventListener('click', () => {
    if ('showPicker' in filtroMesInput) filtroMesInput.showPicker();
    else filtroMesInput.focus();
  });
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

function resetarFormCategoria() {
  inputCatId.value = "";
  formCategoria.reset();
  definirValorMascara(inputCatTeto, 0);
  checkCatAcumulativa.checked = false;
  selectCatRigidez.value = "RIGIDO";
  tituloFormCat.textContent = "Novo Envelope / Categoria";
  btnSalvarCat.textContent = "Salvar Envelope";
  btnCancelarCat.classList.add('hidden');
}

if (btnCancelarEdicao) btnCancelarEdicao.addEventListener('click', resetarFormulario);
if (btnCancelarCat) btnCancelarCat.addEventListener('click', resetarFormCategoria);

// Semente dos Envelopes Padrão
async function restaurarCategoriasPadrao() {
  const padroes = [
    { id: "CAT_DIZIMO", nome: "Dízimo & Ofertas", teto: 600.00, macro: "Fé", rigidez: "RIGIDO", is_sinking_fund: false },
    { id: "CAT_CASITA_PREST", nome: "Prestação Casita", teto: 2000.00, macro: "Habitação & Custos Fixos", rigidez: "RIGIDO", is_sinking_fund: false },
    { id: "CAT_MERCADO", nome: "Supermercado", teto: 1500.00, macro: "Alimentação & Social", rigidez: "FLEXIVEL", is_sinking_fund: false },
    { id: "CAT_COMBUSTIVEL", nome: "Combustível", teto: 500.00, macro: "Transporte", rigidez: "FLEXIVEL", is_sinking_fund: false },
    { id: "CAT_PETS", nome: "Ração, Banho & Pets", teto: 400.00, macro: "Nossos Meninos (Pets)", rigidez: "RIGIDO", is_sinking_fund: false },
    { id: "CAT_MANUT_CASITA", nome: "Caixinha Manutenção da Casita", teto: 1000.00, macro: "Habitação & Custos Fixos", rigidez: "FLEXIVEL", is_sinking_fund: true }
  ];

  for (const cat of padroes) {
    await setDoc(doc(db, "categories", cat.id), {
      nome: cat.nome,
      teto: cat.teto,
      macro_grupo: cat.macro,
      rigidez: cat.rigidez,
      is_sinking_fund: cat.is_sinking_fund,
      created_at: new Date().toISOString()
    });
  }
}

if (btnRestaurarPadroes) {
  btnRestaurarPadroes.addEventListener('click', async () => {
    if (confirm("Deseja restaurar os envelopes padrão da Casita organizados por Macro-Grupos?")) {
      await restaurarCategoriasPadrao();
    }
  });
}

// Submissão do Formulário de Categoria
if (formCategoria) {
  formCategoria.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnSalvarCat.disabled = true;

    const catId = inputCatId.value;
    const nome = inputCatNome.value.trim();
    const teto = obterValorNumericoMascara(inputCatTeto);
    const macro = selectCatMacro.value;
    const rigidez = selectCatRigidez.value;
    const isAcumulativa = checkCatAcumulativa.checked;

    try {
      if (catId) {
        await updateDoc(doc(db, "categories", catId), { 
          nome, teto, macro_grupo: macro, rigidez, is_sinking_fund: isAcumulativa, updated_at: new Date().toISOString() 
        });
      } else {
        const novoId = "CAT_" + nome.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_" + Date.now();
        await setDoc(doc(db, "categories", novoId), { 
          nome, teto, macro_grupo: macro, rigidez, is_sinking_fund: isAcumulativa, created_at: new Date().toISOString() 
        });
      }
      resetarFormCategoria();
    } catch (err) {
      alert("Erro ao salvar categoria: " + err.message);
    } finally {
      btnSalvarCat.disabled = false;
    }
  });
}

// Quitação da Fatura
if (btnQuitarFatura) {
  btnQuitarFatura.addEventListener('click', async () => {
    if (valorFaturaPendenteAtual <= 0) return;
    const mesSel = filtroMesInput.value;
    if (confirm(`Confirmar o pagamento da fatura no valor de ${formatarMoeda(valorFaturaPendenteAtual)} debitando da Conta Corrente?`)) {
      btnQuitarFatura.disabled = true;
      btnQuitarFatura.textContent = "Processando quitação...";

      const [anoSel, mSel] = mesSel.split('-').map(Number);
      const ultimoDiaMes = new Date(anoSel, mSel, 0).getDate();
      const dataQuitacao = `${mesSel}-${String(ultimoDiaMes).padStart(2, '0')}`;

      const dadosTransacao = {
        date: dataQuitacao,
        type: "SAIDA",
        amount: valorFaturaPendenteAtual,
        description: `Quitação Fatura Cartão (${mesSel})`,
        category_id: "CAT_FATURA_CARTAO",
        account_id: "ACC_BRADESCO_ABNER",
        status: "VALIDATED",
        user_owner: document.getElementById('usuario').value || "Abner",
        source_satellite: "core_dimdim",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        const docRef = await addDoc(collection(db, "transactions"), dadosTransacao);
        sincronizarGoogleSheets({ action: "UPSERT", id: docRef.id, ...dadosTransacao });
      } catch (err) {
        alert("Erro ao quitar fatura: " + err.message);
      } finally {
        btnQuitarFatura.disabled = false;
      }
    }
  });
}

// Processador Central de Dados e Interface
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
  const acumuladoHistoricoPorMes = {};

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

    const itemAno = item.date.substring(0, 4);
    const itemMesChave = item.date.substring(5, 7);
    const itemMesFormatado = item.date.substring(0, 7);

    const isAteMesSelecionado = itemMesFormatado <= mesSelecionado;
    const isMesAtual = itemMesFormatado === mesSelecionado;
    const isSaida = item.type === "SAIDA";
    const isCartao = item.account_id === "ACC_CARTAO_CREDITO";
    const isPagtoFatura = item.category_id === "CAT_FATURA_CARTAO";

    if (itemAno === anoSelecionado && isSaida && !isPagtoFatura) {
      acumuladoHistoricoPorMes[itemMesChave] = (acumuladoHistoricoPorMes[itemMesChave] || 0) + item.amount;
    }

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

  if (totalItensMes === 0) contadorExtrato.textContent = "Nenhum lançamento no mês";
  else contadorExtrato.textContent = `Exibindo ${totalItensExibidos} de ${totalItensMes} lançamentos`;

  valorFaturaPendenteAtual = Math.max(0, totalFaturaCartao - totalPagamentosFatura);
  const faturaEstaQuitada = totalFaturaCartao > 0 && valorFaturaPendenteAtual === 0;

  if (faturaEstaQuitada) {
    badgeFaturaStatus.classList.remove('hidden');
    btnQuitarFatura.classList.add('hidden');
  } else if (valorFaturaPendenteAtual > 0) {
    badgeFaturaStatus.classList.add('hidden');
    btnQuitarFatura.classList.remove('hidden');
    btnQuitarFatura.classList.add('flex');
    btnQuitarFatura.textContent = `💳 Quitar ${formatarMoeda(valorFaturaPendenteAtual)}`;
  } else {
    badgeFaturaStatus.classList.add('hidden');
    btnQuitarFatura.classList.add('hidden');
  }

  const totalSaidasTotaisConta = totalSaidasDiretasSemFatura + totalPagamentosFatura;
  saldoLivreMemoria = calcularSaldoLivre(totalEntradas, totalSaidasDiretasSemFatura, totalPagamentosFatura, valorFaturaPendenteAtual);

  elEntradas.textContent = formatarMoeda(totalEntradas);
  elSaidas.textContent = formatarMoeda(totalSaidasTotaisConta);
  elFaturaCartao.textContent = formatarMoeda(totalFaturaCartao);
  elSaldo.textContent = formatarMoeda(saldoLivreMemoria);

  // Renderização dos Envelopes Orçamentários
  listaEnvelopes.innerHTML = "";
  const grupos = {};
  const gastosMacroGrafico = {};
  const tetosMacroGrafico = {};

  const metricas = calcularMetricasOrcamento(envelopesConfig, acmCategoriasMes);

  Object.keys(envelopesConfig).forEach(catId => {
    const cat = envelopesConfig[catId];
    const macro = cat.macro || "Reservas & Outros";
    if (!grupos[macro]) grupos[macro] = [];
    grupos[macro].push({ id: catId, ...cat });
  });

  Object.keys(grupos).forEach(macroNome => {
    const itensGrupo = grupos[macroNome];
    let totalGastoGrupoVisual = 0;
    let totalGastoGrupoMesReal = 0;
    let totalTetoGrupo = 0;

    itensGrupo.forEach(item => {
      const entradasCatHist = acmCategoriasHistEntrada[item.id] || 0;
      const saidasCatHist = acmCategoriasHistSaida[item.id] || 0;
      const gastoItemVisual = item.is_sinking_fund ? (saidasCatHist - entradasCatHist) : (acmCategoriasMes[item.id] || 0);

      totalGastoGrupoVisual += gastoItemVisual;
      totalGastoGrupoMesReal += (acmCategoriasMes[item.id] || 0);
      totalTetoGrupo += item.teto;
    });

    gastosMacroGrafico[macroNome] = totalGastoGrupoMesReal;
    tetosMacroGrafico[macroNome] = totalTetoGrupo;

    const grupoBloco = document.createElement('div');
    grupoBloco.className = "bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3";
    grupoBloco.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <span class="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">📁 ${macroNome}</span>
        <span class="text-xs font-mono text-slate-400">${formatarMoeda(totalGastoGrupoVisual)} / ${formatarMoeda(totalTetoGrupo)}</span>
      </div>
    `;

    const gridEnvelopes = document.createElement('div');
    gridEnvelopes.className = "grid grid-cols-1 md:grid-cols-2 gap-3";

    itensGrupo.forEach(env => {
      const gastoMes = acmCategoriasMes[env.id] || 0;
      const gastoHist = acmCategoriasHistSaida[env.id] || 0;
      const entradaHist = acmCategoriasHistEntrada[env.id] || 0;
      const isCaixinha = !!env.is_sinking_fund;
      const seloRigidez = env.rigidez === "FLEXIVEL" ? "🎈" : "📌";

      let pct = 0;
      let corBarra = "bg-emerald-500";
      let corTextoPct = "text-emerald-400";
      let textoValores = "";
      let badgeCaixinha = "";

      if (isCaixinha) {
        badgeCaixinha = `<span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold shrink-0">🧰 Caixinha</span>`;
        const saldoCaixinha = gastoHist - entradaHist;
        pct = env.teto > 0 ? Math.min(Math.round((saldoCaixinha / env.teto) * 100), 100) : 0;
        textoValores = `Saldo: ${formatarMoeda(saldoCaixinha)} / Meta: ${formatarMoeda(env.teto)}`;
      } else {
        pct = env.teto > 0 ? Math.min(Math.round((gastoMes / env.teto) * 100), 100) : 0;
        textoValores = `${formatarMoeda(gastoMes)} / ${formatarMoeda(env.teto)} (${pct}%)`;
      }

      if (pct >= 100) { corBarra = "bg-rose-500"; corTextoPct = "text-rose-400"; }
      else if (pct >= 80) { corBarra = "bg-amber-500"; corTextoPct = "text-amber-400"; }

      const envCard = document.createElement('div');
      envCard.className = "bg-slate-900/60 border border-slate-800 p-3 rounded-lg space-y-2";
      envCard.innerHTML = `
        <div class="flex justify-between items-center text-xs gap-2">
          <div class="flex items-center gap-1.5 overflow-hidden">
            <span>${seloRigidez}</span>
            <span class="font-medium text-slate-200 truncate">${env.nome}</span>
            ${badgeCaixinha}
          </div>
          <span class="font-semibold ${corTextoPct} font-mono">${textoValores}</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div class="${corBarra} h-2 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
        </div>
      `;
      gridEnvelopes.appendChild(envCard);
    });

    grupoBloco.appendChild(gridEnvelopes);
    listaEnvelopes.appendChild(grupoBloco);
  });

  // Cálculo da Margem de Manobra e Velocímetro (Pacing)
  const tetoGeralMetrica = metricas.tetoRigidoTotal + metricas.tetoFlexivelTotal;
  const pctRigido = tetoGeralMetrica > 0 ? Math.round((metricas.tetoRigidoTotal / tetoGeralMetrica) * 100) : 0;
  const pctFlexivel = tetoGeralMetrica > 0 ? (100 - pctRigido) : 0;

  if (barraRigido && barraFlexivel) {
    barraRigido.style.width = `${pctRigido}%`;
    barraFlexivel.style.width = `${pctFlexivel}%`;
  }

  if (txtValorRigido) txtValorRigido.textContent = `📌 Rígidos: ${formatarMoeda(metricas.tetoRigidoTotal)} (${pctRigido}%)`;
  if (txtValorFlexivel) txtValorFlexivel.textContent = `🎈 Flexíveis: ${formatarMoeda(metricas.tetoFlexivelTotal)} (${pctFlexivel}%)`;

  const pacing = calcularVelocimetroPacing(mesSelecionado, metricas.gastoFlexivelMes, metricas.tetoFlexivelTotal);

  if (txtPacingTempo) txtPacingTempo.textContent = `${pacing.pctTempo}% (Dia ${pacing.diasDecorridos}/${pacing.totalDiasNoMes})`;
  if (barraPacingTempo) barraPacingTempo.style.width = `${pacing.pctTempo}%`;

  if (txtPacingConsumo) txtPacingConsumo.textContent = `${formatarMoeda(metricas.gastoFlexivelMes)} / ${formatarMoeda(metricas.tetoFlexivelTotal)} (${pacing.pctConsumoFlexivel}%)`;
  if (barraPacingConsumo) barraPacingConsumo.style.width = `${Math.min(pacing.pctConsumoFlexivel, 100)}%`;

  // Renderização dos Gráficos Exclusivos via charts.js
  renderizarGraficoMacroGrupos(gastosMacroGrafico);
  renderizarGraficoOrcadoVsRealizado(tetosMacroGrafico, gastosMacroGrafico);
  renderizarGraficoHistoricoMensal(acumuladoHistoricoPorMes);

  const totalDespesasMes = totalSaidasTotaisConta + totalFaturaCartao;
  const pctComprometimento = totalEntradas > 0 ? Math.round((totalDespesasMes / totalEntradas) * 100) : 0;
  if (resumoExecutivoTexto) {
    resumoExecutivoTexto.innerHTML = `
      <div class="flex justify-between items-center"><span class="text-slate-400">Total de Entradas:</span> <span class="font-mono font-bold text-emerald-400">${formatarMoeda(totalEntradas)}</span></div>
      <div class="flex justify-between items-center"><span class="text-slate-400">Total de Despesas (Conta + Cartão):</span> <span class="font-mono font-bold text-rose-400">${formatarMoeda(totalDespesasMes)}</span></div>
      <div class="flex justify-between items-center pt-1 border-t border-slate-800"><span class="text-slate-300 font-medium">Comprometimento da Renda:</span> <span class="font-mono font-bold text-amber-400">${pctComprometimento}%</span></div>
    `;
  }
}

// Submissão de Lançamentos
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

// Modal e Submissão de Fechamento de Mês
function abrirModalFechamento() {
  txtFechamentoMesRef.textContent = filtroMesInput.value;
  txtFechamentoSaldoSobra.textContent = formatarMoeda(saldoLivreMemoria);
  definirValorMascara(inputValorAporteSobra, Math.max(0, saldoLivreMemoria));

  if (boxAlertaFaturaPendente) {
    if (valorFaturaPendenteAtual > 0) boxAlertaFaturaPendente.classList.remove('hidden');
    else boxAlertaFaturaPendente.classList.add('hidden');
  }

  selectCaixinhaDestino.innerHTML = "";
  const caixinhas = Object.keys(envelopesConfig).filter(id => envelopesConfig[id].is_sinking_fund);
  if (caixinhas.length === 0) {
    selectCaixinhaDestino.innerHTML = `<option value="">Nenhuma caixinha/reserva configurada</option>`;
  } else {
    caixinhas.forEach(catId => {
      const opt = document.createElement('option');
      opt.value = catId;
      opt.textContent = `🧰 ${envelopesConfig[catId].nome}`;
      selectCaixinhaDestino.appendChild(opt);
    });
  }

  modalFechamentoMes.classList.remove('hidden');
}

if (btnAbrirFechamentoMes) btnAbrirFechamentoMes.addEventListener('click', abrirModalFechamento);
if (btnFecharModalFechamento) btnFecharModalFechamento.addEventListener('click', () => modalFechamentoMes.classList.add('hidden'));
if (btnCancelarFechamento) btnCancelarFechamento.addEventListener('click', () => modalFechamentoMes.classList.add('hidden'));

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

// Subscrições do Firestore
onSnapshot(collection(db, "categories"), (snapshot) => {
  if (snapshot.empty) {
    restaurarCategoriasPadrao();
    return;
  }

  envelopesConfig = {};
  selectCategoria.innerHTML = "";
  listaGerenciadorCat.innerHTML = "";
  const gruposSelect = {};

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const id = docSnap.id;
    const macro = data.macro_grupo || "Reservas & Outros";
    const rigidez = data.rigidez || "RIGIDO";

    envelopesConfig[id] = { nome: data.nome, teto: data.teto, macro, rigidez, is_sinking_fund: !!data.is_sinking_fund };

    if (!gruposSelect[macro]) gruposSelect[macro] = [];
    gruposSelect[macro].push({ id, nome: data.nome, teto: data.teto, rigidez, is_sinking_fund: !!data.is_sinking_fund });

    const itemCat = document.createElement('div');
    itemCat.className = "flex items-center justify-between text-xs bg-slate-900 border border-slate-800 p-2 rounded";
    itemCat.innerHTML = `
      <span class="text-slate-200 font-medium">[${macro}] ${data.nome} - <span class="text-emerald-400 font-mono">${formatarMoeda(data.teto)}</span></span>
      <div class="flex items-center gap-2">
        <button onclick="prepararEdicaoCat('${id}', '${data.nome.replace(/'/g, "\\'")}', ${data.teto}, '${macro.replace(/'/g, "\\'")}', '${rigidez}', ${!!data.is_sinking_fund})" class="text-slate-400 hover:text-sky-400">✏️</button>
        <button onclick="excluirCat('${id}', '${data.nome.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-rose-400">🗑️</button>
      </div>
    `;
    listaGerenciadorCat.appendChild(itemCat);
  });

  Object.keys(gruposSelect).forEach(macroNome => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = `📁 ${macroNome}`;

    gruposSelect[macroNome].forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `${cat.rigidez === 'FLEXIVEL' ? '🎈' : '📌'} ${cat.is_sinking_fund ? '🧰 ' + cat.nome : cat.nome}`;
      optgroup.appendChild(opt);
    });

    selectCategoria.appendChild(optgroup);
  });

  const optFatura = document.createElement('option');
  optFatura.value = "CAT_FATURA_CARTAO";
  optFatura.textContent = "💳 Pagamento de Fatura do Cartão";
  selectCategoria.appendChild(optFatura);

  processarDados();
});

const q = query(collection(db, "transactions"), orderBy("date", "desc"));
onSnapshot(q, (snapshot) => {
  snapshotTransactions = snapshot;
  processarDados();
});