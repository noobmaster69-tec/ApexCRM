import { describe, expect, it } from "vitest";

import { viewportMantendoOCentro } from "./centro-ao-redimensionar";

describe("o canvas mantém o centro quando a lateral muda de largura", () => {
  it("expandir a lateral (canvas 180px mais estreito) mantém o ponto do meio e o zoom", () => {
    const vp = { x: 100, y: 40, zoom: 0.8 };
    const antes = { width: 1372, height: 900 };
    const depois = { width: 1192, height: 900 };
    const novo = viewportMantendoOCentro(vp, antes, depois);
    // O ponto do fluxo que estava no centro da tela antes…
    const centroAntes = { x: (antes.width / 2 - vp.x) / vp.zoom, y: (antes.height / 2 - vp.y) / vp.zoom };
    // …é o que fica no centro depois.
    const centroDepois = { x: (depois.width / 2 - novo.x) / novo.zoom, y: (depois.height / 2 - novo.y) / novo.zoom };
    expect(centroDepois).toEqual(centroAntes);
    expect(novo.zoom).toBe(0.8);
  });

  it("recolher de volta desfaz o deslocamento", () => {
    const vp = { x: 10, y: 0, zoom: 1.25 };
    const ida = viewportMantendoOCentro(vp, { width: 1000, height: 700 }, { width: 820, height: 700 });
    expect(viewportMantendoOCentro(ida, { width: 820, height: 700 }, { width: 1000, height: 700 })).toEqual(vp);
  });
});
