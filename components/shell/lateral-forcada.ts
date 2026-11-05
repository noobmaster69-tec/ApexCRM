/**
 * O construtor de fluxo tem a SUA preferência de lateral (recolhida por padrão,
 * para dar espaço ao canvas), separada da preferência das outras telas — ver
 * `useLateralDoConstrutor`. A lista de fluxos usa a geral.
 */
export function ehConstrutorDeFluxo(pathname: string): boolean {
  return /^\/app\/fluxos\/[^/]+/.test(pathname);
}

/**
 * ⌘B / Ctrl+B alterna a lateral — menos quando a pessoa está escrevendo (campo,
 * editor rico) ou com um modal aberto: lá o atalho é de quem tem o foco.
 */
export function atalhoDaLateralVale(alvo: EventTarget | null, documento: Document): boolean {
  if (documento.querySelector('[role="dialog"][data-state="open"], [aria-modal="true"]')) return false;
  if (!(alvo instanceof Element)) return true;
  if (alvo.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']")) {
    return false;
  }
  return true;
}
