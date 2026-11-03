/**
 * A GESTÃO das conexões MCP — o que a tela Configurações › Integrações › MCP
 * faz, num lugar só para as rotas de `/api/v1/settings/mcp` e para a tela de
 * consentimento OAuth.
 *
 * Quem chama já conferiu que é admin da organização (`requireRole("admin")`) e
 * passa a organização resolvida da sessão. Toda consulta aqui filtra por ela.
 *
 * Uma conexão nunca é criada, listada nem alterada por outra conexão: nenhuma
 * destas funções é alcançável por `/api/mcp` (lista de bloqueio).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { avisarAdmins, avisoDeConexaoCriada } from "./avisos";
import { itemDeIpValido } from "./conexao";
import {
  FERRAMENTAS_DE_DESTINO,
  PERFIS,
  VALIDADES_EM_DIAS,
  VALIDADE_PADRAO,
  escoposDaConexao,
  type Escopo,
} from "./escopos";
import { dicaDoToken, gerarSegredo, hashComoBytea } from "./token";

export const LIMITE_DO_HISTORICO = 200;

export const novaConexaoSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  tool: z.enum(FERRAMENTAS_DE_DESTINO),
  profile: z.enum(PERFIS),
  scopes: z.array(z.string().max(40)).max(20).default([]),
  validity_days: z
    .number()
    .int()
    .refine((n) => (VALIDADES_EM_DIAS as readonly number[]).includes(n), "validade_invalida")
    .default(VALIDADE_PADRAO),
  allowed_ips: z
    .array(z.string().trim().max(60))
    .max(20)
    .default([])
    .refine((l) => l.every(itemDeIpValido), "ip_invalido"),
  show_pii: z.boolean().default(false),
});
export type NovaConexao = z.infer<typeof novaConexaoSchema>;

export const interruptorSchema = z.strictObject({ enabled: z.boolean() });

export type StatusDaConexao = "ativa" | "suspensa" | "expirada" | "revogada";

export interface LinhaDaConexao {
  id: string;
  name: string;
  tool: string;
  profile: string;
  scopes: string[];
  show_pii: boolean;
  allowed_ips: string[];
  auth_kind: "token" | "oauth";
  token_hint: string | null;
  created_by_user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
}

export const COLUNAS_DA_LISTA =
  "id, name, tool, profile, scopes, show_pii, allowed_ips, auth_kind, token_hint, created_by_user_id, created_at, expires_at, revoked_at, suspended_at, suspended_reason, last_used_at, last_used_ip";

export function statusDaConexao(c: Pick<LinhaDaConexao, "revoked_at" | "suspended_at" | "expires_at">, agora = new Date()): StatusDaConexao {
  if (c.revoked_at) return "revogada";
  if (new Date(c.expires_at) <= agora) return "expirada";
  if (c.suspended_at) return "suspensa";
  return "ativa";
}

export interface Quem {
  organizationId: string;
  userId: string;
  /** Nome para o aviso da Central ("<quem> criou a conexão"). */
  nome: string;
  requestId: string;
}

// ---------------------------------------------------------------------------
// interruptor
// ---------------------------------------------------------------------------

async function lerSettings(db: SupabaseClient, organizationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  if (error) throw new Error(error.message);
  return ((data as { settings?: Record<string, unknown> | null } | null)?.settings ?? {}) as Record<string, unknown>;
}

export async function lerInterruptor(db: SupabaseClient, organizationId: string): Promise<boolean> {
  const settings = await lerSettings(db, organizationId);
  return (settings.mcp as { enabled?: unknown } | undefined)?.enabled === true;
}

export async function gravarInterruptor(db: SupabaseClient, quem: Quem, ligado: boolean): Promise<boolean> {
  const settings = await lerSettings(db, quem.organizationId);
  const mcp = { ...((settings.mcp as Record<string, unknown> | undefined) ?? {}), enabled: ligado };
  const { error } = await db
    .from("organizations")
    .update({ settings: { ...settings, mcp } })
    .eq("id", quem.organizationId);
  if (error) throw new Error(error.message);
  void audit({
    action: "mcp.settings_updated",
    actorUserId: quem.userId,
    organizationId: quem.organizationId,
    resourceType: "organization",
    resourceId: quem.organizationId,
    requestId: quem.requestId,
    metadata: { enabled: ligado },
  });
  return ligado;
}

// ---------------------------------------------------------------------------
// criar
// ---------------------------------------------------------------------------

export interface ConexaoCriada {
  conexao: LinhaDaConexao;
  /** O texto do token — mostrado UMA vez. Ausente em conexão OAuth. */
  token?: string;
}

export async function criarConexao(
  db: SupabaseClient,
  quem: Quem,
  entrada: NovaConexao,
  oauth?: { clientId: string },
): Promise<ConexaoCriada> {
  const escopos: Escopo[] = escoposDaConexao(entrada.profile, entrada.scopes, entrada.show_pii);
  if (escopos.length === 0) throw new ErroDaGestao("sem_escopos", "Escolha ao menos uma permissão.", 422);

  const token = oauth ? undefined : gerarSegredo("token");
  const expira = new Date(Date.now() + entrada.validity_days * 86_400_000).toISOString();
  const { data, error } = await db
    .from("mcp_connections")
    .insert({
      organization_id: quem.organizationId,
      name: entrada.name,
      tool: entrada.tool,
      profile: entrada.profile,
      scopes: escopos,
      show_pii: escopos.includes("contacts:pii"),
      allowed_ips: entrada.allowed_ips,
      auth_kind: oauth ? "oauth" : "token",
      token_hash: token ? hashComoBytea(token) : null,
      token_hint: token ? dicaDoToken(token) : null,
      oauth_client_id: oauth?.clientId ?? null,
      created_by_user_id: quem.userId,
      expires_at: expira,
    })
    .select(COLUNAS_DA_LISTA)
    .single();
  if (error || !data) throw new Error(error?.message ?? "mcp_connection_insert_failed");
  const conexao = data as unknown as LinhaDaConexao;

  await avisarAdmins(db, { organizationId: quem.organizationId, ...avisoDeConexaoCriada(conexao.name, quem.nome) });
  void audit({
    action: "mcp.connection_created",
    actorUserId: quem.userId,
    organizationId: quem.organizationId,
    resourceType: "mcp_connection",
    resourceId: conexao.id,
    requestId: quem.requestId,
    metadata: {
      name: conexao.name,
      tool: conexao.tool,
      profile: conexao.profile,
      scopes: conexao.scopes,
      auth_kind: conexao.auth_kind,
      validity_days: entrada.validity_days,
      allowed_ips: conexao.allowed_ips.length,
    },
  });
  return { conexao, token };
}

// ---------------------------------------------------------------------------
// ler
// ---------------------------------------------------------------------------

export async function listarConexoes(db: SupabaseClient, organizationId: string): Promise<LinhaDaConexao[]> {
  const { data, error } = await db
    .from("mcp_connections")
    .select(COLUNAS_DA_LISTA)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LinhaDaConexao[];
}

export interface ChamadaRegistrada {
  id: string;
  tool: string;
  result: "ok" | "negado" | "erro";
  reason: string | null;
  records: number;
  duration_ms: number;
  ip: string | null;
  created_at: string;
}

export async function detalheDaConexao(
  db: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<{ conexao: LinhaDaConexao; chamadas: ChamadaRegistrada[] } | null> {
  const { data } = await db
    .from("mcp_connections")
    .select(COLUNAS_DA_LISTA)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { data: chamadas, error } = await db
    .from("mcp_call_log")
    .select("id, tool, result, reason, records, duration_ms, ip, created_at")
    .eq("organization_id", organizationId)
    .eq("connection_id", id)
    .order("created_at", { ascending: false })
    .limit(LIMITE_DO_HISTORICO);
  if (error) throw new Error(error.message);
  return { conexao: data as unknown as LinhaDaConexao, chamadas: (chamadas ?? []) as unknown as ChamadaRegistrada[] };
}

// ---------------------------------------------------------------------------
// revogar, renovar, reativar
// ---------------------------------------------------------------------------

export class ErroDaGestao extends Error {
  constructor(
    public readonly codigo: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ErroDaGestao";
  }
}

async function exigirConexao(db: SupabaseClient, organizationId: string, id: string): Promise<LinhaDaConexao> {
  const { data } = await db
    .from("mcp_connections")
    .select(COLUNAS_DA_LISTA)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new ErroDaGestao("not_found", "Conexão não encontrada.", 404);
  return data as unknown as LinhaDaConexao;
}

export async function revogarConexao(db: SupabaseClient, quem: Quem, id: string): Promise<LinhaDaConexao> {
  const atual = await exigirConexao(db, quem.organizationId, id);
  if (atual.revoked_at) return atual;
  const agora = new Date().toISOString();
  const { data, error } = await db
    .from("mcp_connections")
    .update({ revoked_at: agora, revoked_by_user_id: quem.userId })
    .eq("organization_id", quem.organizationId)
    .eq("id", id)
    .select(COLUNAS_DA_LISTA)
    .single();
  if (error || !data) throw new Error(error?.message ?? "revoke_failed");
  // Os pares OAuth vivos morrem junto: access token não sobrevive à conexão.
  await db
    .from("mcp_oauth_tokens")
    .update({ rotated_at: agora })
    .eq("organization_id", quem.organizationId)
    .eq("connection_id", id)
    .is("rotated_at", null);
  void audit({
    action: "mcp.connection_revoked",
    actorUserId: quem.userId,
    organizationId: quem.organizationId,
    resourceType: "mcp_connection",
    resourceId: id,
    requestId: quem.requestId,
    metadata: { name: atual.name },
  });
  return data as unknown as LinhaDaConexao;
}

/**
 * Renovar = token NOVO (o antigo para de valer na hora) e a mesma validade
 * escolhida na criação, contada a partir de agora. Conexão OAuth não renova
 * por aqui: o cliente reautoriza pela própria ferramenta.
 */
export async function renovarConexao(db: SupabaseClient, quem: Quem, id: string): Promise<ConexaoCriada> {
  const atual = await exigirConexao(db, quem.organizationId, id);
  if (atual.revoked_at) throw new ErroDaGestao("connection_revoked", "Conexão revogada não renova. Crie outra.", 409);
  if (atual.auth_kind !== "token") {
    throw new ErroDaGestao("oauth_reauthorize", "Conexão OAuth renova reconectando pela própria ferramenta.", 409);
  }
  const duracaoMs = Math.max(
    86_400_000,
    new Date(atual.expires_at).getTime() - new Date(atual.created_at).getTime(),
  );
  const dias = (VALIDADES_EM_DIAS as readonly number[]).reduce((perto, d) =>
    Math.abs(d * 86_400_000 - duracaoMs) < Math.abs(perto * 86_400_000 - duracaoMs) ? d : perto,
  );
  const token = gerarSegredo("token");
  const { data, error } = await db
    .from("mcp_connections")
    .update({
      token_hash: hashComoBytea(token),
      token_hint: dicaDoToken(token),
      expires_at: new Date(Date.now() + dias * 86_400_000).toISOString(),
      expiry_notified_at: null,
    })
    .eq("organization_id", quem.organizationId)
    .eq("id", id)
    .select(COLUNAS_DA_LISTA)
    .single();
  if (error || !data) throw new Error(error?.message ?? "renew_failed");
  void audit({
    action: "mcp.connection_renewed",
    actorUserId: quem.userId,
    organizationId: quem.organizationId,
    resourceType: "mcp_connection",
    resourceId: id,
    requestId: quem.requestId,
    metadata: { name: atual.name, validity_days: dias },
  });
  return { conexao: data as unknown as LinhaDaConexao, token };
}

export async function reativarConexao(db: SupabaseClient, quem: Quem, id: string): Promise<LinhaDaConexao> {
  const atual = await exigirConexao(db, quem.organizationId, id);
  if (atual.revoked_at) throw new ErroDaGestao("connection_revoked", "Conexão revogada não reativa. Crie outra.", 409);
  if (!atual.suspended_at) return atual;
  const { data, error } = await db
    .from("mcp_connections")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("organization_id", quem.organizationId)
    .eq("id", id)
    .select(COLUNAS_DA_LISTA)
    .single();
  if (error || !data) throw new Error(error?.message ?? "reactivate_failed");
  void audit({
    action: "mcp.connection_reactivated",
    actorUserId: quem.userId,
    organizationId: quem.organizationId,
    resourceType: "mcp_connection",
    resourceId: id,
    requestId: quem.requestId,
    metadata: { name: atual.name, suspended_reason: atual.suspended_reason },
  });
  return data as unknown as LinhaDaConexao;
}
