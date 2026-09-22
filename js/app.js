import { db, collection, onSnapshot, query, orderBy } from "./firebase-config.js";
import { formatarMoeda, aplicarMascaraMoeda, obterValorNumericoMascara, definirValorMascara } from "./core/formatters.js";
import { calcularMetricasOrcamento, calcularVelocimetroPacing, calcularSaldoLivre } from "./core/engine.js";
import {
  salvarTransacao,
  removerTransacao,
  sincronizarTudoGoogleSheets,
  obterFechamentosExistentes,
  removerFechamentoAnterior,
  processarFechamentoMultiplosDestinos
} from "./core/transactions.js";
import { restaurarCategoriasPadrao, salvarCategoria, removerCategoria, agruparPorMacroGrupo } from "./core/envelopes.js";
import { restaurarContasPadrao, salvarConta, removerConta } from "./core/accounts.js";
import { renderizarGraficoMacroGrupos, renderizarGraficoOrcadoVsRealizado, renderizarGraficoHistoricoMensal } from "./core/charts.js";
import {
  atualizarCardsSaldo,
  renderizarExtrato,
  atualizarSelectsCategorias,
  renderizarEnvelopesAgrupados,
  atualizarMargemEManobraUI,
  atualizarVelocimetroPacingUI,
  atualizarSelectsContas,
  renderizarListaGerenciadorContas
} from "./core/ui.js";
import { gerarRelatorioPDF } from "./core/reports.js";

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

let saldoLivreMemoria = 0;
let envelopesConfig = {};
let contasConfig = {};
let snapshotTransactions = null;
let valorFaturaPendenteAtual = 0;

// 📌 [Metadados de Build e Versão de Desenvolvimento]
const APP_VERSION = "v2.6.12"; // A build.py cuidará do incremento na publicação
const APP_BUILD_TIME = "22/09/2026 - 09:02";

const elVersao = document.getElementById('app-version-display');
if (elVersao) elVersao.textContent = APP_VERSION;
const elBuild = document.getElementById('app-build-date');
if (elBuild) elBuild.textContent = APP_BUILD_TIME;

// Elementos DOM
const filtroMesInput = document.getElementById('filtro-mes');
const formTransacao = document.getElementById('form-transacao');
const formCategoria = document.getElementById('form-categoria');
const formFechamentoMes = document.getElementById('form-fechamento-mes');
const formConta = document.getElementById('form-conta');
const modalFechamentoMes = document.getElementById('modal-fechamento-mes');

// Inicialização de Máscaras
aplicarMascaraMoeda(document.getElementById('valor'));
aplicarMascaraMoeda(document.getElementById('cat-teto'));

const inputAporteSobra = document.getElementById('input-valor-aporte-sobra');
if (inputAporteSobra) aplicarMascaraMoeda(inputAporteSobra);

if (filtroMesInput) filtroMesInput.value = `${anoAtual}-${mesAtual}`;
const inputData = document.getElementById('data');
if (inputData) inputData.value = hoje.toISOString().split('T')[0];

// Centralizador Unificado de Escutadores de Eventos
function inicializarEscutadoresDeEventos() {
  document.getElementById('btn-mes-anterior')?.addEventListener('click', () => alterarMes(-1));
  document.getElementById('btn-mes-proximo')?.addEventListener('click', () => alterarMes(1));
  document.getElementById('btn-abrir-picker')?.addEventListener('click', () => {
    if ('showPicker' in filtroMesInput) filtroMesInput.showPicker();
    else filtroMesInput.focus();
  });
  filtroMesInput?.addEventListener('change', processarDados);

  document.getElementById('btn-sincronizar-sheets-lote')?.addEventListener('click', () => {
    sincronizarTudoGoogleSheets(snapshotTransactions);
  });

  document.getElementById('btn-forcar-atualizacao')?.addEventListener('click', async () => {
    if (confirm("Deseja forçar a limpeza de cache do navegador e recarregar a versão mais recente?")) {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      window.location.reload(true);
    }
  });

  document.getElementById('btn-add-destino-fechamento')?.addEventListener('click', () => {
    criarLinhaAlocacaoDOM(Date.now(), 0);
  });

  document.getElementById('btn-toggle-gerenciar-cat')?.addEventListener('click', () => {
    document.getElementById('painel-gerenciar-categorias')?.classList.toggle('aberto');
  });
  document.getElementById('btn-restaurar-padroes')?.addEventListener('click', async () => {
    if (confirm("Restaurar os envelopes padrão da Casita?")) await restaurarCategoriasPadrao();
  });
  document.getElementById('btn-cancelar-cat')?.addEventListener('click', resetarFormCategoria);

  document.getElementById('btn-toggle-gerenciar-contas')?.addEventListener('click', () => {
    document.getElementById('painel-gerenciar-contas')?.classList.toggle('aberto');
  });
  document.getElementById('btn-cancelar-conta')?.addEventListener('click', resetarFormConta);

  document.getElementById('btn-abrir-fechamento-mes')?.addEventListener('click', abrirModalFechamento);
  document.getElementById('btn-fechar-modal-fechamento')?.addEventListener('click', fecharModalFechamento);
  document.getElementById('btn-cancelar-fechamento')?.addEventListener('click', fecharModalFechamento);
  document.getElementById('btn-quitar-fatura')?.addEventListener('click', executarQuitacaoFatura);
  document.getElementById('btn-cancelar-edicao')?.addEventListener('click', resetarFormTransacao);

  ['busca-extrato', 'filtro-usuario-extrato', 'filtro-conta-extrato', 'filtro-tipo-extrato'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', processarDados);
      el.addEventListener('change', processarDados);
    }
  });

  if (formTransacao) formTransacao.addEventListener('submit', submeterTransacao);
  if (formCategoria) formCategoria.addEventListener('submit', submeterCategoria);
  if (formFechamentoMes) formFechamentoMes.addEventListener('submit', submeterFechamentoMes);
  if (formConta) formConta.addEventListener('submit', submeterConta);

  document.getElementById('btn-exportar-pdf')?.addEventListener('click', executarExportacaoPDF);

  // 📌 Fase 4: Delegação de Eventos (Event Delegation Centralizado)
  document.getElementById('lista-transacoes')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const ds = btn.dataset;
    if (ds.action === 'edit-txn') prepararEdicao(ds.id, ds.date, ds.type, ds.amount, ds.desc, ds.cat, ds.acc, ds.user);
    if (ds.action === 'delete-txn') excluirTransacao(ds.id, ds.desc);
  });

  document.getElementById('lista-gerenciador-categorias')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const ds = btn.dataset;
    if (ds.action === 'edit-cat') prepararEdicaoCat(ds.id, ds.nome, ds.teto, ds.macro, ds.rigidez, ds.acumulativa === 'true');
    if (ds.action === 'delete-cat') excluirCat(ds.id, ds.nome);
  });

  document.getElementById('lista-gerenciador-contas')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const ds = btn.dataset;
    if (ds.action === 'edit-acc') prepararEdicaoConta(ds.id, ds.nome, ds.tipo);
    if (ds.action === 'delete-acc') excluirConta(ds.id, ds.nome);
  });
}

async function executarExportacaoPDF() {
  if (!snapshotTransactions) {
    alert("Aguarde o carregamento dos dados para gerar o relatório.");
    return;
  }

  const mesSel = filtroMesInput.value;
  let totalEntradas = 0, totalSaidasDiretas = 0, totalFatura = 0, totalPagtoFatura = 0;
  const itensExibicao = [];

  snapshotTransactions.forEach(docSnap => {
    const item = docSnap.data();
    if (!item.date) return;

    const itemMes = item.date.substring(0, 7);
    if (itemMes !== mesSel) return;

    const isSaida = item.type === "SAIDA";
    const contaObj = contasConfig[item.account_id];
    const isCartao = contaObj ? contaObj.tipo === "CARTAO" : item.account_id === "ACC_CARTAO_CREDITO";
    const isPagto = item.category_id === "CAT_FATURA_CARTAO";

    if (isSaida) {
      if (isCartao) totalFatura += item.amount;
      else if (isPagto) totalPagtoFatura += item.amount;
      else totalSaidasDiretas += item.amount;
    } else {
      totalEntradas += item.amount;
    }

    itensExibicao.push({ id: docSnap.id, item });
  });

  itensExibicao.sort((a, b) => a.item.date.localeCompare(b.item.date));

  const valorFaturaPendente = Math.max(0, totalFatura - totalPagtoFatura);
  const saldoLivre = calcularSaldoLivre(totalEntradas, totalSaidasDiretas, totalPagtoFatura, valorFaturaPendente);

  await gerarRelatorioPDF(mesSel, totalEntradas, totalSaidasDiretas + totalPagtoFatura, totalFatura, saldoLivre, itensExibicao, envelopesConfig);
}

function fecharModalFechamento() {
  modalFechamentoMes?.classList.add('hidden');
}

function alterarMes(delta) {
  const [ano, mes] = filtroMesInput.value.split('-').map(Number);
  const novaData = new Date(ano, mes - 1 + delta, 1);
  filtroMesInput.value = `${novaData.getFullYear()}-${String(novaData.getMonth() + 1).padStart(2, '0')}`;
  processarDados();
}

function resetarFormTransacao() {
  document.getElementById('transacao-id').value = "";
  formTransacao.reset();
  definirValorMascara(document.getElementById('valor'), 0);
  document.getElementById('data').value = new Date().toISOString().split('T')[0];
  document.getElementById('titulo-form').textContent = "Novo Lançamento";
  document.getElementById('btn-cancelar-edicao').classList.add('hidden');
}

function resetarFormCategoria() {
  document.getElementById('cat-id').value = "";
  formCategoria.reset();
  definirValorMascara(document.getElementById('cat-teto'), 0);
  document.getElementById('cat-acumulativa').checked = false;
  document.getElementById('cat-rigidez').value = "RIGIDO";
  document.getElementById('titulo-form-cat').textContent = "Novo Envelope / Categoria";
  document.getElementById('btn-cancelar-cat').classList.add('hidden');
}

function resetarFormConta() {
  document.getElementById('conta-id').value = "";
  if (formConta) formConta.reset();
  document.getElementById('titulo-form-conta').textContent = "Nova Conta / Cartão";
  document.getElementById('btn-cancelar-conta').classList.add('hidden');
}

// 📌 Fase 4: Funções tornadas Locais (Removidas do escopo 'window')
function prepararEdicao(id, data, tipo, valor, descricao, categoria, conta, usuario) {
  document.getElementById('transacao-id').value = id;
  document.getElementById('data').value = data;
  document.getElementById('tipo').value = tipo;
  definirValorMascara(document.getElementById('valor'), parseFloat(valor));
  document.getElementById('descricao').value = descricao;
  document.getElementById('categoria').value = categoria;
  document.getElementById('conta').value = conta;
  document.getElementById('usuario').value = usuario;
  document.getElementById('titulo-form').textContent = "Editar Lançamento";
  document.getElementById('btn-cancelar-edicao').classList.remove('hidden');
  document.getElementById('secao-formulario').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function excluirTransacao(id, descricao) {
  if (confirm(`Deseja realmente excluir "${descricao}"?`)) await removerTransacao(id);
}

function prepararEdicaoCat(id, nome, teto, macro, rigidez, isAcumulativa) {
  document.getElementById('cat-id').value = id;
  document.getElementById('cat-nome').value = nome;
  definirValorMascara(document.getElementById('cat-teto'), parseFloat(teto));
  document.getElementById('cat-macro').value = macro || "Reservas & Outros";
  document.getElementById('cat-rigidez').value = rigidez || "RIGIDO";
  document.getElementById('cat-acumulativa').checked = isAcumulativa;
  document.getElementById('titulo-form-cat').textContent = "Editar Envelope / Categoria";
  document.getElementById('btn-cancelar-cat').classList.remove('hidden');
}

async function excluirCat(id, nome) {
  if (confirm(`Deseja excluir a categoria "${nome}"?`)) {
    const success = await removerCategoria(id);
    if (success) alert(`Envelope "${nome}" removido com sucesso.`);
  }
}

function prepararEdicaoConta(id, nome, tipo) {
  document.getElementById('conta-id').value = id;
  document.getElementById('conta-nome').value = nome;
  document.getElementById('conta-tipo').value = tipo;
  document.getElementById('titulo-form-conta').textContent = "Editar Conta / Cartão";
  document.getElementById('btn-cancelar-conta').classList.remove('hidden');
}

async function excluirConta(id, nome) {
  if (confirm(`Deseja excluir a conta "${nome}"?`)) {
    const success = await removerConta(id);
    if (success) alert(`Conta "${nome}" removida com sucesso.`);
  }
}

async function submeterTransacao(e) {
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
  resetarFormTransacao();
}

async function submeterCategoria(e) {
  e.preventDefault();
  const catId = document.getElementById('cat-id').value;
  await salvarCategoria(catId, {
    nome: document.getElementById('cat-nome').value.trim(),
    teto: obterValorNumericoMascara(document.getElementById('cat-teto')),
    macro_grupo: document.getElementById('cat-macro').value,
    rigidez: document.getElementById('cat-rigidez').value,
    is_sinking_fund: document.getElementById('cat-acumulativa').checked
  });
  resetarFormCategoria();
}

function criarLinhaAlocacaoDOM(idLinha, valorPadrao = 0) {
  const container = document.getElementById('container-linhas-alocacao');
  if (!container) return;

  const row = document.createElement('div');
  row.className = "flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 item-alocacao-row";
  row.dataset.idLinha = idLinha;

  const caixinhas = Object.keys(envelopesConfig).filter(id => envelopesConfig[id].is_sinking_fund);
  let optionsHtml = `<option value="ROLLOVER">🔄 Rollover p/ Próx. Mês</option>`;
  caixinhas.forEach(catId => {
    optionsHtml += `<option value="${catId}">🧰 ${envelopesConfig[catId].nome}</option>`;
  });

  row.innerHTML = `
    <select class="select-destino-tipo w-1/2 bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:outline-none">
      ${optionsHtml}
    </select>
    <input type="text" inputmode="numeric" class="input-destino-valor w-1/2 bg-slate-900 border border-slate-700 rounded p-1.5 text-xs font-mono text-emerald-400 font-bold focus:outline-none" placeholder="R$ 0,00">
    <button type="button" class="btn-remover-linha-alocacao text-slate-500 hover:text-rose-400 text-xs px-1">✕</button>
  `;

  container.appendChild(row);

  const inputValor = row.querySelector('.input-destino-valor');
  aplicarMascaraMoeda(inputValor);
  if (valorPadrao > 0) definirValorMascara(inputValor, valorPadrao);

  inputValor.addEventListener('input', recalcularBalançoFechamento);
  row.querySelector('.select-destino-tipo').addEventListener('change', recalcularBalançoFechamento);
  row.querySelector('.btn-remover-linha-alocacao').addEventListener('click', () => {
    row.remove();
    recalcularBalançoFechamento();
  });

  recalcularBalançoFechamento();
}

function recalcularBalançoFechamento() {
  const sobraTotal = Math.max(0, saldoLivreMemoria);
  let totalAlocado = 0;

  document.querySelectorAll('.item-alocacao-row').forEach(row => {
    const inputVal = row.querySelector('.input-destino-valor');
    totalAlocado += obterValorNumericoMascara(inputVal);
  });

  const pendente = sobraTotal - totalAlocado;

  const elSobra = document.getElementById('txt-fechamento-sobra-total');
  if (elSobra) elSobra.textContent = formatarMoeda(sobraTotal);

  const elAlocado = document.getElementById('txt-fechamento-alocado');
  if (elAlocado) elAlocado.textContent = formatarMoeda(totalAlocado);

  const elPendente = document.getElementById('txt-fechamento-pendente');
  if (elPendente) elPendente.textContent = formatarMoeda(pendente);

  const btnConfirmar = document.getElementById('btn-confirmar-fechamento');

  if (Math.abs(pendente) < 0.01 && totalAlocado > 0) {
    if (elPendente) elPendente.className = "text-xs font-bold text-emerald-400";
    if (btnConfirmar) btnConfirmar.disabled = false;
  } else {
    if (elPendente) elPendente.className = "text-xs font-bold text-amber-400";
    if (btnConfirmar) btnConfirmar.disabled = true;
  }
}

function abrirModalFechamento() {
  const mesSel = filtroMesInput.value;
  const containerLinhas = document.getElementById('container-linhas-alocacao');
  if (containerLinhas) containerLinhas.innerHTML = "";

  const boxAlerta = document.getElementById('box-alerta-fatura-pendente');
  if (boxAlerta) {
    if (valorFaturaPendenteAtual > 0) boxAlerta.classList.remove('hidden');
    else boxAlerta.classList.add('hidden');
  }

  const fechamentosExistentes = obterFechamentosExistentes(snapshotTransactions, mesSel);
  const boxJaFechado = document.getElementById('box-alerta-ja-fechado');
  const btnConfirmar = document.getElementById('btn-confirmar-fechamento');

  if (fechamentosExistentes.length > 0) {
    boxJaFechado?.classList.remove('hidden');
    if (btnConfirmar) btnConfirmar.disabled = true;

    const btnDesfazer = document.getElementById('btn-desfazer-fechamento');
    if (btnDesfazer) {
      btnDesfazer.onclick = async () => {
        if (confirm(`Deseja realmente desfazer o fechamento de ${mesSel} e remover os ${fechamentosExistentes.length} lançamentos gerados?`)) {
          await removerFechamentoAnterior(fechamentosExistentes);
          alert("Fechamento anterior desfeito com sucesso! O mês foi reaberto.");
          fecharModalFechamento();
        }
      };
    }
  } else {
    boxJaFechado?.classList.add('hidden');
    criarLinhaAlocacaoDOM(Date.now(), Math.max(0, saldoLivreMemoria));
  }

  modalFechamentoMes?.classList.remove('hidden');
}

async function submeterFechamentoMes(e) {
  e.preventDefault();
  const mesSel = filtroMesInput.value;
  const contaDebitoId = document.getElementById('select-conta-pagadora-fatura')?.value || document.getElementById('conta')?.value || "ACC_BRADESCO_ABNER";

  const mapaAlocacoes = {};

  document.querySelectorAll('.item-alocacao-row').forEach(row => {
    const tipoCat = row.querySelector('.select-destino-tipo').value;
    const valor = obterValorNumericoMascara(row.querySelector('.input-destino-valor'));

    if (valor > 0) {
      if (!mapaAlocacoes[tipoCat]) {
        if (tipoCat === 'ROLLOVER') {
          mapaAlocacoes[tipoCat] = { tipo: 'ROLLOVER', catDestinoId: 'CAT_RESERVAS', valor: 0 };
        } else {
          const nomeCaixinha = envelopesConfig[tipoCat]?.nome || "Caixinha";
          mapaAlocacoes[tipoCat] = { tipo: 'CAIXINHA', catDestinoId: tipoCat, valor: 0, nomeCaixinha };
        }
      }
      mapaAlocacoes[tipoCat].valor += valor;
    }
  });

  const alocacoes = Object.values(mapaAlocacoes);

  if (alocacoes.length === 0) {
    alert("Adicione ao menos um destino válido com valor maior que zero.");
    return;
  }

  await processarFechamentoMultiplosDestinos(mesSel, alocacoes, document.getElementById('usuario').value, contaDebitoId);
  fecharModalFechamento();
  alert(`Fechamento de ${mesSel} concluído! ${alocacoes.length} lançamento(s) consolidado(s) gravado(s).`);
}

async function submeterConta(e) {
  e.preventDefault();
  const id = document.getElementById('conta-id').value;
  await salvarConta(id, {
    nome: document.getElementById('conta-nome').value.trim(),
    tipo: document.getElementById('conta-tipo').value
  });
  resetarFormConta();
}

async function executarQuitacaoFatura() {
  if (valorFaturaPendenteAtual <= 0) return;
  const mesSel = filtroMesInput.value;
  const contaPagadoraId = document.getElementById('select-conta-pagadora-fatura')?.value || document.getElementById('conta')?.value;

  if (!contaPagadoraId) {
    alert("Selecione uma conta corrente válida para debitar o pagamento da fatura.");
    return;
  }

  const nomeConta = contasConfig[contaPagadoraId]?.nome || "Conta Corrente";

  if (confirm(`Confirmar quitação da fatura de ${formatarMoeda(valorFaturaPendenteAtual)} debitando de "${nomeConta}"?`)) {
    const [anoSel, mSel] = mesSel.split('-').map(Number);
    const ultimoDia = new Date(anoSel, mSel, 0).getDate();

    await salvarTransacao("", {
      date: `${mesSel}-${String(ultimoDia).padStart(2, '0')}`,
      type: "SAIDA",
      amount: valorFaturaPendenteAtual,
      description: `Quitação Fatura Cartão (${mesSel})`,
      category_id: "CAT_FATURA_CARTAO",
      account_id: contaPagadoraId,
      status: "VALIDATED",
      user_owner: document.getElementById('usuario').value || "Abner",
      source_satellite: "core_dimdim",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
}

function processarDados() {
  if (!snapshotTransactions) return;
  const mesSel = filtroMesInput.value;
  const anoSel = mesSel.substring(0, 4);

  let totalEntradas = 0, totalSaidasDiretas = 0, totalFatura = 0, totalPagtoFatura = 0;
  const acmCatMes = {}, acmHistMes = {}, acmCatSaidaHist = {}, acmCatEntradaHist = {};
  const itensExibicao = [];

  const termoBusca = document.getElementById('busca-extrato')?.value.toLowerCase().trim() || "";
  const usrFiltro = document.getElementById('filtro-usuario-extrato')?.value || "TODOS";
  const contaFiltro = document.getElementById('filtro-conta-extrato')?.value || "TODAS";
  const tipoFiltro = document.getElementById('filtro-tipo-extrato')?.value || "TODOS";

  snapshotTransactions.forEach(docSnap => {
    const item = docSnap.data();
    const id = docSnap.id;
    if (!item.date) return;

    const itemMes = item.date.substring(0, 7);
    const isSaida = item.type === "SAIDA";
    const contaObj = contasConfig[item.account_id];
    const isCartao = contaObj ? contaObj.tipo === "CARTAO" : item.account_id === "ACC_CARTAO_CREDITO";
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

  const btnQuitar = document.getElementById('btn-quitar-fatura');
  const badgeFatura = document.getElementById('badge-fatura-status');
  if (btnQuitar && badgeFatura) {
    if (totalFatura > 0 && valorFaturaPendenteAtual === 0) {
      badgeFatura.classList.remove('hidden');
      btnQuitar.classList.add('hidden');
    } else if (valorFaturaPendenteAtual > 0) {
      badgeFatura.classList.add('hidden');
      btnQuitar.classList.remove('hidden');
      btnQuitar.textContent = `💳 Quitar ${formatarMoeda(valorFaturaPendenteAtual)}`;
    } else {
      badgeFatura.classList.add('hidden');
      btnQuitar.classList.add('hidden');
    }
  }

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

  const metricas = calcularMetricasOrcamento(envelopesConfig, acmCatMes);
  const pacing = calcularVelocimetroPacing(mesSel, metricas.gastoFlexivelMes, metricas.tetoFlexivelTotal);

  atualizarMargemEManobraUI(
    document.getElementById('badge-diagnostico-margem'),
    document.getElementById('txt-raiox-margem'),
    document.getElementById('barra-rigido'),
    document.getElementById('barra-flexivel'),
    document.getElementById('txt-valor-rigido'),
    document.getElementById('txt-valor-flexivel'),
    metricas.tetoRigidoTotal,
    metricas.tetoFlexivelTotal
  );

  atualizarVelocimetroPacingUI(
    document.getElementById('badge-status-pacing'),
    document.getElementById('txt-status-pacing-mensagem'),
    document.getElementById('txt-pacing-tempo'),
    document.getElementById('barra-pacing-tempo'),
    document.getElementById('txt-pacing-consumo'),
    document.getElementById('barra-pacing-consumo'),
    pacing,
    metricas.gastoFlexivelMes,
    metricas.tetoFlexivelTotal
  );

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

inicializarEscutadoresDeEventos();

onSnapshot(collection(db, "accounts"), (snapshot) => {
  contasConfig = {};
  if (snapshot.empty) restaurarContasPadrao();
  snapshot.forEach(docSnap => contasConfig[docSnap.id] = docSnap.data());

  atualizarSelectsContas(
    document.getElementById('conta'),
    document.getElementById('filtro-conta-extrato'),
    document.getElementById('select-conta-pagadora-fatura'),
    contasConfig
  );

  renderizarListaGerenciadorContas(
    document.getElementById('lista-gerenciador-contas'),
    contasConfig
  );
  processarDados();
});

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