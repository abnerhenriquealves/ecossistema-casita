import { formatarMoeda } from "./formatters.js";

export function calcularMetricasOrcamento(envelopesConfig, acmCategoriasMes) {
  let tetoRigidoTotal = 0;
  let tetoFlexivelTotal = 0;
  let gastoFlexivelMes = 0;

  Object.keys(envelopesConfig).forEach(catId => {
    const cat = envelopesConfig[catId];
    if (cat.rigidez === "FLEXIVEL") {
      tetoFlexivelTotal += cat.teto;
      gastoFlexivelMes += (acmCategoriasMes[catId] || 0);
    } else {
      tetoRigidoTotal += cat.teto;
    }
  });

  return { tetoRigidoTotal, tetoFlexivelTotal, gastoFlexivelMes };
}

export function calcularVelocimetroPacing(mesSelecionado, gastoFlexivelMes, tetoFlexivelTotal) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtualChave = String(hoje.getMonth() + 1).padStart(2, '0');

  const [selAno, selMes] = mesSelecionado.split('-').map(Number);
  const totalDiasNoMes = new Date(selAno, selMes, 0).getDate();

  let diasDecorridos = 0;
  if (selAno === anoAtual && selMes === Number(mesAtualChave)) {
    diasDecorridos = hoje.getDate();
  } else if (selAno < anoAtual || (selAno === anoAtual && selMes < Number(mesAtualChave))) {
    diasDecorridos = totalDiasNoMes;
  } else {
    diasDecorridos = 0;
  }

  const pctTempo = Math.round((diasDecorridos / totalDiasNoMes) * 100);
  const pctConsumoFlexivel = tetoFlexivelTotal > 0 ? Math.round((gastoFlexivelMes / tetoFlexivelTotal) * 100) : 0;
  const deltaPacing = pctConsumoFlexivel - pctTempo;

  return { totalDiasNoMes, diasDecorridos, pctTempo, pctConsumoFlexivel, deltaPacing };
}

export function calcularSaldoLivre(entradas, saídasSemFatura, pagamentosFatura, faturaPendente) {
  const saídasTotais = saídasSemFatura + pagamentosFatura;
  return entradas - saídasTotais - faturaPendente;
}