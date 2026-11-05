/**
 * Quando a caixa do canvas muda de tamanho (a lateral expande ou recolhe), o
 * React Flow mantém o canto de cima à esquerda parado — e o que estava no meio
 * da tela escorrega meia largura para o lado. Deslocar a origem pela metade da
 * diferença mantém o MESMO ponto no centro e o mesmo zoom.
 */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export function viewportMantendoOCentro(
  vp: Viewport,
  antes: { width: number; height: number },
  depois: { width: number; height: number },
): Viewport {
  return {
    x: vp.x + (depois.width - antes.width) / 2,
    y: vp.y + (depois.height - antes.height) / 2,
    zoom: vp.zoom,
  };
}
