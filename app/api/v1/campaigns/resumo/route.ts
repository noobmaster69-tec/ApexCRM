/**
 * GET /api/v1/campaigns/resumo?de=&ate= — o resumo do período da tela de
 * Campanhas: os KPIs (enviadas, entregues, lidas, responderam e a taxa de
 * resposta) e, para cada campanha do período, os números da linha da tabela.
 *
 * `de` e `ate` são INSTANTES ISO (a tela converte as datas no relógio de quem
 * olha). A regra de quem entra e do que soma mora em `lib/campanhas/resumo.ts`.
 *
 * Mesma forma da rota de métricas: sem RPC nem agregação no banco — traz só os
 * carimbos dos destinatários elegíveis e conta em memória, com teto. Acima dele
 * a resposta diz `parcial: true` em vez de mentir.
 *
 * Papel: `manager`, como a lista.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { intervaloDaCota, PERIODOS_DA_COTA, type PeriodoDaCota } from "@/lib/campanhas/cota";
import {
  COLUNAS_DO_RESUMO,
  contagemVazia,
  leituraDisponivel,
  somarResumo,
  type LinhaDoResumo,
} from "@/lib/campanhas/resumo";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Campanhas lidas por chamada (as mais novas primeiro). */
const TETO_DE_CAMPANHAS = 1_000;
/** Linhas de destinatário lidas por chamada. */
const TETO_DE_LINHAS = 60_000;
/** O PostgREST devolve no máximo isto por página. */
const PAGINA = 1_000;
/** Ids por `in(...)`, para a URL não estourar. */
const LOTE_DE_IDS = 80;

const consultaSchema = z.object({
  de: z.string().datetime({ offset: true }),
  ate: z.string().datetime({ offset: true }),
});

const COLUNAS =
  "id, name, status, created_at, started_at, completed_at, cancelled_at, scheduled_at, next_send_at, " +
  "snapshot_total, snapshot_eligible, mode, flow_id, message_mode, provider_template_name, message_body, " +
  "audience_filter, intervalo_segundos, min_interval_seconds, max_interval_seconds, " +
  "janela_inicio_minuto, janela_fim_minuto, janela_inicio_hora, janela_fim_hora, timezone, " +
  "cota_quantidade, cota_periodo, teto_diario, velocidade, channel_session_id";

interface CampanhaLida {
  id: string;
  name: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  scheduled_at: string | null;
  next_send_at: string | null;
  snapshot_total: number | null;
  snapshot_eligible: number | null;
  mode: string | null;
  flow_id: string | null;
  message_mode: string | null;
  provider_template_name: string | null;
  message_body: string | null;
  audience_filter: Record<string, unknown> | null;
  intervalo_segundos: number | null;
  min_interval_seconds: number | null;
  max_interval_seconds: number | null;
  janela_inicio_minuto: number | null;
  janela_fim_minuto: number | null;
  janela_inicio_hora: number | null;
  janela_fim_hora: number | null;
  timezone: string | null;
  cota_quantidade: number | null;
  cota_periodo: string | null;
  teto_diario: number | null;
  velocidade: string | null;
  channel_session_id: string;
}

const textoDe = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const listaDe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

function lotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) r.push(itens.slice(i, i + tamanho));
  return r;
}

/** Segundos entre dois envios, do jeito que a campanha está configurada. */
function cadencia(c: CampanhaLida, janela: { inicio: number; fim: number } | null): number | null {
  if (c.velocidade === "rapida") return 1;
  const periodo = (PERIODOS_DA_COTA as readonly string[]).includes(c.cota_periodo ?? "")
    ? (c.cota_periodo as PeriodoDaCota)
    : null;
  if (c.cota_quantidade && c.cota_quantidade > 0 && periodo) {
    return intervaloDaCota({ quantidade: c.cota_quantidade, periodo }, janela);
  }
  if (c.intervalo_segundos && c.intervalo_segundos > 0) return c.intervalo_segundos;
  const min = c.min_interval_seconds ?? 60;
  const max = c.max_interval_seconds ?? 180;
  return Math.max(1, Math.round((min + max) / 2));
}

function janelaDe(c: CampanhaLida): { inicio: number; fim: number } | null {
  const inicio = c.janela_inicio_minuto ?? (c.janela_inicio_hora != null ? c.janela_inicio_hora * 60 : null);
  const fim = c.janela_fim_minuto ?? (c.janela_fim_hora != null ? c.janela_fim_hora * 60 : null);
  return inicio !== null && fim !== null && fim > inicio ? { inicio, fim } : null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = consultaSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) {
    return fail("validation_failed", t("Informe o período (de e até)."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const de = new Date(parsed.data.de);
  const ate = new Date(parsed.data.ate);
  if (ate.getTime() < de.getTime()) {
    return fail("validation_failed", t("O fim do período tem de vir depois do começo."), 422, { requestId });
  }

  const orgId = authz.org.orgId;
  const supabase = await createClient();

  // Candidatas: criadas até o fim do período e não encerradas antes do começo.
  // O filtro fino (teve envio no período?) é feito em memória, depois dos carimbos.
  const { data: lidas, error } = await supabase
    .from("campaigns")
    .select(COLUNAS)
    .eq("organization_id", orgId)
    .lte("created_at", ate.toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(TETO_DE_CAMPANHAS);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const comecou = de.getTime();
  const candidatas = ((lidas ?? []) as unknown as CampanhaLida[]).filter((c) => {
    const fim = c.completed_at ?? c.cancelled_at;
    return !fim || Date.parse(fim) >= comecou || Date.parse(c.created_at) >= comecou;
  });

  // Os carimbos dos destinatários elegíveis, em páginas, até o teto.
  const linhas: LinhaDoResumo[] = [];
  let parcial = false;
  const comLista = candidatas.filter((c) => (c.snapshot_total ?? 0) > 0 || c.status !== "draft");
  for (const lote of lotes(comLista.map((c) => c.id), LOTE_DE_IDS)) {
    for (let desde = 0; ; desde += PAGINA) {
      if (linhas.length >= TETO_DE_LINHAS) {
        parcial = true;
        break;
      }
      const { data: pagina, error: erroDasLinhas } = await supabase
        .from("campaign_recipients")
        .select(COLUNAS_DO_RESUMO)
        .eq("organization_id", orgId)
        .eq("eligibility_status", "eligible")
        .in("campaign_id", lote)
        .order("id", { ascending: true })
        .range(desde, desde + PAGINA - 1);
      if (erroDasLinhas) return fail("internal_error", erroDasLinhas.message, 500, { requestId });
      const recebidas = (pagina ?? []) as unknown as LinhaDoResumo[];
      linhas.push(...recebidas);
      if (recebidas.length < PAGINA) break;
    }
    if (parcial) break;
  }

  const soma = somarResumo(candidatas, linhas, { de, ate });
  const doPeriodo = candidatas.filter((c) => soma.noPeriodo.includes(c.id));

  // Os nomes que a linha mostra: o fluxo, a lista importada e o funil do público.
  const idsDeFluxo = [...new Set(doPeriodo.filter((c) => c.mode === "flow" && c.flow_id).map((c) => c.flow_id!))];
  const idsDeLista = [
    ...new Set(doPeriodo.map((c) => textoDe(c.audience_filter?.lista_importada)).filter((x): x is string => !!x)),
  ];
  const idsDeFunil = [
    ...new Set(doPeriodo.flatMap((c) => listaDe(c.audience_filter?.funis).slice(0, 1))),
  ];
  // Admin com o filtro de organização explícito (resolvido do papel, nunca do
  // pedido), como `GET /api/v1/listas`: só os NOMES saem destas três leituras.
  const admin = createAdminClient();
  const [fluxos, listas, funis, totalDaConta] = await Promise.all([
    idsDeFluxo.length
      ? admin.from("followup_flow_pointers").select("id, name").eq("organization_id", orgId).in("id", idsDeFluxo)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    idsDeLista.length
      ? admin
          .from("campaign_audience_sources")
          .select("id, name")
          .eq("organization_id", orgId)
          .in("id", idsDeLista)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    idsDeFunil.length
      ? admin.from("crm_pipelines").select("id, name").eq("organization_id", orgId).in("id", idsDeFunil)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
  ]);
  const nomeDe = (r: { data: unknown }) =>
    new Map(((r.data ?? []) as Array<{ id: string; name: string | null }>).map((x) => [x.id, x.name ?? null]));
  const nomesDeFluxo = nomeDe(fluxos);
  const nomesDeLista = nomeDe(listas);
  const nomesDeFunil = nomeDe(funis);

  const campanhas = doPeriodo.map((c) => {
    const filtro = c.audience_filter ?? {};
    const contagem = soma.porCampanha.get(c.id) ?? contagemVazia();
    const janela = janelaDe(c);
    const listaId = textoDe(filtro.lista_importada);
    const funilId = listaDe(filtro.funis)[0] ?? null;
    const tags = [...listaDe(filtro.com_alguma_tag), ...listaDe(filtro.com_todas_tags)];
    const fonte = textoDe(filtro.fonte);
    const lista = listaId
      ? { tipo: "lista" as const, id: listaId, nome: nomesDeLista.get(listaId) ?? null }
      : funilId && fonte !== "etiqueta"
        ? { tipo: "funil" as const, id: funilId, nome: nomesDeFunil.get(funilId) ?? null }
        : tags.length > 0
          ? { tipo: "etiquetas" as const, id: null, nome: tags.join(", ") }
          : { tipo: "crm" as const, id: null, nome: null };
    const ehFluxo = c.mode === "flow";
    const conteudo = ehFluxo
      ? (nomesDeFluxo.get(c.flow_id ?? "") ?? null)
      : c.message_mode === "template"
        ? c.provider_template_name
        : (c.message_body ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
    return {
      id: c.id,
      nome: c.name,
      status: c.status,
      tipo: ehFluxo ? ("fluxo" as const) : ("mensagem" as const),
      conteudo_origem: ehFluxo ? ("fluxo" as const) : c.message_mode === "template" ? ("modelo" as const) : ("texto" as const),
      conteudo,
      lista: { ...lista, total: c.snapshot_eligible ?? 0, preparada: (c.snapshot_total ?? 0) > 0 },
      criada_em: c.created_at,
      iniciada_em: c.started_at,
      concluida_em: c.completed_at,
      cancelada_em: c.cancelled_at,
      agendada_em: c.scheduled_at,
      proximo_envio_em: c.next_send_at,
      ritmo: {
        cadencia_segundos: cadencia(c, janela),
        janela_inicio_minuto: janela?.inicio ?? null,
        janela_fim_minuto: janela?.fim ?? null,
        fuso: c.timezone,
        cota_quantidade: c.cota_quantidade,
        cota_periodo: c.cota_periodo,
        teto_diario: c.teto_diario,
      },
      contagem,
      leitura_disponivel: leituraDisponivel(contagem),
    };
  });

  return ok(
    {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      resumo: soma.totais,
      campanhas,
      total_na_conta: (totalDaConta as { count: number | null }).count ?? campanhas.length,
      parcial: parcial || (lidas ?? []).length >= TETO_DE_CAMPANHAS,
    },
    { requestId },
  );
}
