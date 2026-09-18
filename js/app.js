import { db, collection, addDoc, doc, updateDoc, deleteDoc, setDoc, onSnapshot, query, orderBy } from "./firebase-config.js";

// Endpoint Webhook do Google Apps Script (Sincronização com Google Sheets)
const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx18ow_I8Clf0K1hw4X3QnBQjfbfX2ZHLD__-sYuDqJPp37l0i0pPepAL4DG1Nzj0TS/exec";

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

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

// Elementos das Métricas Executivas Sem Gráfico
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

// Elementos da Busca e Filtros
const buscaExtratoInput = document.getElementById('busca-extrato');
const filtroUsuarioExtrato = document.getElementById('filtro-usuario-extrato');
const filtroContaExtrato = document.getElementById('filtro-conta-extrato');
const filtroTipoExtrato = document.getElementById('filtro-tipo-extrato');
const contadorExtrato = document.getElementById('contador-extrato');

// Elementos da Gestão de Categorias
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

// Elementos do Modal de Fechamento de Mês
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

let envelopesConfig = {};
let snapshotTransactions = null;
let valorFaturaPendenteAtual = 0;

let graficoMacroInstance = null;
let graficoOrcadoVsRealizadoInstance = null;
let graficoHistoricoInstance = null;

// Função de Envio de Dados em Segundo Plano para o Google Sheets (Com ajuste CORS)
async function sincronizarGoogleSheets(payload) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) return;
  try {
    await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    console.log("[Sheets Sync] Dados enviados para o Google Sheets.");
  } catch (err) {
    console.warn("[Sheets Sync] Aviso: Não foi possível espelhar no Google Sheets no momento.", err);
  }
}

// Registro do Service Worker com Auto-Update e Recarga Inteligente
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] Nova versão detectada e instalada. Recarregando aplicativo...');
              window.location.reload();
            }
          });
        }
      });
    }).catch((err) => {
      console.warn('[PWA] Falha ao registrar Service Worker:', err);
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

[buscaExtratoInput, filtroUsuarioExtrato, filtroContaExtrato, filtroTipoExtrato].forEach(el => {
  if (el) {
    el.addEventListener('input', processarDados);
    el.addEventListener('change', processarDados);
  }
});

if (btnToggleGerenciarCat) {
  btnToggleGerenciarCat.addEventListener('click', () => {
    painelGerenciarCat.classList.toggle('aberto');
  });
}

if (btnAbrirPicker) {
  btnAbrirPicker.addEventListener('click', () => {
    if ('showPicker' in filtroMesInput) {
      filtroMesInput.showPicker();
    } else {
      filtroMesInput.focus();
    }
  });
}

function alterarMes(delta) {
  const [ano, mes] = filtroMesInput.value.split('-').map(Number);
  const novaData = new Date(ano, mes - 1 + delta, 1);
  const novoAno = novaData.getFullYear();
  const novoMes = String(novaData.getMonth() + 1).padStart(2, '0');
  filtroMesInput.value = `${novoAno}-${novoMes}`;
  processarDados();
}

if (btnAnterior) btnAnterior.addEventListener('click', () => alterarMes(-1));
if (btnProximo) btnProximo.addEventListener('click', () => alterarMes(1));

function resetarFormulario() {
  inputTransacaoId.value = "";
  form.reset();
  document.getElementById('data').value = new Date().toISOString().split('T')[0];
  tituloForm.textContent = "Novo Lançamento";
  document.getElementById('btn-salvar').textContent = "Registrar Lançamento";
  btnCancelarEdicao.classList.add('hidden');
}

function resetarFormCategoria() {
  inputCatId.value = "";
  formCategoria.reset();
  checkCatAcumulativa.checked = false;
  selectCatRigidez.value = "RIGIDO";
  tituloFormCat.textContent = "Novo Envelope / Categoria";
  btnSalvarCat.textContent = "Salvar Envelope";
  btnCancelarCat.classList.add('hidden');
}

if (btnCancelarEdicao) btnCancelarEdicao.addEventListener('click', resetarFormulario);
if (btnCancelarCat) btnCancelarCat.addEventListener('click', resetarFormCategoria);

// Seed dos Envelopes Padrão com Natureza (Rígido vs. Flexível)
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

// CRUD de Categorias
if (formCategoria) {
  formCategoria.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnSalvarCat.disabled = true;

    const catId = inputCatId.value;
    const nome = inputCatNome.value.trim();
    const teto = parseFloat(inputCatTeto.value);
    const macro = selectCatMacro.value;
    const rigidez = selectCatRigidez.value;
    const isAcumulativa = checkCatAcumulativa.checked;

    try {
      if (catId) {
        await updateDoc(doc(db, "categories", catId), { 
          nome, 
          teto, 
          macro_grupo: macro, 
          rigidez: rigidez,
          is_sinking_fund: isAcumulativa, 
          updated_at: new Date().toISOString() 
        });
      } else {
        const novoId = "CAT_" + nome.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_" + Date.now();
        await setDoc(doc(db, "categories", novoId), { 
          nome, 
          teto, 
          macro_grupo: macro, 
          rigidez: rigidez,
          is_sinking_fund: isAcumulativa, 
          created_at: new Date().toISOString() 
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

window.prepararEdicaoCat = function(id, nome, teto, macro, rigidez, isAcumulativa) {
  inputCatId.value = id;
  inputCatNome.value = nome;
  inputCatTeto.value = teto;
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

// Quitação da Fatura do Cartão
if (btnQuitarFatura) {
  btnQuitarFatura.addEventListener('click', async () => {
    if (valorFaturaPendenteAtual <= 0) return;

    const mesSel = filtroMesInput.value;
    if (confirm(`Confirmar o pagamento da fatura no valor de R$ ${valorFaturaPendenteAtual.toFixed(2)} debitando da Conta Corrente?`)) {
      btnQuitarFatura.disabled = true;
      btnQuitarFatura.textContent = "Processando quitação...";

      const dataQuitacao = `${mesSel}-28`;

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

// Edição / Exclusão de Transações
window.prepararEdicao = function(id, data, tipo, valor, descricao, categoria, conta, usuario) {
  inputTransacaoId.value = id;
  document.getElementById('data').value = data;
  document.getElementById('tipo').value = tipo;
  document.getElementById('valor').value = valor;
  document.getElementById('descricao').value = descricao;
  document.getElementById('categoria').value = categoria;
  document.getElementById('conta').value = conta;
  document.getElementById('usuario').value = usuario;

  tituloForm.textContent = "Editar Lançamento";
  document.getElementById('btn-salvar').textContent = "Atualizar Lançamento";
  btnCancelarEdicao.classList.remove('hidden');

  secaoFormulario.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('valor').focus();
};

window.excluirTransacao = async function(id, descricao) {
  if (confirm(`Deseja realmente excluir o lançamento "${descricao}"?`)) {
    try {
      await deleteDoc(doc(db, "transactions", id));
      sincronizarGoogleSheets({ action: "DELETE", id: id });
    } catch (err) {
      alert("Erro ao excluir lançamento: " + err.message);
    }
  }
};

// Renderização do Gráfico de Rosca (Macro-Grupos)
function renderizarGraficoMacroGrupos(dadosMacro) {
  const canvasEl = document.getElementById('grafico-macro-grupos');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  
  const labels = Object.keys(dadosMacro);
  const valores = Object.values(dadosMacro);

  if (graficoMacroInstance) {
    graficoMacroInstance.destroy();
  }

  if (labels.length === 0 || valores.every(v => v === 0)) {
    graficoMacroInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Sem gastos registrados'],
        datasets: [{ data: [1], backgroundColor: ['#334155'] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
    return;
  }

  const cores = [
    '#10b981', '#38bdf8', '#f59e0b', '#ec4899', '#8b5cf6', 
    '#6366f1', '#14b8a6', '#f43f5e', '#84cc16'
  ];

  graficoMacroInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: valores,
        backgroundColor: cores.slice(0, labels.length),
        borderWidth: 1,
        borderColor: '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'left',
          labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } }
        }
      }
    }
  });
}

// Renderização do Gráfico Orçado vs. Realizado (Barras Duplas por Macro-Grupo)
function renderizarGraficoOrcadoVsRealizado(tetosMacro, gastosMacro) {
  const canvasEl = document.getElementById('grafico-orcado-vs-realizado');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');

  const labels = Object.keys(tetosMacro).filter(macro => (tetosMacro[macro] || 0) > 0 || (gastosMacro[macro] || 0) > 0);
  const dataOrcado = labels.map(m => tetosMacro[m] || 0);
  const dataRealizado = labels.map(m => gastosMacro[m] || 0);

  if (graficoOrcadoVsRealizadoInstance) {
    graficoOrcadoVsRealizadoInstance.destroy();
  }

  if (labels.length === 0) {
    graficoOrcadoVsRealizadoInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Sem envelopes configurados'],
        datasets: [{ label: 'Sem dados', data: [0], backgroundColor: '#334155' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
    return;
  }

  const coresRealizado = labels.map(m => (gastosMacro[m] || 0) > (tetosMacro[m] || 0) ? '#f43f5e' : '#10b981');

  graficoOrcadoVsRealizadoInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Teto Orçado (R$)',
          data: dataOrcado,
          backgroundColor: '#38bdf8',
          borderRadius: 4
        },
        {
          label: 'Gasto Realizado (R$)',
          data: dataRealizado,
          backgroundColor: coresRealizado,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.3)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(51, 65, 85, 0.3)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.parsed.y !== null) {
                label += 'R$ ' + context.parsed.y.toFixed(2);
              }
              return label;
            }
          }
        }
      }
    }
  });
}

// Renderização do Gráfico de Linhas (Evolução Temporal no Ano)
function renderizarGraficoHistoricoMensal(dadosPorMes) {
  const canvasEl = document.getElementById('grafico-historico-mensal');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');

  const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const valores = mesesNomes.map((_, idx) => {
    const chaveMes = String(idx + 1).padStart(2, '0');
    return dadosPorMes[chaveMes] || 0;
  });

  if (graficoHistoricoInstance) {
    graficoHistoricoInstance.destroy();
  }

  graficoHistoricoInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: mesesNomes,
      datasets: [{
        label: 'Total de Gastos (R$)',
        data: valores,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#38bdf8',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.3)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(51, 65, 85, 0.3)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

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
      if (isSaida) {
        acmCategoriasHistSaida[item.category_id] = (acmCategoriasHistSaida[item.category_id] || 0) + item.amount;
      } else {
        acmCategoriasHistEntrada[item.category_id] = (acmCategoriasHistEntrada[item.category_id] || 0) + item.amount;
      }
    }

    if (isMesAtual) {
      totalItensMes++;
      const usuarioItem = item.user_owner || 'Abner';

      if (isSaida) {
        if (isCartao) {
          totalFaturaCartao += item.amount;
        } else if (isPagtoFatura) {
          totalPagamentosFatura += item.amount;
        } else {
          totalSaidasDiretasSemFatura += item.amount;
        }

        if (!isPagtoFatura) {
          acmCategoriasMes[item.category_id] = (acmCategoriasMes[item.category_id] || 0) + item.amount;
        }
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
            <p class="font-bold font-mono ${corValor}">${sinal} R$ ${item.amount.toFixed(2)}</p>
            
            <div class="flex items-center gap-1 border-l border-slate-800 pl-2">
              <button onclick="prepararEdicao('${docId}', '${item.date}', '${item.type}', ${item.amount}, '${item.description.replace(/'/g, "\\'")}', '${item.category_id}', '${item.account_id}', '${usuarioItem}')" class="p-1 text-slate-400 hover:text-sky-400 transition-colors" title="Editar">
                ✏️
              </button>
              <button onclick="excluirTransacao('${docId}', '${item.description.replace(/'/g, "\\'")}')" class="p-1 text-slate-400 hover:text-rose-400 transition-colors" title="Excluir">
                🗑️
              </button>
            </div>
          </div>
        `;
        listaTransacoes.appendChild(card);
      }
    }
  });

  if (totalItensMes === 0) {
    contadorExtrato.textContent = "Nenhum lançamento no mês";
    listaTransacoes.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center">Nenhum lançamento registrado neste mês.</p>`;
  } else if (totalItensExibidos === 0) {
    contadorExtrato.textContent = `0 de ${totalItensMes} lançamentos encontrados`;
    listaTransacoes.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center">Nenhum lançamento corresponde aos filtros ativos.</p>`;
  } else {
    contadorExtrato.textContent = `Exibindo ${totalItensExibidos} de ${totalItensMes} lançamentos`;
  }

  valorFaturaPendenteAtual = Math.max(0, totalFaturaCartao - totalPagamentosFatura);
  const faturaEstaQuitada = totalFaturaCartao > 0 && valorFaturaPendenteAtual === 0;

  if (faturaEstaQuitada) {
    badgeFaturaStatus.classList.remove('hidden');
    btnQuitarFatura.classList.add('hidden');
    btnQuitarFatura.classList.remove('flex');
  } else if (valorFaturaPendenteAtual > 0) {
    badgeFaturaStatus.classList.add('hidden');
    btnQuitarFatura.classList.remove('hidden');
    btnQuitarFatura.classList.add('flex');
    btnQuitarFatura.textContent = `💳 Quitar R$ ${valorFaturaPendenteAtual.toFixed(2)}`;
  } else {
    badgeFaturaStatus.classList.add('hidden');
    btnQuitarFatura.classList.add('hidden');
    btnQuitarFatura.classList.remove('flex');
  }

  const totalSaidasTotaisConta = totalSaidasDiretasSemFatura + totalPagamentosFatura;
  const saldoLivre = totalEntradas - totalSaidasTotaisConta - valorFaturaPendenteAtual;

  elEntradas.textContent = `R$ ${totalEntradas.toFixed(2)}`;
  elSaidas.textContent = `R$ ${totalSaidasTotaisConta.toFixed(2)}`;
  elFaturaCartao.textContent = `R$ ${totalFaturaCartao.toFixed(2)}`;
  elSaldo.textContent = `R$ ${saldoLivre.toFixed(2)}`;

  // Renderização dos Envelopes e Acúmulo por Macro-Grupo
  listaEnvelopes.innerHTML = "";
  
  const grupos = {};
  const gastosMacroGrafico = {};
  const tetosMacroGrafico = {};

  let tetoRigidoTotal = 0;
  let tetoFlexivelTotal = 0;
  let gastoFlexivelMes = 0;

  Object.keys(envelopesConfig).forEach(catId => {
    const cat = envelopesConfig[catId];
    const macro = cat.macro || "Reservas & Outros";
    if (!grupos[macro]) grupos[macro] = [];
    grupos[macro].push({ id: catId, ...cat });

    if (cat.rigidez === "FLEXIVEL") {
      tetoFlexivelTotal += cat.teto;
      gastoFlexivelMes += (acmCategoriasMes[catId] || 0);
    } else {
      tetoRigidoTotal += cat.teto;
    }
  });

  if (Object.keys(grupos).length === 0) {
    listaEnvelopes.innerHTML = `<p class="text-sm text-slate-500 py-2 text-center">Nenhum envelope configurado.</p>`;
  } else {
    Object.keys(grupos).forEach(macroNome => {
      const itensGrupo = grupos[macroNome];
      
      let totalGastoGrupoVisual = 0;
      let totalGastoGrupoMesReal = 0;
      let totalTetoGrupo = 0;

      itensGrupo.forEach(item => {
        const gastoItemVisual = item.is_sinking_fund ? (acmCategoriasHistSaida[item.id] || 0) : (acmCategoriasMes[item.id] || 0);
        totalGastoGrupoVisual += gastoItemVisual;
        totalGastoGrupoMesReal += (acmCategoriasMes[item.id] || 0);
        totalTetoGrupo += item.teto;
      });

      gastosMacroGrafico[macroNome] = totalGastoGrupoMesReal;
      tetosMacroGrafico[macroNome] = totalTetoGrupo;

      const grupoBloco = document.createElement('div');
      grupoBloco.className = "bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3";

      const headerGrupo = document.createElement('div');
      headerGrupo.className = "flex items-center justify-between border-b border-slate-800 pb-2";
      headerGrupo.innerHTML = `
        <span class="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          📁 ${macroNome}
        </span>
        <span class="text-xs font-mono text-slate-400">
          R$ ${totalGastoGrupoVisual.toFixed(2)} / R$ ${totalTetoGrupo.toFixed(2)}
        </span>
      `;
      grupoBloco.appendChild(headerGrupo);

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
          
          if (entradaHist > 0) {
            const saldoCaixinha = entradaHist - gastoHist;
            pct = env.teto > 0 ? Math.min(Math.round((saldoCaixinha / env.teto) * 100), 100) : 0;
            if (pct < 0) pct = 0;
            textoValores = `Saldo: R$ ${saldoCaixinha.toFixed(2)} / Meta: R$ ${env.teto.toFixed(2)}`;
          } else {
            pct = env.teto > 0 ? Math.min(Math.round((gastoHist / env.teto) * 100), 100) : 0;
            textoValores = `Acumulado: R$ ${gastoHist.toFixed(2)} / R$ ${env.teto.toFixed(2)} (Mês: R$ ${gastoMes.toFixed(2)})`;
          }
        } else {
          pct = env.teto > 0 ? Math.min(Math.round((gastoMes / env.teto) * 100), 100) : 0;
          textoValores = `R$ ${gastoMes.toFixed(2)} / R$ ${env.teto.toFixed(2)} (${pct}%)`;
        }

        if (pct >= 100) {
          corBarra = "bg-rose-500";
          corTextoPct = "text-rose-400";
        } else if (pct >= 80) {
          corBarra = "bg-amber-500";
          corTextoPct = "text-amber-400";
        }

        const envCard = document.createElement('div');
        envCard.className = "bg-slate-900/60 border border-slate-800 p-3 rounded-lg space-y-2";
        envCard.innerHTML = `
          <div class="flex justify-between items-center text-xs gap-2">
            <div class="flex items-center gap-1.5 overflow-hidden">
              <span title="${env.rigidez === 'FLEXIVEL' ? 'Envelope Flexível / Estilo de Vida' : 'Envelope Rígido / Essencial'}">${seloRigidez}</span>
              <span class="font-medium text-slate-200 truncate">${env.nome}</span>
              ${badgeCaixinha}
            </div>
            <span class="font-semibold ${corTextoPct} shrink-0 font-mono">${textoValores}</span>
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
  }

  // --- CÁLCULO DAS MÉTRICAS EXECUTIVAS SEM GRÁFICO ---

  // 1. Margem de Manobra (Rígido vs. Flexível)
  const tetoGeralMetrica = tetoRigidoTotal + tetoFlexivelTotal;
  const pctRigido = tetoGeralMetrica > 0 ? Math.round((tetoRigidoTotal / tetoGeralMetrica) * 100) : 0;
  const pctFlexivel = tetoGeralMetrica > 0 ? (100 - pctRigido) : 0;

  if (barraRigido && barraFlexivel) {
    barraRigido.style.width = `${pctRigido}%`;
    barraFlexivel.style.width = `${pctFlexivel}%`;
  }

  if (txtValorRigido) txtValorRigido.textContent = `📌 Rígidos: R$ ${tetoRigidoTotal.toFixed(2)} (${pctRigido}%)`;
  if (txtValorFlexivel) txtValorFlexivel.textContent = `🎈 Flexíveis: R$ ${tetoFlexivelTotal.toFixed(2)} (${pctFlexivel}%)`;

  if (badgeDiagnosticoMargem && txtRaioxMargem) {
    if (pctRigido <= 65) {
      badgeDiagnosticoMargem.className = "text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
      badgeDiagnosticoMargem.textContent = "🟢 Excelente";
      txtRaioxMargem.textContent = `💡 Estrutura saudável: Você tem R$ ${tetoFlexivelTotal.toFixed(2)} (${pctFlexivel}%) de margem flexível para manobras ou cortes de emergência.`;
    } else if (pctRigido <= 80) {
      badgeDiagnosticoMargem.className = "text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30";
      badgeDiagnosticoMargem.textContent = "🟡 Equilibrada";
      txtRaioxMargem.textContent = `💡 Atenção moderada: ${pctRigido}% do seu orçamento orçado é de compromissos rígidos. Mantenha os envelopes flexíveis sob vigilância.`;
    } else {
      badgeDiagnosticoMargem.className = "text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30";
      badgeDiagnosticoMargem.textContent = "🔴 Engessada";
      txtRaioxMargem.textContent = `💡 Pouca flexibilidade: ${pctRigido}% do seu orçamento é composto por compromissos fixos/rígidos. Resta pouca margem para manobras.`;
    }
  }

  // 2. Velocímetro Orçamentário (Gastos Flexíveis / Pacing)
  const [selAno, selMes] = mesSelecionado.split('-').map(Number);
  const totalDiasNoMes = new Date(selAno, selMes, 0).getDate();

  let diasDecorridos = 0;
  if (selAno === anoAtual && selMes === Number(mesAtual)) {
    diasDecorridos = hoje.getDate();
  } else if (selAno < anoAtual || (selAno === anoAtual && selMes < Number(mesAtual))) {
    diasDecorridos = totalDiasNoMes;
  } else {
    diasDecorridos = 0;
  }

  const pctTempo = Math.round((diasDecorridos / totalDiasNoMes) * 100);
  const pctConsumoFlexivel = tetoFlexivelTotal > 0 ? Math.round((gastoFlexivelMes / tetoFlexivelTotal) * 100) : 0;
  const deltaPacing = pctConsumoFlexivel - pctTempo;

  if (txtPacingTempo) txtPacingTempo.textContent = `${pctTempo}% (Dia ${diasDecorridos}/${totalDiasNoMes})`;
  if (barraPacingTempo) barraPacingTempo.style.width = `${pctTempo}%`;

  if (txtPacingConsumo) txtPacingConsumo.textContent = `R$ ${gastoFlexivelMes.toFixed(2)} / R$ ${tetoFlexivelTotal.toFixed(2)} (${pctConsumoFlexivel}%)`;
  if (barraPacingConsumo) barraPacingConsumo.style.width = `${Math.min(pctConsumoFlexivel, 100)}%`;

  if (badgeStatusPacing && txtStatusPacingMensagem) {
    if (tetoFlexivelTotal === 0) {
      badgeStatusPacing.className = "text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700";
      badgeStatusPacing.textContent = "⚪ Sem Tetos Flexíveis";
      txtStatusPacingMensagem.textContent = "Cadastre ou edite um envelope definindo-o como 'Flexível' para ativar a medição do velocímetro.";
      if (barraPacingConsumo) barraPacingConsumo.className = "bg-slate-600 h-2 rounded-full transition-all duration-500";
    } else if (diasDecorridos === 0) {
      badgeStatusPacing.className = "text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700";
      badgeStatusPacing.textContent = "📅 Mês Futuro";
      txtStatusPacingMensagem.textContent = "Período orçamentário ainda não iniciado.";
      if (barraPacingConsumo) barraPacingConsumo.className = "bg-slate-600 h-2 rounded-full transition-all duration-500";
    } else if (deltaPacing > 10) {
      badgeStatusPacing.className = "text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30";
      badgeStatusPacing.textContent = "⚠️ Acelerado";
      txtStatusPacingMensagem.textContent = `Atenção: Seus gastos flexíveis estão ${deltaPacing}% à frente do ritmo esperado para o dia do mês.`;
      if (barraPacingConsumo) barraPacingConsumo.className = "bg-amber-500 h-2 rounded-full transition-all duration-500";
    } else if (deltaPacing < -10) {
      badgeStatusPacing.className = "text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      badgeStatusPacing.textContent = "🛡️ Ritmo Poupador";
      txtStatusPacingMensagem.textContent = `Excelente! Seus gastos flexíveis estão ${Math.abs(deltaPacing)}% abaixo da média de dias transcorridos.`;
      if (barraPacingConsumo) barraPacingConsumo.className = "bg-emerald-400 h-2 rounded-full transition-all duration-500";
    } else {
      badgeStatusPacing.className = "text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30";
      badgeStatusPacing.textContent = "🟢 No Ritmo";
      txtStatusPacingMensagem.textContent = "Seus gastos flexíveis acompanham perfeitamente o ritmo dos dias do mês.";
      if (barraPacingConsumo) barraPacingConsumo.className = "bg-sky-400 h-2 rounded-full transition-all duration-500";
    }
  }

  // Atualização dos Gráficos Existentes
  renderizarGraficoMacroGrupos(gastosMacroGrafico);
  renderizarGraficoOrcadoVsRealizado(tetosMacroGrafico, gastosMacroGrafico);
  renderizarGraficoHistoricoMensal(acumuladoHistoricoPorMes);

  const totalDespesasMes = totalSaidasTotaisConta + totalFaturaCartao;
  const pctComprometimento = totalEntradas > 0 ? Math.round((totalDespesasMes / totalEntradas) * 100) : 0;
  
  if (resumoExecutivoTexto) {
    resumoExecutivoTexto.innerHTML = `
      <div class="flex justify-between items-center"><span class="text-slate-400">Total de Entradas:</span> <span class="font-mono font-bold text-emerald-400">R$ ${totalEntradas.toFixed(2)}</span></div>
      <div class="flex justify-between items-center"><span class="text-slate-400">Total de Despesas (Conta + Cartão):</span> <span class="font-mono font-bold text-rose-400">R$ ${totalDespesasMes.toFixed(2)}</span></div>
      <div class="flex justify-between items-center pt-1 border-t border-slate-800"><span class="text-slate-300 font-medium">Comprometimento da Renda:</span> <span class="font-mono font-bold text-amber-400">${pctComprometimento}%</span></div>
    `;
  }
}

if (filtroMesInput) filtroMesInput.addEventListener('change', processarDados);

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar');
    btn.disabled = true;
    btn.textContent = "Gravando...";

    const idEditando = inputTransacaoId.value;
    const dataLancamento = document.getElementById('data').value;

    const dadosTransacao = {
      date: dataLancamento,
      type: document.getElementById('tipo').value,
      amount: parseFloat(document.getElementById('valor').value),
      description: document.getElementById('descricao').value,
      category_id: document.getElementById('categoria').value,
      account_id: document.getElementById('conta').value,
      status: "VALIDATED",
      user_owner: document.getElementById('usuario').value,
      source_satellite: "core_dimdim",
      updated_at: new Date().toISOString()
    };

    try {
      if (idEditando) {
        await updateDoc(doc(db, "transactions", idEditando), dadosTransacao);
        sincronizarGoogleSheets({ action: "UPSERT", id: idEditando, ...dadosTransacao });
      } else {
        dadosTransacao.created_at = new Date().toISOString();
        const docRef = await addDoc(collection(db, "transactions"), dadosTransacao);
        sincronizarGoogleSheets({ action: "UPSERT", id: docRef.id, ...dadosTransacao });
      }
      
      const mesDoLancamento = dataLancamento.substring(0, 7);
      if (filtroMesInput.value !== mesDoLancamento) {
        filtroMesInput.value = mesDoLancamento;
      }

      resetarFormulario();
    } catch (err) {
      alert("Erro ao salvar lançamento: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = idEditando ? "Atualizar Lançamento" : "Registrar Lançamento";
    }
  });
}

// --- LÓGICA DO ASSISTENTE DE FECHAMENTO DE MÊS ---

function abrirModalFechamento() {
  const mesSel = filtroMesInput.value;
  txtFechamentoMesRef.textContent = mesSel;

  const txtSaldoAtual = elSaldo.textContent.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  const saldoLivreAtual = parseFloat(txtSaldoAtual) || 0;

  txtFechamentoSaldoSobra.textContent = `R$ ${saldoLivreAtual.toFixed(2)}`;
  inputValorAporteSobra.value = Math.max(0, saldoLivreAtual).toFixed(2);

  if (valorFaturaPendenteAtual > 0) {
    boxAlertaFaturaPendente.classList.remove('hidden');
  } else {
    boxAlertaFaturaPendente.classList.add('hidden');
  }

  selectCaixinhaDestino.innerHTML = "";
  const caixinhas = Object.keys(envelopesConfig).filter(id => envelopesConfig[id].is_sinking_fund);

  if (caixinhas.length === 0) {
    selectCaixinhaDestino.innerHTML = `<option value="">Nenhuma caixinha/reserva configurada</option>`;
  } else {
    caixinhas.forEach(catId => {
      const cat = envelopesConfig[catId];
      const opt = document.createElement('option');
      opt.value = catId;
      opt.textContent = `🧰 ${cat.nome} (Meta: R$ ${cat.teto.toFixed(2)})`;
      selectCaixinhaDestino.appendChild(opt);
    });
  }

  modalFechamentoMes.classList.remove('hidden');
}

function fecharModalFechamento() {
  modalFechamentoMes.classList.add('hidden');
  if (formFechamentoMes) formFechamentoMes.reset();
}

if (btnAbrirFechamentoMes) btnAbrirFechamentoMes.addEventListener('click', abrirModalFechamento);
if (btnFecharModalFechamento) btnFecharModalFechamento.addEventListener('click', fecharModalFechamento);
if (btnCancelarFechamento) btnCancelarFechamento.addEventListener('click', fecharModalFechamento);

if (formFechamentoMes) {
  formFechamentoMes.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnConfirmar = document.getElementById('btn-confirmar-fechamento');
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Processando Fechamento...";

    const mesSel = filtroMesInput.value;
    const catDestinoId = selectCaixinhaDestino.value;
    const valorAporte = parseFloat(inputValorAporteSobra.value);

    if (!catDestinoId) {
      alert("Selecione uma Caixinha / Reserva de destino para aportar a sobra.");
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar Fechamento & Aporte";
      return;
    }

    if (valorAporte <= 0) {
      alert("Informe um valor válido de aporte maior que zero.");
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar Fechamento & Aporte";
      return;
    }

    const nomeCaixinha = envelopesConfig[catDestinoId]?.nome || "Caixinha";
    const dataUltimoDiaMes = `${mesSel}-28`;

    const dadosAporte = {
      date: dataUltimoDiaMes,
      type: "ENTRADA",
      amount: valorAporte,
      description: `Aporte Sobra Fechamento Mês (${mesSel}) ➔ ${nomeCaixinha}`,
      category_id: catDestinoId,
      account_id: "ACC_BRADESCO_ABNER",
      status: "VALIDATED",
      user_owner: document.getElementById('usuario').value || "Abner",
      source_satellite: "core_dimdim",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const docRef = await addDoc(collection(db, "transactions"), dadosAporte);
      sincronizarGoogleSheets({ action: "UPSERT", id: docRef.id, ...dadosAporte });
      
      fecharModalFechamento();
      alert(`🎉 Fechamento concluído com sucesso! R$ ${valorAporte.toFixed(2)} aportados na caixinha "${nomeCaixinha}".`);
    } catch (err) {
      alert("Erro ao realizar fechamento: " + err.message);
    } finally {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar Fechamento & Aporte";
    }
  });
}

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

    envelopesConfig[id] = { 
      nome: data.nome, 
      teto: data.teto, 
      macro: macro,
      rigidez: rigidez,
      is_sinking_fund: !!data.is_sinking_fund 
    };

    if (!gruposSelect[macro]) gruposSelect[macro] = [];
    gruposSelect[macro].push({ id, nome: data.nome, teto: data.teto, rigidez, is_sinking_fund: !!data.is_sinking_fund });

    const tagCaixinhaGerenciador = data.is_sinking_fund ? ' <span class="text-amber-400 text-[10px]">🧰</span>' : '';
    const seloRigidezGerenciador = rigidez === 'FLEXIVEL' ? '🎈' : '📌';

    const itemCat = document.createElement('div');
    itemCat.className = "flex items-center justify-between text-xs bg-slate-900 border border-slate-800 p-2 rounded";
    itemCat.innerHTML = `
      <span class="text-slate-200 font-medium"><span>${seloRigidezGerenciador}</span> <span class="text-emerald-400 font-semibold">[${macro}]</span> ${data.nome}${tagCaixinhaGerenciador} - <span class="text-emerald-400 font-mono">R$ ${data.teto.toFixed(2)}</span></span>
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