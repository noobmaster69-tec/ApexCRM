/**
 * O RASTRO de cada chamada MCP v1 (migration 9023).
 *
 * Toda chamada gera uma linha em `mcp_call_log` — organização, conexão, dono,
 * ferramenta, resultado (ok/negado/erro), quantos registros voltaram, duração,
 * IP, request_id e só as CHAVES dos argumentos (nunca os valores: eles podem
 * ser telefone, e-mail ou o texto de um cliente). É desta tabela que a tela lê
 * a atividade da conexão (as últimas 200 chamadas).
 *
 * Também mora aqui o freio de uso indevido: 20 recusas de permissão em 10
 * minutos suspendem a conexão até um admin reativar, com aviso na Central.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { avisarAdmins, avisoDeConexaoSuspensa } from "./avisos";
import type { ConexaoResolvida } from "./conexao";

export type ResultadoDaChamada = "ok" | "negado" | "erro";

export const RECUSAS_PARA_SUSPENDER = 20;
export const JANELA_DAS_RECUSAS_MIN = 10;
/** O "último uso" grava no máximo uma vez por minuto por conexão. */
export const INTERVALO_DO_ULTIMO_USO_MS = 60_000;

export interface Chamada {
  conexao: Pick<ConexaoResolvida, "id" | "organizationId" | "donoId" | "nome">;
  ferramenta: string;
  resultado: ResultadoDaChamada;
  /** Por que foi negada/errou, em código curto (`scope`, `rate_limit`, `write_cap`…). */
  motivo?: string | null;
  registros?: number;
  duracaoMs?: number;
  ip: string | null;
  requestId: string;
  args?: Record<string, unknown> | null;
}

/** Só as chaves — nunca os valores. */
export function chavesDosArgumentos(args: Record<string, unknown> | null | undefined): string[] {
  return args && typeof args === "object" ? Object.keys(args).sort().slice(0, 30) : [];
}

export async function registrarChamada(db: SupabaseClient, c: Chamada): Promise<void> {
  const { error } = await db.from("mcp_call_log").insert({
    organization_id: c.conexao.organizationId,
    connection_id: c.conexao.id,
    owner_user_id: c.conexao.donoId,
    tool: c.ferramenta.slice(0, 80),
    result: c.resultado,
    reason: c.motivo ?? null,
    records: Math.max(0, Math.trunc(c.registros ?? 0)),
    duration_ms: Math.max(0, Math.trunc(c.duracaoMs ?? 0)),
    ip: c.ip,
    request_id: c.requestId,
    arg_keys: chavesDosArgumentos(c.args),
  });
  if (error) logger.warn("[mcp] registro de chamada não gravou", { error: error.message });

  if (c.resultado === "negado" && c.motivo === "scope") {
    await talvezSuspender(db, c.conexao);
  }
}

/**
 * 20 recusas de PERMISSÃO (não de limite de uso) em 10 minutos → suspende. Uma
 * conexão que insiste no que não pode fazer é um modelo em laço ou alguém
 * tateando — nos dois casos, parar e chamar uma pessoa é o certo.
 */
async function talvezSuspender(db: SupabaseClient, conexao: Chamada["conexao"]): Promise<void> {
  const desde = new Date(Date.now() - JANELA_DAS_RECUSAS_MIN * 60_000).toISOString();
  const { count, error } = await db
    .from("mcp_call_log")
    .select("id", { count: "exact", head: true })
    .eq("connection_id", conexao.id)
    .eq("organization_id", conexao.organizationId)
    .eq("result", "negado")
    .eq("reason", "scope")
    .gte("created_at", desde);
  if (error || (count ?? 0) < RECUSAS_PARA_SUSPENDER) return;

  // Só a primeira escrita suspende (`is suspended_at null`): duas chamadas
  // simultâneas não abrem dois avisos.
  const { data: suspensa } = await db
    .from("mcp_connections")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: "muitas_recusas" })
    .eq("id", conexao.id)
    .eq("organization_id", conexao.organizationId)
    .is("suspended_at", null)
    .select("id")
    .maybeSingle();
  if (!suspensa) return;

  await avisarAdmins(db, { organizationId: conexao.organizationId, ...avisoDeConexaoSuspensa(conexao.nome, count ?? 0) });
  await audit({
    action: "mcp.connection_suspended",
    actorUserId: null,
    organizationId: conexao.organizationId,
    resourceType: "mcp_connection",
    resourceId: conexao.id,
    metadata: { motivo: "muitas_recusas", recusas: count ?? 0 },
  });
}

const ultimoUsoGravado = new Map<string, number>();

/**
 * Atualiza `last_used_at`/`last_used_ip` no máximo uma vez por minuto: o
 * relógio local evita a ida ao banco, e o filtro `last_used_at < agora-1min`
 * segura o caso de várias instâncias.
 */
export async function marcarUltimoUso(
  db: SupabaseClient,
  conexao: Pick<ConexaoResolvida, "id" | "organizationId" | "ultimoUsoEm">,
  ip: string | null,
  agora: number = Date.now(),
): Promise<boolean> {
  const local = ultimoUsoGravado.get(conexao.id) ?? 0;
  const doBanco = conexao.ultimoUsoEm ? new Date(conexao.ultimoUsoEm).getTime() : 0;
  if (agora - Math.max(local, doBanco) < INTERVALO_DO_ULTIMO_USO_MS) return false;
  ultimoUsoGravado.set(conexao.id, agora);
  const limite = new Date(agora - INTERVALO_DO_ULTIMO_USO_MS).toISOString();
  const { error } = await db
    .from("mcp_connections")
    .update({ last_used_at: new Date(agora).toISOString(), last_used_ip: ip })
    .eq("id", conexao.id)
    .eq("organization_id", conexao.organizationId)
    .or(`last_used_at.is.null,last_used_at.lt.${limite}`);
  if (error) logger.warn("[mcp] último uso não gravou", { error: error.message });
  return true;
}
