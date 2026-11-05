import { describe, expect, it } from "vitest";

import { criarCampanhaSchema } from "@/lib/campanhas/schemas";

import { contaDoEnvio, enviosPorDia, marcasDoDia, textoDoIntervalo } from "./calculos";
import { corpoDoRascunho, errosDoPasso, passoPronto, variaveisDoTexto } from "./passos";
import { valoresDaCampanha } from "./valores";

const SEM_MODELO = { ehOficial: false, modeloPronto: false };
const CANAL = "11111111-1111-4111-8111-111111111111";

const completo = {
  ...valoresDaCampanha(),
  nome: "Reativação",
  canal: CANAL,
  texto: "Oi {primeiro_nome}",
  comAlgumaTag: "vip",
  cotaQuantidade: "10",
};

describe("os cinco passos", () => {
  it("campanha nova: só o passo Funil nasce pronto (não tem campo obrigatório)", () => {
    const v = valoresDaCampanha();
    expect([1, 2, 3, 4, 5].map((p) => passoPronto(p as 1, v, SEM_MODELO))).toEqual([false, false, false, true, false]);
  });

  it("campanha completa: os cinco prontos", () => {
    expect([1, 2, 3, 4, 5].every((p) => passoPronto(p as 1, completo, SEM_MODELO))).toBe(true);
  });

  it("cada erro vai para o campo que o causa", () => {
    const v = { ...completo, nome: " ", baseLegal: "legitimate_interest" as const, liaRef: "" };
    expect(errosDoPasso(1, v, SEM_MODELO).map((e) => e.campo)).toEqual(["nome", "lia"]);
    expect(errosDoPasso(2, { ...completo, comAlgumaTag: "" }, SEM_MODELO).map((e) => e.campo)).toEqual(["criterio"]);
    expect(errosDoPasso(2, { ...completo, fonte: "importacao" as const }, SEM_MODELO).map((e) => e.campo)).toEqual(["lista"]);
    expect(errosDoPasso(3, { ...completo, modo: "flow" as const }, SEM_MODELO).map((e) => e.campo)).toEqual(["fluxo"]);
    expect(errosDoPasso(3, completo, { ehOficial: true, modeloPronto: false }).map((e) => e.campo)).toEqual(["modelo"]);
    expect(errosDoPasso(5, { ...completo, janelaFim: "08:00" }, SEM_MODELO).map((e) => e.campo)).toContain("janela");
  });

  it("as variáveis do texto, sem repetir e sem o texto de reserva", () => {
    expect(variaveisDoTexto("Oi {primeiro_nome}, {nome_saudacao|tudo bem}? {primeiro_nome}")).toEqual([
      "primeiro_nome",
      "nome_saudacao",
    ]);
  });
});

describe("salvamento automático do rascunho", () => {
  it("sem nome ou sem número ainda não salva", () => {
    expect(corpoDoRascunho(valoresDaCampanha(), SEM_MODELO)).toBeNull();
    expect(corpoDoRascunho({ ...valoresDaCampanha(), nome: "X" }, SEM_MODELO)).toBeNull();
  });

  it("com nome e número já cria o rascunho, e o corpo passa na validação do servidor", () => {
    const corpo = corpoDoRascunho({ ...valoresDaCampanha(), nome: "X", canal: CANAL }, SEM_MODELO)!;
    expect(corpo.audience_filter).toBeUndefined();
    expect(criarCampanhaSchema.safeParse(corpo).success).toBe(true);
  });

  it("fluxo ainda não escolhido não vai como modo fluxo (o servidor recusaria)", () => {
    const corpo = corpoDoRascunho({ ...completo, modo: "flow" as const, fluxo: "" }, SEM_MODELO)!;
    expect(corpo.mode).toBeUndefined();
    expect(criarCampanhaSchema.safeParse(corpo).success).toBe(true);
  });

  it("ritmo inválido fica de fora; o resto salva", () => {
    const corpo = corpoDoRascunho({ ...completo, janelaFim: "08:00" }, SEM_MODELO)!;
    expect(corpo.janela_fim_minuto).toBeUndefined();
    expect(corpo.audience_filter).toBeDefined();
    expect(criarCampanhaSchema.safeParse(corpo).success).toBe(true);
  });

  it("Mover no funil desligado zera o funil", () => {
    const corpo = corpoDoRascunho(
      { ...completo, funil: "22222222-2222-4222-8222-222222222222", moverNoFunil: false },
      SEM_MODELO,
    )!;
    expect(corpo).toMatchObject({ pipeline_id: null, stage_id: null, recipients_pipeline_id: null });
  });
});

describe("resumo do envio", () => {
  it("10 por dia entre 09:00 e 18:00 = um a cada 54 min; 100 contatos em 10 dias", () => {
    const agora = new Date("2026-11-04T13:00:00Z"); // 10:00 em São Paulo
    const c = contaDoEnvio({ ...completo, cotaQuantidade: "10" }, 100, agora, "America/Sao_Paulo")!;
    expect(c).toMatchObject({ porDia: 10, dias: 10, inicio: "2026-11-04", fim: "2026-11-13" });
    expect(textoDoIntervalo(c.intervaloMin)).toBe("54 min");
  });

  it("depois da janela de hoje começa amanhã", () => {
    const agora = new Date("2026-11-04T22:00:00Z"); // 19:00
    expect(contaDoEnvio(completo, 5, agora, "America/Sao_Paulo")!.inicio).toBe("2026-11-05");
  });

  it("intervalo legível e marcas dentro da janela", () => {
    expect(textoDoIntervalo(90)).toBe("1h30");
    expect(textoDoIntervalo(120)).toBe("2h");
    const marcas = marcasDoDia({ inicio: 540, fim: 1080 }, 2);
    expect(marcas).toHaveLength(2);
    expect(marcas[0]).toBeGreaterThan(37.5);
    expect(marcas[1]).toBeLessThan(75);
  });

  it("0 por dia não tem conta", () => {
    expect(enviosPorDia({ ...completo, cotaQuantidade: "0" })).toBeNull();
  });
});
