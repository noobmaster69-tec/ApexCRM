import { describe, expect, it } from "vitest";

import {
  corpoDaCota,
  corpoDosTetos,
  equivalenciaDosSegundos,
  errosDoRitmo,
  modoDoRitmo,
  programacaoDaCampanha,
  resumoDoRitmo,
  type ValoresDeRitmo,
} from "@/components/campanhas/CamposDeRitmo";
import { valoresDaCampanha } from "@/app/app/campaigns/_form/valores";
import { descricaoDoIntervalo, inicioDoPeriodo, intervaloComVariacao, intervaloDaCota, limiteDaCota, proximoPeriodo } from "./cota";

/** Cota por período (fork jhoow, 9020): "3 por dia numa janela de 9 h = 1 a cada 3 h". */
describe("cota da campanha", () => {
  const janela9h = { inicio: 9 * 60, fim: 18 * 60 };

  it("divide o período útil pela cota", () => {
    expect(intervaloDaCota({ quantidade: 3, periodo: "dia" }, janela9h)).toBe(3 * 3600);
    expect(intervaloDaCota({ quantidade: 3, periodo: "dia" }, null)).toBe(8 * 3600);
    expect(intervaloDaCota({ quantidade: 10, periodo: "hora" }, janela9h)).toBe(360);
    expect(intervaloDaCota({ quantidade: 21, periodo: "semana" }, janela9h)).toBe(3 * 3600);
    expect(intervaloDaCota({ quantidade: 90, periodo: "mes" }, janela9h)).toBe(3 * 3600);
    expect(descricaoDoIntervalo(3 * 3600)).toEqual({ valor: 3, unidade: "h" });
  });

  it("variação de ±20%", () => {
    expect(intervaloComVariacao(1000, () => 0)).toBe(800);
    expect(intervaloComVariacao(1000, () => 0.5)).toBe(1000);
    expect(intervaloComVariacao(1000, () => 1)).toBe(1200);
  });

  it("limite da janela: o envio mais apressado (−20%) nunca fica abaixo do piso de 10 s", () => {
    // 9 h = 32400 s; o menor intervalo-base é 12,5 s → 2592 cabem.
    expect(limiteDaCota("dia", janela9h)).toBe(2592);
    expect(limiteDaCota("hora", janela9h)).toBe(288);
    const segundos = intervaloDaCota({ quantidade: limiteDaCota("dia", janela9h), periodo: "dia" }, janela9h);
    expect(intervaloComVariacao(segundos, () => 0)).toBeGreaterThanOrEqual(10);
  });

  it("período no fuso da campanha: dia, hora, semana (segunda) e mês", () => {
    const agora = new Date("2026-10-07T19:37:00Z"); // quarta, 20:37 em Lisboa (UTC+1)
    expect(inicioDoPeriodo(agora, "Europe/Lisbon", "dia").toISOString()).toBe("2026-10-06T23:00:00.000Z");
    expect(inicioDoPeriodo(agora, "Europe/Lisbon", "hora").toISOString()).toBe("2026-10-07T19:00:00.000Z");
    expect(inicioDoPeriodo(agora, "Europe/Lisbon", "semana").toISOString()).toBe("2026-10-04T23:00:00.000Z"); // segunda 05/10
    expect(inicioDoPeriodo(agora, "Europe/Lisbon", "mes").toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(proximoPeriodo(agora, "Europe/Lisbon", "dia").toISOString()).toBe("2026-10-07T23:00:00.000Z");
    // o mês que atravessa a volta do horário de verão (25/10): 1º de novembro já é UTC+0
    expect(proximoPeriodo(agora, "Europe/Lisbon", "mes").toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("formulário: quantidade e período juntos", () => {
    const base = { minIntervalo: "60", maxIntervalo: "180", tetoDiario: "", tetoHorario: "", janelaInicio: "09:00", janelaFim: "18:00", fuso: "", modoRitmo: "cota" } as ValoresDeRitmo;
    expect(errosDoRitmo({ ...base, cotaQuantidade: "3", cotaPeriodo: "dia" })).toEqual([]);
    expect(errosDoRitmo({ ...base, cotaQuantidade: "3", cotaPeriodo: "" })).toEqual(["cota"]);
    expect(errosDoRitmo({ ...base, cotaQuantidade: "0", cotaPeriodo: "dia" })).toEqual(["cota"]);
    expect(errosDoRitmo({ ...base, cotaQuantidade: "5000", cotaPeriodo: "dia" })).toEqual(["cota_acima"]);
    expect(corpoDaCota({ cotaQuantidade: "3", cotaPeriodo: "dia" })).toEqual({ cota_quantidade: 3, cota_periodo: "dia" });
    expect(corpoDaCota({ cotaQuantidade: "", cotaPeriodo: "" })).toEqual({ cota_quantidade: null, cota_periodo: null });
  });
});

/** Etapa 4: "Quantos contatos chamar" × "Ritmo de envio (avançado)" — um modo só. */
describe("modo do ritmo da campanha", () => {
  const base = { minIntervalo: "5", maxIntervalo: "1", tetoDiario: "50", tetoHorario: "10", janelaInicio: "09:00", janelaFim: "18:00", fuso: "" } as ValoresDeRitmo;

  it("campanha nova: Opção A marcada, por dia, janela 09:00–18:00", () => {
    const v = valoresDaCampanha(null);
    expect(v).toMatchObject({ modoRitmo: "cota", cotaPeriodo: "dia", janelaInicio: "09:00", janelaFim: "18:00" });
  });

  it("campanha antiga só com intervalo abre na Opção B; com cota, na A (backfill pela cota)", () => {
    expect(programacaoDaCampanha({ janela_inicio_hora: 9, janela_fim_hora: 18 }).modoRitmo).toBe("intervalo");
    expect(programacaoDaCampanha({ cota_quantidade: 3, cota_periodo: "dia" }).modoRitmo).toBe("cota");
  });

  it("o modo escolhido decide o que vale: os campos do outro não são validados nem enviados", () => {
    const cota = { ...base, modoRitmo: "cota" as const, cotaQuantidade: "3", cotaPeriodo: "dia" as const };
    // mín/máx inválidos não importam na Opção A
    expect(errosDoRitmo(cota)).toEqual([]);
    expect(corpoDosTetos(cota)).toEqual({ teto_diario: null, teto_horario: null });
    // trocar para B não apaga a cota digitada, mas ela não vai
    const intervalo = { ...cota, modoRitmo: "intervalo" as const, minIntervalo: "60", maxIntervalo: "180" };
    expect(modoDoRitmo(intervalo)).toBe("intervalo");
    expect(intervalo.cotaQuantidade).toBe("3");
    expect(corpoDaCota(intervalo)).toEqual({ cota_quantidade: null, cota_periodo: null });
    expect(corpoDosTetos(intervalo)).toEqual({ teto_diario: 50, teto_horario: 10 });
    expect(errosDoRitmo({ ...intervalo, minIntervalo: "5" })).toEqual(["minimo"]);
  });

  it("resumo do detalhe mostra só o modo ativo; equivalência legível dos segundos", () => {
    const t = (s: string) => s;
    expect(resumoDoRitmo({ ...base, modoRitmo: "cota", cotaQuantidade: "3", cotaPeriodo: "dia" }, t)).toBe("3 por dia, das 09:00 às 18:00");
    expect(resumoDoRitmo({ ...base, modoRitmo: "intervalo", minIntervalo: "60", maxIntervalo: "180" }, t)).toBe("1 a 3 min entre envios");
    expect(equivalenciaDosSegundos("60")).toBe("60 s = 1 min");
    expect(equivalenciaDosSegundos("90")).toBe("90 s = 1,5 min");
    expect(equivalenciaDosSegundos("30")).toBeNull();
  });
});
