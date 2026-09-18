import { formatarMoeda } from "./formatters.js";

// Atualização dos Cards do Topo
export function atualizarCardsSaldo(elEntradas, elSaidas, elFatura, elSaldo, entradas, saidas, fatura, saldo) {
  if (elEntradas) elEntradas.textContent = formatarMoeda(entradas);
  if (elSaidas) elSaidas.textContent = formatarMoeda(saidas);
  if (elFatura) elFatura.textContent = formatarMoeda(fatura);
  if (elSaldo) elSaldo.textContent = formatarMoeda(saldo);
}

// Renderização do Extrato do Mês
export function renderizarExtrato(listaEl, itens, envelopesConfig) {
  if (!listaEl) return;
  listaEl.innerHTML = "";

  if (itens.length === 0) {
    listaEl.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center">Nenhum lançamento encontrado.</p>`;
    return;
  }

  itens.forEach(({ id, item }) => {
    const isSaida = item.type === "SAIDA";
    const isCartao = item.account_id === "ACC_CARTAO_CREDITO";
    const isPagtoFatura = item.category_id === "CAT_FATURA_CARTAO";
    const usuarioItem = item.user_owner || 'Abner';

    const corValor = isSaida ? (isCartao ? "text-amber-400" : (isPagtoFatura ? "text-sky-400" : "text-rose-400")) : "text-emerald-400";
    const sinal = isSaida ? "-" : "+";
    const seloConta = isCartao ? "💳 Cartão" : "🏦 Conta Corrente";
    const nomeCat = envelopesConfig[item.category_id]?.nome || (isPagtoFatura ? '💳 Quitação de Fatura' : item.category_id);

    const card = document.createElement('div');
    card.className = "bg-slate-950/60 border border-slate-800 p-3 rounded-lg flex items-center justify-between text-sm gap-2";
    card.innerHTML = `
      <div class="space-y-0.5 overflow-hidden">
        <p class="font-medium text-slate-200 truncate">${item.description}</p>
        <p class="text-xs text-slate-400">${item.date} • <span class="text-emerald-400/80">${nomeCat}</span> • <span class="text-slate-500">${seloConta}</span> • <span class="text-slate-500">${usuarioItem}</span></p>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <p class="font-bold font-mono ${corValor}">${sinal} ${formatarMoeda(item.amount)}</p>
        <div class="flex items-center gap-1 border-l border-slate-800 pl-2">
          <button onclick="prepararEdicao('${id}', '${item.date}', '${item.type}', ${item.amount}, '${item.description.replace(/'/g, "\\'")}', '${item.category_id}', '${item.account_id}', '${usuarioItem}')" class="p-1 text-slate-400 hover:text-sky-400">✏️</button>
          <button onclick="excluirTransacao('${id}', '${item.description.replace(/'/g, "\\'")}')" class="p-1 text-slate-400 hover:text-rose-400">🗑️</button>
        </div>
      </div>
    `;
    listaEl.appendChild(card);
  });
}

// Renderização das Categorias nos Selects
export function atualizarSelectsCategorias(selectCategoria, listaGerenciadorCat, envelopesConfig) {
  if (!selectCategoria) return;
  selectCategoria.innerHTML = "";
  if (listaGerenciadorCat) listaGerenciadorCat.innerHTML = "";

  const gruposSelect = {};

  Object.keys(envelopesConfig).forEach(id => {
    const data = envelopesConfig[id];
    const macro = data.macro || "Reservas & Outros";
    if (!gruposSelect[macro]) gruposSelect[macro] = [];
    gruposSelect[macro].push({ id, ...data });

    if (listaGerenciadorCat) {
      const itemCat = document.createElement('div');
      itemCat.className = "flex items-center justify-between text-xs bg-slate-900 border border-slate-800 p-2 rounded";
      itemCat.innerHTML = `
        <span class="text-slate-200 font-medium">[${macro}] ${data.nome} - <span class="text-emerald-400 font-mono">${formatarMoeda(data.teto)}</span></span>
        <div class="flex items-center gap-2">
          <button onclick="prepararEdicaoCat('${id}', '${data.nome.replace(/'/g, "\\'")}', ${data.teto}, '${macro.replace(/'/g, "\\'")}', '${data.rigidez}', ${!!data.is_sinking_fund})" class="text-slate-400 hover:text-sky-400">✏️</button>
          <button onclick="excluirCat('${id}', '${data.nome.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-rose-400">🗑️</button>
        </div>
      `;
      listaGerenciadorCat.appendChild(itemCat);
    }
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
}