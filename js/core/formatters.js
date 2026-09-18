export function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

export function aplicarMascaraMoeda(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener('input', (e) => {
    let digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      e.target.value = '';
      return;
    }
    let numero = parseFloat(digits) / 100;
    e.target.value = formatarMoeda(numero);
  });
}

export function obterValorNumericoMascara(inputEl) {
  if (!inputEl || !inputEl.value) return 0;
  let digits = inputEl.value.replace(/\D/g, '');
  return (parseFloat(digits) / 100) || 0;
}

export function definirValorMascara(inputEl, valorNumerico) {
  if (!inputEl) return;
  if (valorNumerico === null || valorNumerico === undefined || isNaN(valorNumerico) || valorNumerico === 0) {
    inputEl.value = '';
    return;
  }
  inputEl.value = formatarMoeda(valorNumerico);
}