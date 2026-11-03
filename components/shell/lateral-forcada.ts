/**
 * O construtor de fluxo abre com a lateral RECOLHIDA (68px), sem mexer na
 * preferência salva: o canvas precisa da largura. A lista de fluxos não.
 */
export function lateralForcadaRecolhida(pathname: string): boolean {
  return /^\/app\/fluxos\/[^/]+/.test(pathname);
}
