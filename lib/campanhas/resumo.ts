/**
 * O RESUMO DO PERÍODO da tela de Campanhas (fork jhoow, redesenho de nov/2026).
 *
 * Funções puras, usadas pela rota `GET /api/v1/campaigns/resumo` e pela tela:
 *
 *  - quem ENTRA no período: a campanha que teve QUALQUER envio dentro dele, a
 *    que foi criada nele (para aparecerem rascunho e cancelada) e a que está
 *    enviando agora (o destaque ao vivo não pode sumir porque a janela do dia
 *    ainda não abriu);
 *  - os KPIs somam só os CARIMBOS que caem no período — uma campanha que começou
 *    há dois meses conta aqui só o que saiu nestes 30 dias;
 *  - os números de cada linha são os da campanha inteira (o "48 de 92").
 *
 * "Responderam" é o carimbo `replied_at`, que a plataforma já põe só quando o
 * contato fala dentro da janela de atribuição (72 h, `lib/campanhas/resposta.ts`)
 * — o mesmo número da tela de detalhe. No KPI do período ele é contado por
 * CONTATO único: quem respondeu a duas campanhas é uma pessoa que respondeu.
 */
import type { StatusDaCampanha } from "./tipos";

/** Os degraus da taxa de resposta (respostas ÷ enviadas, em %). */
export const TAXA_OTIMA = 20;
export const TAXA_BOA = 10;

export type NivelDaTaxa = "otima" | "boa" | "baixa" | "sem";

/** Percentual inteiro, ou `null` sem base — a tela mostra "—", nunca "NaN%". */
export function percentual(parte: number, base: number): number | null {
  if (!(base > 0) || !Number.isFinite(parte)) return null;
  return Math.round((parte / base) * 100);
}

export function nivelDaTaxa(respostas: number, enviadas: number): NivelDaTaxa {
  const p = percentual(respostas, enviadas);
  if (p === null) return "sem";
  if (p >= TAXA_OTIMA) return "otima";
  if (p >= TAXA_BOA) return "boa";
  return "baixa";
}

/** Uma linha de destinatário com o que a soma lê (sem PII além do id). */
export interface LinhaDoResumo {
  campaign_id: string;
  contact_id: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
}

export const COLUNAS_DO_RESUMO = "campaign_id, contact_id, status, sent_at, delivered_at, read_at, replied_at";

/** O que a soma precisa saber da campanha. */
export interface CampanhaParaResumo {
  id: string;
  status: StatusDaCampanha | string;
  created_at: string;
}

export interface ContagemDaLinha {
  enviadas: number;
  entregues: number;
  lidas: number;
  responderam: number;
  falharam: number;
  /** Elegíveis que ainda não saíram (pendente, na fila ou enviando). */
  restantes: number;
}

export interface TotaisDoPeriodo {
  campanhas_no_periodo: number;
  enviadas: number;
  entregues: number;
  lidas: number;
  /** Contatos ÚNICOS que responderam no período. */
  responderam: number;
  falharam: number;
  /** Inteiro de 0 a 100, ou `null` sem envio no período. */
  taxa_resposta: number | null;
}

const RESTANTES = new Set(["pending", "queued", "sending"]);

function dentro(iso: string | null, de: number, ate: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= de && t <= ate;
}

export function contagemVazia(): ContagemDaLinha {
  return { enviadas: 0, entregues: 0, lidas: 0, responderam: 0, falharam: 0, restantes: 0 };
}

/**
 * Soma tudo de uma vez: as contagens de cada campanha (vida inteira), quem
 * entra no período e os KPIs do período.
 */
export function somarResumo(
  campanhas: readonly CampanhaParaResumo[],
  linhas: readonly LinhaDoResumo[],
  periodo: { de: Date; ate: Date },
): {
  porCampanha: Map<string, ContagemDaLinha>;
  noPeriodo: string[];
  totais: TotaisDoPeriodo;
} {
  const de = periodo.de.getTime();
  const ate = periodo.ate.getTime();
  const porCampanha = new Map<string, ContagemDaLinha>();
  for (const c of campanhas) porCampanha.set(c.id, contagemVazia());

  const comEnvioNoPeriodo = new Set<string>();
  const responderam = new Set<string>();
  let enviadas = 0;
  let entregues = 0;
  let lidas = 0;
  let falharam = 0;

  for (const l of linhas) {
    const c = porCampanha.get(l.campaign_id);
    if (!c) continue;
    if (l.sent_at) c.enviadas += 1;
    if (l.delivered_at) c.entregues += 1;
    if (l.read_at) c.lidas += 1;
    if (l.replied_at) c.responderam += 1;
    if (l.status === "failed") c.falharam += 1;
    if (RESTANTES.has(l.status)) c.restantes += 1;

    if (dentro(l.sent_at, de, ate)) {
      enviadas += 1;
      comEnvioNoPeriodo.add(l.campaign_id);
    }
    if (dentro(l.delivered_at, de, ate)) entregues += 1;
    if (dentro(l.read_at, de, ate)) lidas += 1;
    if (dentro(l.replied_at, de, ate)) responderam.add(l.contact_id);
    // A falha não tem carimbo próprio: conta no período pela criação da
    // campanha ou pelo envio dela no período — o que já está em comEnvioNoPeriodo.
  }

  const noPeriodo = campanhas
    .filter((c) => comEnvioNoPeriodo.has(c.id) || dentro(c.created_at, de, ate) || c.status === "running")
    .map((c) => c.id);
  for (const id of noPeriodo) {
    if (comEnvioNoPeriodo.has(id)) falharam += porCampanha.get(id)?.falharam ?? 0;
  }

  return {
    porCampanha,
    noPeriodo,
    totais: {
      campanhas_no_periodo: noPeriodo.length,
      enviadas,
      entregues,
      lidas,
      responderam: responderam.size,
      falharam,
      taxa_resposta: percentual(responderam.size, enviadas),
    },
  };
}

/**
 * A leitura existe nesta conexão? O WhatsApp só devolve o "lido" quando o
 * contato deixa a confirmação de leitura ligada, e há conexão que nunca devolve.
 * A plataforma não guarda essa capacidade; o que dá para afirmar é o padrão:
 * dez ou mais entregues e NENHUM lido é leitura indisponível, não desinteresse.
 */
export function leituraDisponivel(c: Pick<ContagemDaLinha, "entregues" | "lidas">): boolean {
  return !(c.entregues >= 10 && c.lidas === 0);
}

/** O período de "Hoje", "7 dias"… em instantes, no relógio de quem pede. */
export const PERIODOS_PRONTOS = ["hoje", "7d", "30d", "90d"] as const;
export type PeriodoPronto = (typeof PERIODOS_PRONTOS)[number];

const DIAS_DO_PERIODO: Record<PeriodoPronto, number> = { hoje: 1, "7d": 7, "30d": 30, "90d": 90 };

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** "2026-11-04" no relógio local. */
export function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/** As datas (AAAA-MM-DD, inclusivas) de um período pronto, contando hoje. */
export function datasDoPeriodo(p: PeriodoPronto, agora: Date = new Date()): { de: string; ate: string } {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - (DIAS_DO_PERIODO[p] - 1));
  return { de: diaLocal(inicio), ate: diaLocal(agora) };
}

/** O intervalo de instantes de duas datas locais (do começo do primeiro dia ao fim do último). */
export function instantesDasDatas(de: string, ate: string): { de: Date; ate: Date } | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(de);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ate);
  if (!a || !b) return null;
  const ini = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]), 0, 0, 0, 0);
  const fim = new Date(Number(b[1]), Number(b[2]) - 1, Number(b[3]), 23, 59, 59, 999);
  if (!Number.isFinite(ini.getTime()) || !Number.isFinite(fim.getTime()) || fim < ini) return null;
  return { de: ini, ate: fim };
}
