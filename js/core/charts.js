import { formatarMoeda } from "./formatters.js";

let graficoMacroInstance = null;
let graficoOrcadoVsRealizadoInstance = null;
let graficoHistoricoInstance = null;

export function renderizarGraficoMacroGrupos(dadosMacro) {
  const canvasEl = document.getElementById('grafico-macro-grupos');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  const labels = Object.keys(dadosMacro);
  const valores = Object.values(dadosMacro);

  if (graficoMacroInstance) graficoMacroInstance.destroy();

  if (labels.length === 0 || valores.every(v => v === 0)) {
    graficoMacroInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Sem gastos registrados'], datasets: [{ data: [1], backgroundColor: ['#334155'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
    return;
  }

  const cores = ['#10b981', '#38bdf8', '#f59e0b', '#ec4899', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e', '#84cc16'];
  graficoMacroInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: valores, backgroundColor: cores.slice(0, labels.length), borderWidth: 1, borderColor: '#1e293b' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'left', labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } } }
    }
  });
}

export function renderizarGraficoOrcadoVsRealizado(tetosMacro, gastosMacro) {
  const canvasEl = document.getElementById('grafico-orcado-vs-realizado');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');

  const labels = Object.keys(tetosMacro).filter(macro => (tetosMacro[macro] || 0) > 0 || (gastosMacro[macro] || 0) > 0);
  const dataOrcado = labels.map(m => tetosMacro[m] || 0);
  const dataRealizado = labels.map(m => gastosMacro[m] || 0);

  if (graficoOrcadoVsRealizadoInstance) graficoOrcadoVsRealizadoInstance.destroy();

  if (labels.length === 0) {
    graficoOrcadoVsRealizadoInstance = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['Sem envelopes configurados'], datasets: [{ label: 'Sem dados', data: [0], backgroundColor: '#334155' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
    return;
  }

  const coresRealizado = labels.map(m => (gastosMacro[m] || 0) > (tetosMacro[m] || 0) ? '#f43f5e' : '#10b981');

  graficoOrcadoVsRealizadoInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Teto Orçado (R$)', data: dataOrcado, backgroundColor: '#38bdf8', borderRadius: 4 },
        { label: 'Gasto Realizado (R$)', data: dataRealizado, backgroundColor: coresRealizado, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        y: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
      },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label || ''}: ${formatarMoeda(ctx.parsed.y)}` } }
      }
    }
  });
}

export function renderizarGraficoHistoricoMensal(dadosPorMes) {
  const canvasEl = document.getElementById('grafico-historico-mensal');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');

  const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const valores = mesesNomes.map((_, idx) => dadosPorMes[String(idx + 1).padStart(2, '0')] || 0);

  if (graficoHistoricoInstance) graficoHistoricoInstance.destroy();

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
        pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        y: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
      },
      plugins: { legend: { display: false } }
    }
  });
}