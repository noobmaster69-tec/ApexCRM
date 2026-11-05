import { describe, expect, it } from "vitest";

import {
  datasDoPeriodo,
  instantesDasDatas,
  leituraDisponivel,
  nivelDaTaxa,
  percentual,
  somarResumo,
  TAXA_BOA,
  TAXA_OTIMA,
  type LinhaDoResumo,
} from "./resumo";

const periodo = { de: new Date("2026-10-06T03:00:00Z"), ate: new Date("2026-11-05T02:59:59Z") };

function linha(p: Partial<LinhaDoResumo> & { campaign_id: string }): LinhaDoResumo {
  return {
    contact_id: Math.random().toString(36).slice(2),
    status: "sent",
    sent_at: null,
    delivered_at: null,
    read_at: null,
    replied_at: null,
    ...p,
  };
}

describe("resumo do período da tela de Campanhas", () => {
  it("a campanha antiga entra pelo envio no período, e o KPI soma só o que saiu nele", () => {
    const campanhas = [{ id: "velha", status: "completed", created_at: "2026-08-01T12:00:00Z" }];
    const linhas = [
      linha({ campaign_id: "velha", sent_at: "2026-08-02T12:00:00Z", delivered_at: "2026-08-02T12:00:05Z" }),
      linha({ campaign_id: "velha", sent_at: "2026-10-10T12:00:00Z", delivered_at: "2026-10-10T12:00:05Z" }),
    ];
    const r = somarResumo(campanhas, linhas, periodo);
    expect(r.noPeriodo).toEqual(["velha"]);
    expect(r.totais).toMatchObject({ campanhas_no_periodo: 1, enviadas: 1, entregues: 1 });
    // A linha da tabela é a campanha inteira: 2 enviadas, não 1.
    expect(r.porCampanha.get("velha")).toMatchObject({ enviadas: 2, entregues: 2 });
  });

  it("rascunho e cancelada entram pela criação; a antiga sem envio no período fica de fora", () => {
    const campanhas = [
      { id: "rascunho", status: "draft", created_at: "2026-10-20T12:00:00Z" },
      { id: "cancelada", status: "cancelled", created_at: "2026-11-01T12:00:00Z" },
      { id: "antiga", status: "completed", created_at: "2026-07-01T12:00:00Z" },
    ];
    const r = somarResumo(campanhas, [linha({ campaign_id: "antiga", sent_at: "2026-07-02T12:00:00Z" })], periodo);
    expect(r.noPeriodo).toEqual(["rascunho", "cancelada"]);
    expect(r.totais.taxa_resposta).toBeNull();
  });

  it("quem está enviando agora entra mesmo sem envio no período (o destaque ao vivo)", () => {
    const r = somarResumo([{ id: "viva", status: "running", created_at: "2026-01-01T00:00:00Z" }], [], periodo);
    expect(r.noPeriodo).toEqual(["viva"]);
  });

  it("responderam conta CONTATO único: quem respondeu a duas campanhas é uma pessoa", () => {
    const campanhas = [
      { id: "a", status: "completed", created_at: "2026-10-07T00:00:00Z" },
      { id: "b", status: "completed", created_at: "2026-10-08T00:00:00Z" },
    ];
    const linhas = [
      linha({ campaign_id: "a", contact_id: "maria", sent_at: "2026-10-07T10:00:00Z", replied_at: "2026-10-07T11:00:00Z" }),
      linha({ campaign_id: "b", contact_id: "maria", sent_at: "2026-10-08T10:00:00Z", replied_at: "2026-10-08T11:00:00Z" }),
      linha({ campaign_id: "b", contact_id: "joao", sent_at: "2026-10-08T10:00:00Z" }),
      linha({ campaign_id: "b", contact_id: "ana", sent_at: "2026-10-08T10:00:00Z" }),
    ];
    const r = somarResumo(campanhas, linhas, periodo);
    expect(r.totais).toMatchObject({ enviadas: 4, responderam: 1, taxa_resposta: 25 });
    // A linha da campanha conta as respostas DELA.
    expect(r.porCampanha.get("b")?.responderam).toBe(1);
  });

  it("restantes = elegíveis que ainda não saíram; falha conta à parte", () => {
    const campanhas = [{ id: "c", status: "running", created_at: "2026-10-10T00:00:00Z" }];
    const linhas = [
      linha({ campaign_id: "c", status: "pending" }),
      linha({ campaign_id: "c", status: "queued" }),
      linha({ campaign_id: "c", status: "failed" }),
      linha({ campaign_id: "c", status: "delivered", sent_at: "2026-10-11T00:00:00Z", delivered_at: "2026-10-11T00:00:01Z" }),
    ];
    expect(somarResumo(campanhas, linhas, periodo).porCampanha.get("c")).toMatchObject({
      enviadas: 1,
      restantes: 2,
      falharam: 1,
    });
  });
});

describe("a taxa de resposta e o nível", () => {
  it("sem base não há número: nunca NaN", () => {
    expect(percentual(3, 0)).toBeNull();
    expect(percentual(Number.NaN, 10)).toBeNull();
    expect(nivelDaTaxa(0, 0)).toBe("sem");
  });

  it("os limites são as constantes, inclusivos por baixo", () => {
    expect(TAXA_OTIMA).toBe(20);
    expect(TAXA_BOA).toBe(10);
    expect(nivelDaTaxa(20, 100)).toBe("otima");
    expect(nivelDaTaxa(19, 100)).toBe("boa");
    expect(nivelDaTaxa(10, 100)).toBe("boa");
    expect(nivelDaTaxa(9, 100)).toBe("baixa");
  });

  it("leitura indisponível só quando muita entrega e nenhum lido", () => {
    expect(leituraDisponivel({ entregues: 12, lidas: 0 })).toBe(false);
    expect(leituraDisponivel({ entregues: 12, lidas: 1 })).toBe(true);
    expect(leituraDisponivel({ entregues: 3, lidas: 0 })).toBe(true);
  });
});

describe("o período", () => {
  it("30 dias contam hoje: de 06/10 a 04/11", () => {
    expect(datasDoPeriodo("30d", new Date(2026, 10, 4, 15))).toEqual({ de: "2026-10-06", ate: "2026-11-04" });
    expect(datasDoPeriodo("hoje", new Date(2026, 10, 4, 15))).toEqual({ de: "2026-11-04", ate: "2026-11-04" });
  });

  it("as datas viram o começo do primeiro dia e o fim do último; fim antes do começo é inválido", () => {
    const r = instantesDasDatas("2026-10-06", "2026-10-06");
    expect(r?.ate.getTime()).toBeGreaterThan(r!.de.getTime());
    expect(instantesDasDatas("2026-10-07", "2026-10-06")).toBeNull();
    expect(instantesDasDatas("ontem", "2026-10-06")).toBeNull();
  });
});
