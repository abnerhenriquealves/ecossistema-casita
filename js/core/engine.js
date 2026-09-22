// 📌 Fase 5: Motor Financeiro Isolado (Funções Puras sem acoplamento de DOM)

export function calcularSaldoLivre(entradas, saidasDiretas, pagamentosFatura, faturaPendente) {
  return entradas - saidasDiretas - pagamentosFatura - faturaPendente;
}

export function calcularMetricasOrcamento(envelopesConfig, acmCatMes) {
  let tetoRigidoTotal = 0;
  let tetoFlexivelTotal = 0;
  let gastoFlexivelMes = 0;

  Object.keys(envelopesConfig).forEach(id => {
    const cat = envelopesConfig[id];
    if (cat.rigidez === "RIGIDO") {
      tetoRigidoTotal += (cat.teto || 0);
    } else {
      tetoFlexivelTotal += (cat.teto || 0);
      gastoFlexivelMes += (acmCatMes[id] || 0);
    }
  });

  return { tetoRigidoTotal, tetoFlexivelTotal, gastoFlexivelMes };
}

export function calcularVelocimetroPacing(mesSel, gastoFlexivel, tetoFlexivel) {
  const hoje = new Date();
  const [anoSel, mSel] = mesSel.split('-').map(Number);
  const ultimoDiaMes = new Date(anoSel, mSel, 0).getDate();

  let diasDecorridos = ultimoDiaMes;
  // Se o mês selecionado for o mês atual, limitamos o progresso ao dia de hoje
  if (anoSel === hoje.getFullYear() && mSel === (hoje.getMonth() + 1)) {
    diasDecorridos = hoje.getDate();
  }

  const pctTempo = Math.round((diasDecorridos / ultimoDiaMes) * 100);
  const pctConsumoFlexivel = tetoFlexivel > 0 ? Math.round((gastoFlexivel / tetoFlexivel) * 100) : 0;
  const deltaPacing = pctConsumoFlexivel - pctTempo;

  return {
    diasDecorridos,
    totalDiasNoMes: ultimoDiaMes,
    pctTempo,
    pctConsumoFlexivel,
    deltaPacing
  };
}

// 📌 O Novo Coração do Sistema: Processamento centralizado de transações em Lote
export function processarMotorFinanceiro(snapshotTransactions, filtros, config) {
  // Proteção contra corrida de inicialização:
  // contas/categorias podem chegar antes do snapshot de transações.
  if (!snapshotTransactions || typeof snapshotTransactions.forEach !== "function") {
    return {
      totalEntradas: 0,
      totalSaidasDiretas: 0,
      totalFatura: 0,
      totalPagtoFatura: 0,
      valorFaturaPendente: 0,
      saldoLivre: 0,
      acmCatMes: {},
      acmHistMes: {},
      acmCatSaidaHist: {},
      acmCatEntradaHist: {},
      itensExibicao: []
    };
  }
  const { mesSel, termoBusca, usrFiltro, contaFiltro, tipoFiltro } = filtros;
  const { contasConfig, envelopesConfig } = config;
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

    // Tratamento de segurança: Fallback caso a conta tenha sido excluída previamente e tornado a transação órfã
    const contaObj = contasConfig[item.account_id];
    const isCartao = contaObj ? contaObj.tipo === "CARTAO" : item.account_id === "ACC_CARTAO_CREDITO";
    const isPagto = item.category_id === "CAT_FATURA_CARTAO";

    // Acumulador de Histórico Anual para Gráficos (somente saídas, exceto pagamento de fatura para não duplicar)
    if (item.date.substring(0, 4) === anoSel && isSaida && !isPagto) {
      const mChave = item.date.substring(5, 7);
      acmHistMes[mChave] = (acmHistMes[mChave] || 0) + item.amount;
    }

    // Acumulador Histórico de Caixinhas (Sinking Funds)
    if (itemMes <= mesSel && item.category_id && !isPagto) {
      if (isSaida) acmCatSaidaHist[item.category_id] = (acmCatSaidaHist[item.category_id] || 0) + item.amount;
      else acmCatEntradaHist[item.category_id] = (acmCatEntradaHist[item.category_id] || 0) + item.amount;
    }

    // Cálculo exclusivo do Mês Selecionado
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

      // Filtros de Exibição do Extrato
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

  const valorFaturaPendente = Math.max(0, totalFatura - totalPagtoFatura);
  const saldoLivre = calcularSaldoLivre(totalEntradas, totalSaidasDiretas, totalPagtoFatura, valorFaturaPendente);

  return {
    totalEntradas,
    totalSaidasDiretas,
    totalFatura,
    totalPagtoFatura,
    valorFaturaPendente,
    saldoLivre,
    acmCatMes,
    acmHistMes,
    acmCatSaidaHist,
    acmCatEntradaHist,
    itensExibicao
  };
}