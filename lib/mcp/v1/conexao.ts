/**
 * QUEM ESTÁ CHAMANDO — a conexão MCP por trás do `Authorization: Bearer`.
 *
 * Tudo é revalidado NO BANCO a cada chamada, nunca lido do que valia quando o
 * token foi emitido:
 *   1. o segredo existe (hash SHA-256 pelo índice único, conferido em tempo
 *      constante) → senão 401;
 *   2. a conexão não foi revogada e não venceu → senão 401;
 *   3. a organização ligou "Permitir conexões MCP" → senão 403 `mcp_disabled`,
 *      inclusive para tokens que já existem;
 *   4. a conexão não está suspensa (muitas recusas seguidas) → senão 403;
 *   5. o IP está na lista, quando a conexão tem lista → senão 403;
 *   6. quem criou a conexão ainda é da organização → senão 403; e o papel ATUAL
 *      dele recorta os escopos (`escoposEfetivos`).
 *
 * A organização vem SEMPRE da conexão. Nenhuma ferramenta recebe
 * `organization_id` como argumento.
 */
import { BlockList, isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Role } from "@/lib/auth/types";
import { escoposEfetivos, type Escopo } from "./escopos";
import { confereSegredo, hashComoBytea, tipoDoSegredo } from "./token";

export type MotivoDaRecusa =
  | "invalid_token"
  | "revoked"
  | "expired"
  | "mcp_disabled"
  | "connection_suspended"
  | "ip_not_allowed"
  | "owner_without_access";

export class RecusaDaConexao extends Error {
  constructor(
    public readonly motivo: MotivoDaRecusa,
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "RecusaDaConexao";
  }
}

export interface ConexaoResolvida {
  id: string;
  organizationId: string;
  nome: string;
  ferramenta: string;
  donoId: string;
  donoPapel: Role;
  /** Os escopos que valem NESTA chamada (conexão ∩ papel atual do dono). */
  escopos: Set<Escopo>;
  mostrarDadosPessoais: boolean;
  ultimoUsoEm: string | null;
}

const COLUNAS =
  "id, organization_id, name, tool, scopes, show_pii, allowed_ips, token_hash, created_by_user_id, expires_at, revoked_at, suspended_at, last_used_at";

interface LinhaDaConexao {
  id: string;
  organization_id: string;
  name: string;
  tool: string;
  scopes: string[] | null;
  show_pii: boolean;
  allowed_ips: string[] | null;
  token_hash: string | null;
  created_by_user_id: string;
  expires_at: string;
  revoked_at: string | null;
  suspended_at: string | null;
  last_used_at: string | null;
}

/** O IP cabe na lista (IPs soltos ou CIDR, v4 e v6)? Lista vazia = qualquer IP. */
export function ipPermitido(ip: string | null, lista: readonly string[]): boolean {
  if (lista.length === 0) return true;
  if (!ip) return false;
  const tipo = isIP(ip);
  if (tipo === 0) return false;
  const bloco = new BlockList();
  for (const item of lista) {
    const [endereco, prefixo] = item.split("/");
    const tipoDoItem = isIP(endereco ?? "");
    if (tipoDoItem === 0) continue;
    const familia = tipoDoItem === 4 ? "ipv4" : "ipv6";
    if (prefixo === undefined) bloco.addAddress(endereco!, familia);
    else bloco.addSubnet(endereco!, Number(prefixo), familia);
  }
  return bloco.check(ip, tipo === 4 ? "ipv4" : "ipv6");
}

/** Valida um item da lista de IPs da tela (IP solto ou CIDR com prefixo no intervalo). */
export function itemDeIpValido(item: string): boolean {
  const [endereco, prefixo, ...resto] = item.trim().split("/");
  if (resto.length > 0) return false;
  const tipo = isIP(endereco ?? "");
  if (tipo === 0) return false;
  if (prefixo === undefined) return true;
  if (!/^\d+$/.test(prefixo)) return false;
  const n = Number(prefixo);
  return n >= 0 && n <= (tipo === 4 ? 32 : 128);
}

export async function mcpLigadoNaOrganizacao(db: SupabaseClient, organizationId: string): Promise<boolean> {
  const { data } = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  const settings = (data as { settings?: { mcp?: { enabled?: unknown } } } | null)?.settings;
  return settings?.mcp?.enabled === true;
}

async function linhaPeloSegredo(db: SupabaseClient, segredo: string): Promise<LinhaDaConexao | null> {
  const tipo = tipoDoSegredo(segredo);
  if (tipo === "token") {
    const { data } = await db.from("mcp_connections").select(COLUNAS).eq("token_hash", hashComoBytea(segredo)).maybeSingle();
    const linha = data as LinhaDaConexao | null;
    return linha && confereSegredo(segredo, linha.token_hash) ? linha : null;
  }
  if (tipo === "access") {
    const { data } = await db
      .from("mcp_oauth_tokens")
      .select("connection_id, organization_id, access_hash, access_expires_at, rotated_at")
      .eq("access_hash", hashComoBytea(segredo))
      .maybeSingle();
    const par = data as {
      connection_id: string;
      organization_id: string;
      access_hash: string;
      access_expires_at: string;
      rotated_at: string | null;
    } | null;
    if (!par || !confereSegredo(segredo, par.access_hash)) return null;
    if (par.rotated_at || new Date(par.access_expires_at) <= new Date()) {
      throw new RecusaDaConexao("expired", 401, "Access token expired.");
    }
    const { data: conexao } = await db
      .from("mcp_connections")
      .select(COLUNAS)
      .eq("id", par.connection_id)
      .eq("organization_id", par.organization_id)
      .maybeSingle();
    return (conexao as LinhaDaConexao | null) ?? null;
  }
  return null;
}

export async function resolverConexao(
  db: SupabaseClient,
  segredo: string,
  ip: string | null,
  agora: Date = new Date(),
): Promise<ConexaoResolvida> {
  const linha = await linhaPeloSegredo(db, segredo);
  if (!linha) throw new RecusaDaConexao("invalid_token", 401, "Token not recognized.");
  if (linha.revoked_at) throw new RecusaDaConexao("revoked", 401, "Connection revoked.");
  if (new Date(linha.expires_at) <= agora) throw new RecusaDaConexao("expired", 401, "Connection expired.");

  if (!(await mcpLigadoNaOrganizacao(db, linha.organization_id))) {
    throw new RecusaDaConexao("mcp_disabled", 403, "MCP connections are disabled for this organization.");
  }
  if (linha.suspended_at) {
    throw new RecusaDaConexao(
      "connection_suspended",
      403,
      "Connection suspended after repeated permission denials. An admin must reactivate it.",
    );
  }
  if (!ipPermitido(ip, linha.allowed_ips ?? [])) {
    throw new RecusaDaConexao("ip_not_allowed", 403, "Calls from this IP are not allowed for this connection.");
  }

  const { data: vinculo } = await db
    .from("user_organizations")
    .select("role")
    .eq("user_id", linha.created_by_user_id)
    .eq("organization_id", linha.organization_id)
    .is("revoked_at", null)
    .maybeSingle();
  const papel = (vinculo as { role?: Role } | null)?.role;
  if (!papel) {
    throw new RecusaDaConexao("owner_without_access", 403, "The person who created this connection no longer has access.");
  }

  return {
    id: linha.id,
    organizationId: linha.organization_id,
    nome: linha.name,
    ferramenta: linha.tool,
    donoId: linha.created_by_user_id,
    donoPapel: papel,
    escopos: escoposEfetivos(linha.scopes ?? [], papel, linha.show_pii),
    mostrarDadosPessoais: linha.show_pii,
    ultimoUsoEm: linha.last_used_at,
  };
}
