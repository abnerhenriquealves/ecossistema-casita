import { db, collection, onSnapshot, query, orderBy, deleteDoc, setDoc, doc, updateDoc, addDoc } from "./firebase-config.js";
import { formatarMoeda, aplicarMascaraMoeda, obterValorNumericoMascara, definirValorMascara } from "./core/formatters.js";
import { calcularMetricasOrcamento, calcularVelocimetroPacing, calcularSaldoLivre } from "./core/engine.js";
import { salvarTransacao, removerTransacao, processarFechamentoMes, sincronizarGoogleSheets } from "./core/transactions.js";
import { renderizarGraficoMacroGrupos, renderizarGraficoOrcadoVsRealizado, renderizarGraficoHistoricoMensal } from "./core/charts.js";
import { atualizarCardsSaldo, renderizarExtrato, atualizarSelectsCategorias, renderizarEnvelopesAgrupados } from "./core/ui.js";

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

let saldoLivreMemoria = 0;
let envelopesConfig = {};
let snapshotTransactions = null;
let valorFaturaPendenteAtual = 0;

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

// Busca e Filtros DOM
const buscaExtratoInput = document.getElementById('busca-extrato');
const filtroUsuarioExtrato = document.getElementById('filtro-usuario-extrato');
const filtroContaExtrato = document.getElementById('filtro-conta-extrato');
const filtroTipoExtrato = document.getElementById('filtro-tipo-extrato');
const contadorExtrato = document.getElementById('contador-extrato');

// Categorias e Envelopes DOM
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

// ESCUTADORES DE EVENTOS DE PAINEL E NAVEGAÇÃO
if (btnToggleGerenciarCat) {
  btnToggleGerenciarCat.addEventListener('click', () => {
    painelGerenciarCat.classList.toggle('aberto');
  });
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
if (filtroMesInput) filtroMesInput.addEventListener('change', processarDados);

[buscaExtratoInput, filtroUsuarioExtrato, filtroContaExtrato, filtroTipoExtrato].forEach(el => {
  if (el) {
    el.addEventListener('input', processarDados);
    el.addEventListener('change', processarDados);
  }
});

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

// HANDLERS GLOBAIS NO WINDOW PARA ACOES DO HTML
window.prepararEdicao = (id, data, tipo, valor, descricao, categoria, conta, usuario) => {
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
};

window.excluirTransacao = async (id, descricao) => {
  if (confirm(`Deseja realmente excluir o lançamento "${descricao}"?`)) {
    try {
      await removerTransacao(id);
    } catch (err) {
      alert("Erro ao excluir lançamento: " + err.message);
    }
  }
};

window.prepararEdicaoCat = (id, nome, teto, macro, rigidez, isAcumulativa) => {
  inputCatId.value = id;
  inputCatNome.value = nome;
  definirValorMascara(inputCatTeto, teto);
  selectCatMacro.value = macro || "Reservas & Outros";
  selectCatRigidez.value = rigidez || "RIGIDO";
  checkCatAcumulativa.checked = !!isAcumulativa;
  tituloFormCat.textContent = "Editar Envelope / Categoria";
  btnSalvarCat.textContent = "Atualizar Envelope";
  btnCancelarCat.classList.remove('hidden');
};

window.excluirCat = async (id, nome) => {
  if (confirm(`Deseja excluir a categoria "${nome}"?`)) {
    try {
      await deleteDoc(doc(db, "categories", id));
    } catch (err) {
      alert("Erro ao excluir categoria: " + err.message);
    }
  }
};

// CATEGORIAS E ENVELOPES: RESTAURACAO E SUBMISSAO
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

// QUITACAO DE FATURA DO CARTAO
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

// FECHAMENTO DE MES E MODAL
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

// PROCESSAMENTO CENTRAL DE DADOS E INTERFACE
function processarDados() {
  if (!snapshotTransactions) return;
  const mesSel = filtroMesInput.value;
  const anoSel = mesSel.substring(0, 4);

  let totalEntradas = 0, totalSaidasDiretas = 0, totalFatura = 0, totalPagtoFatura = 0;
  const acmCatMes = {}, acmHistMes = {}, acmCatSaidaHist = {}, acmCatEntradaHist = {};
  const itensExibicao = [];

  const termoBusca = buscaExtratoInput.value.toLowerCase().trim();
  const usrFiltro = filtroUsuarioExtrato.value;
  const contaFiltro = filtroContaExtrato.value;
  const tipoFiltro = filtroTipoExtrato.value;

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
      const usuarioItem = item.user_owner || 'Abner';

      if (isSaida) {
        if (isCartao) totalFatura += item.amount;
        else if (isPagto) totalPagtoFatura += item.amount;
        else totalSaidasDiretas += item.amount;
        if (!isPagto) acmCatMes[item.category_id] = (acmCatMes[item.category_id] || 0) + item.amount;
      } else {
        totalEntradas += item.amount;
      }

      const nomeCatExibicao = envelopesConfig[item.category_id]?.nome || (isPagto ? '💳 Quitação de Fatura' : item.category_id);
      const matchBusca = !termoBusca || item.description.toLowerCase().includes(termoBusca) || (nomeCatExibicao && nomeCatExibicao.toLowerCase().includes(termoBusca));
      const matchUsuario = usrFiltro === "TODOS" || usuarioItem === usrFiltro;
      const matchConta = contaFiltro === "TODAS" || item.account_id === contaFiltro;
      const matchTipo = tipoFiltro === "TODOS" || item.type === tipoFiltro;

      if (matchBusca && matchUsuario && matchConta && matchTipo) {
        itensExibicao.push({ id, item });
      }
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

  // AGRUPAMENTO DE MACRO-GRUPOS COM MAPPING CORRETO
  const gastosMacroGrafico = {};
  const tetosMacroGrafico = {};

  Object.keys(envelopesConfig).forEach(catId => {
    const cat = envelopesConfig[catId];
    const macroNome = cat.macro_grupo || cat.macro || "Reservas & Outros";

    if (!gastosMacroGrafico[macroNome]) gastosMacroGrafico[macroNome] = 0;
    if (!tetosMacroGrafico[macroNome]) tetosMacroGrafico[macroNome] = 0;

    gastosMacroGrafico[macroNome] += (acmCatMes[catId] || 0);
    tetosMacroGrafico[macroNome] += (cat.teto || 0);
  });

  renderizarEnvelopesAgrupados(listaEnvelopes, envelopesConfig, acmCatMes, acmCatSaidaHist, acmCatEntradaHist);
  renderizarGraficoMacroGrupos(gastosMacroGrafico);
  renderizarGraficoOrcadoVsRealizado(tetosMacroGrafico, gastosMacroGrafico);
  renderizarGraficoHistoricoMensal(acmHistMes);

  // PACING E RESUMO EXECUTIVO
  const metricas = calcularMetricasOrcamento(envelopesConfig, acmCatMes);
  const pacing = calcularVelocimetroPacing(mesSel, metricas.gastoFlexivelMes, metricas.tetoFlexivelTotal);

  if (txtPacingTempo) txtPacingTempo.textContent = `${pacing.pctTempo}% (Dia ${pacing.diasDecorridos}/${pacing.totalDiasNoMes})`;
  if (barraPacingTempo) barraPacingTempo.style.width = `${pacing.pctTempo}%`;
  if (txtPacingConsumo) txtPacingConsumo.textContent = `${formatarMoeda(metricas.gastoFlexivelMes)} / ${formatarMoeda(metricas.tetoFlexivelTotal)} (${pacing.pctConsumoFlexivel}%)`;
  if (barraPacingConsumo) barraPacingConsumo.style.width = `${Math.min(pacing.pctConsumoFlexivel, 100)}%`;

  const totalDespesasMes = totalSaidasDiretas + totalPagtoFatura + totalFatura;
  const pctComprometimento = totalEntradas > 0 ? Math.round((totalDespesasMes / totalEntradas) * 100) : 0;
  const resumoEl = document.getElementById('resumo-executivo-texto');
  if (resumoEl) {
    resumoEl.innerHTML = `
      <div class="flex justify-between items-center"><span class="text-slate-400">Total de Entradas:</span> <span class="font-mono font-bold text-emerald-400">${formatarMoeda(totalEntradas)}</span></div>
      <div class="flex justify-between items-center"><span class="text-slate-400">Total de Despesas (Conta + Cartão):</span> <span class="font-mono font-bold text-rose-400">${formatarMoeda(totalDespesasMes)}</span></div>
      <div class="flex justify-between items-center pt-1 border-t border-slate-800"><span class="text-slate-300 font-medium">Comprometimento da Renda:</span> <span class="font-mono font-bold text-amber-400">${pctComprometimento}%</span></div>
    `;
  }
}

// SUBMISSAO DE LANÇAMENTO
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
    resetarFormulario();
  });
}

// SUBSCRIÇÕES FIRESTORE
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