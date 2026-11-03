import { describe, expect, it } from "vitest";

import { chaveDeBusca, contemEtiqueta, etiquetaIgual, filtrarEtiquetas, juntarEtiquetas } from "./busca-de-etiqueta";

describe("busca de etiqueta — o seletor do bloco Etiquetas", () => {
  const lista = juntarEtiquetas(
    ["[lead-outbound-google]", "cliente", "promoção"],
    [{ tag: "Cliente", cor: "#3d72ff" }],
  );

  it("junta uso e vocabulário sem repetir, em ordem alfabética, com a grafia e a cor do vocabulário", () => {
    expect(lista).toEqual([
      { nome: "[lead-outbound-google]", cor: null },
      { nome: "Cliente", cor: "#3d72ff" },
      { nome: "promoção", cor: null },
    ]);
  });

  it("filtra sem caixa nem acento: `lead` acha `[LEAD-OUTBOUND-GOOGLE]`, `promocao` acha `promoção`", () => {
    expect(filtrarEtiquetas(lista, "LEAD").map((e) => e.nome)).toEqual(["[lead-outbound-google]"]);
    expect(filtrarEtiquetas(lista, "promocao").map((e) => e.nome)).toEqual(["promoção"]);
    expect(filtrarEtiquetas(lista, "  ")).toHaveLength(3);
  });

  it("igualdade exata ignora caixa, acento e espaços nas pontas — é o que impede criar duplicata", () => {
    expect(etiquetaIgual(lista, "  CLIENTE ")?.nome).toBe("Cliente");
    expect(etiquetaIgual(lista, "Promocao")?.nome).toBe("promoção");
    expect(etiquetaIgual(lista, "client")).toBeNull();
  });

  it("contemEtiqueta e chaveDeBusca usam a mesma régua", () => {
    expect(chaveDeBusca(" Ação ")).toBe("acao");
    expect(contemEtiqueta(["[LEAD-OUTBOUND-GOOGLE]"], "[lead-outbound-google]")).toBe(true);
    expect(contemEtiqueta(["vip"], "vip2")).toBe(false);
  });
});
