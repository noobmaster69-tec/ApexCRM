import { describe, expect, it } from "vitest";

import { afastarSobrepostos, FOLGA_ENTRE_CARTOES, type CaixaDoCartao } from "./sem-sobreposicao";

const cartao = (id: string, x: number, y: number, h: number, w = 264): CaixaDoCartao => ({
  id,
  position: { x, y },
  measured: { width: w, height: h },
});

describe("afastarSobrepostos — cartão que cresceu não cobre o vizinho", () => {
  it("empurra para baixo quem passou a ficar coberto", () => {
    const nos = [cartao("msg", 0, 0, 500), cartao("baixo", 0, 300, 100)];
    expect(afastarSobrepostos(nos, new Set(["msg"]))).toEqual(new Map([["baixo", { x: 0, y: 500 + FOLGA_ENTRE_CARTOES }]]));
  });

  it("em cascata: quem desceu e cobriu outro empurra esse também", () => {
    const nos = [cartao("msg", 0, 0, 500), cartao("b", 0, 300, 100), cartao("c", 0, 560, 100)];
    const r = afastarSobrepostos(nos, new Set(["msg"]));
    expect(r.get("b")).toEqual({ x: 0, y: 524 });
    expect(r.get("c")).toEqual({ x: 0, y: 524 + 100 + FOLGA_ENTRE_CARTOES });
  });

  it("não mexe em quem está ao lado, acima ou longe", () => {
    const nos = [
      cartao("msg", 0, 100, 500),
      cartao("lado", 400, 200, 100),
      cartao("acima", 0, -200, 150),
      cartao("longe", 0, 900, 100),
    ];
    expect(afastarSobrepostos(nos, new Set(["msg"])).size).toBe(0);
  });

  it("cartão ainda sem medida não entra na conta", () => {
    const nos = [cartao("msg", 0, 0, 500), { id: "novo", position: { x: 0, y: 100 } }];
    expect(afastarSobrepostos(nos, new Set(["msg"])).size).toBe(0);
  });
});
