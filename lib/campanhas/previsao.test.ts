import { describe, expect, it } from "vitest";

import { camposDoInstante } from "./agendamento";
import { previsaoDoFim } from "./previsao";

const FUSO = "America/Sao_Paulo";
const janela = { inicio: 9 * 60, fim: 18 * 60 };

describe("previsão do fim da campanha", () => {
  it("cabe hoje: agora + (restantes − 1) × cadência", () => {
    // 10:00 em São Paulo; 10 restantes a cada 6 min → o último sai às 10:54.
    const agora = new Date("2026-11-04T13:00:00Z");
    const fim = previsaoDoFim({ agora, restantes: 10, cadenciaSegundos: 360, janela, fuso: FUSO });
    expect(camposDoInstante(fim!, FUSO)).toEqual({ data: "2026-11-04", hora: "10:54" });
  });

  it("não cabe hoje: o resto continua quando a janela abre amanhã", () => {
    // 17:30, cadência de 30 min: cabem 17:30 (1). Os outros 2 saem amanhã 09:00 e 09:30.
    const agora = new Date("2026-11-04T20:30:00Z");
    const fim = previsaoDoFim({ agora, restantes: 3, cadenciaSegundos: 1800, janela, fuso: FUSO });
    expect(camposDoInstante(fim!, FUSO)).toEqual({ data: "2026-11-05", hora: "09:30" });
  });

  it("fora da janela começa na próxima abertura", () => {
    const agora = new Date("2026-11-04T23:00:00Z"); // 20:00 local
    const fim = previsaoDoFim({ agora, restantes: 1, cadenciaSegundos: 600, janela, fuso: FUSO });
    expect(camposDoInstante(fim!, FUSO)).toEqual({ data: "2026-11-05", hora: "09:00" });
  });

  it("o teto diário corta o dia", () => {
    const agora = new Date("2026-11-04T12:00:00Z"); // 09:00
    const fim = previsaoDoFim({ agora, restantes: 3, cadenciaSegundos: 60, janela, fuso: FUSO, tetoDiario: 2 });
    expect(camposDoInstante(fim!, FUSO).data).toBe("2026-11-05");
  });

  it("sem restantes ou sem cadência não há previsão", () => {
    const agora = new Date("2026-11-04T13:00:00Z");
    expect(previsaoDoFim({ agora, restantes: 0, cadenciaSegundos: 60, janela, fuso: FUSO })).toBeNull();
    expect(previsaoDoFim({ agora, restantes: 5, cadenciaSegundos: null, janela, fuso: FUSO })).toBeNull();
  });
});
