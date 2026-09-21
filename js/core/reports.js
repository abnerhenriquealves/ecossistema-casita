import { formatarMoeda } from "./formatters.js";

// 📌 [Gera e faz o download do Relatório Executivo Mensal em PDF]
export async function gerarRelatorioPDF(mesSel, totalEntradas, totalSaidas, totalFatura, saldoLivre, itensExibicao, envelopesConfig) {
  const container = document.createElement('div');
  container.id = "relatorio-pdf-temp";
  
  // Anexa temporariamente ao DOM fora do ecrã para permitir o cálculo correto de dimensões e estilos pelo html2canvas
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "750px";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  container.style.padding = "24px";
  container.style.boxSizing = "border-box";

  let html = `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1 style="font-size: 20px; font-weight: bold; color: #047857; margin: 0;">Dimdim 💰 • Ecossistema Casita</h1>
        <p style="font-size: 12px; color: #64748b; margin: 2px 0 0 0;">Relatório Executivo Mensal de Caixa & Orçamento</p>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 13px; font-weight: bold; background: #f1f5f9; padding: 6px 12px; border-radius: 6px; color: #0f172a; border: 1px solid #cbd5e1;">Mês Ref: ${mesSel}</span>
      </div>
    </div>

    <!-- Resumo de Saldos -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px;">
        <span style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display: block;">Entradas</span>
        <p style="font-size: 14px; font-weight: bold; color: #047857; margin: 4px 0 0 0;">${formatarMoeda(totalEntradas)}</p>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px;">
        <span style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display: block;">Saídas Diretas</span>
        <p style="font-size: 14px; font-weight: bold; color: #e11d48; margin: 4px 0 0 0;">${formatarMoeda(totalSaidas)}</p>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px;">
        <span style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display: block;">Fatura Cartão</span>
        <p style="font-size: 14px; font-weight: bold; color: #d97706; margin: 4px 0 0 0;">${formatarMoeda(totalFatura)}</p>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px;">
        <span style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display: block;">Saldo Livre</span>
        <p style="font-size: 14px; font-weight: bold; color: #0284c7; margin: 4px 0 0 0;">${formatarMoeda(saldoLivre)}</p>
      </div>
    </div>

    <!-- Tabela de Lançamentos -->
    <div style="margin-top: 20px;">
      <h3 style="font-size: 13px; font-weight: bold; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 10px; color: #334155;">Extrato de Lançamentos do Mês</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #0f172a;">
        <thead>
          <tr style="background: #f1f5f9; text-align: left; color: #475569;">
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Data</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Descrição</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Categoria</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Usuário</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (!itensExibicao || itensExibicao.length === 0) {
    html += `<tr><td colspan="5" style="text-align: center; padding: 16px; color: #64748b; border: 1px solid #e2e8f0;">Nenhum lançamento registrado para este período.</td></tr>`;
  } else {
    itensExibicao.forEach(({ item }) => {
      const isSaida = item.type === "SAIDA";
      const sinal = isSaida ? "-" : "+";
      const cor = isSaida ? "#e11d48" : "#047857";
      const isPagtoFatura = item.category_id === "CAT_FATURA_CARTAO";
      const nomeCat = envelopesConfig[item.category_id]?.nome || (isPagtoFatura ? '💳 Quitação de Fatura' : item.category_id) || "Geral";

      html += `
        <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${item.date}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${item.description}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${nomeCat}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${item.user_owner || 'Abner'}</td>
          <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: ${cor};">${sinal} ${formatarMoeda(item.amount)}</td>
        </tr>
      `;
    });
  }

  html += `
        </tbody>
      </table>
    </div>

    <div style="margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px;">
      Documento emitido pelo PWA Dimdim em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
    </div>
  `;

  container.innerHTML = html;
  document.body.appendChild(container);

  const opt = {
    margin:       10,
    filename:     `Relatorio_Dimdim_${mesSel}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(container).save();
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}