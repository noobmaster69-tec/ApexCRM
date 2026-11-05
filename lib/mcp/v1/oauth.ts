/**
 * O SERVIDOR DE AUTORIZAÇÃO OAuth 2.1 do MCP — para o Claude Desktop e o
 * claude.ai, que não colam token: eles descobrem o servidor pelos metadados,
 * se registram, mandam o admin a uma tela de consentimento na Apex logada e
 * trocam o código por um par access/refresh.
 *
 *   - Só authorization code, e só com PKCE S256 (sem `plain`, sem implícito,
 *     sem senha). Cliente público (`token_endpoint_auth_method: none`).
 *   - Código de uso único, 10 minutos, preso ao cliente e ao `redirect_uri`.
 *     Código reapresentado = alguém interceptou: a conexão é revogada.
 *   - Access token de 1 hora; refresh token com ROTAÇÃO — cada uso emite um
 *     par novo e aposenta o anterior. Refresh aposentado reapresentado = a
 *     conexão é revogada inteira (RFC 9700 §4.14).
 *   - O resultado do consentimento é uma `mcp_connections` como as outras:
 *     aparece na lista, tem escopos, validade, registro e pode ser revogada.
 *
 * Não havia servidor OAuth no repositório para reaproveitar (o OAuth que
 * existe é de CLIENTE — Google, Nuvemshop —, não de servidor).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ESCOPOS } from "./escopos";
import { CAMINHOS_OAUTH, baseDoApp, urlDoRecurso } from "./enderecos";
import { gerarSegredo, hashComoBytea } from "./token";

export const VALIDADE_DO_CODIGO_MS = 10 * 60_000;
export const VALIDADE_DO_ACCESS_S = 3_600;
export const VALIDADE_DO_REFRESH_DIAS = 30;

export function metadadosDoServidor() {
  const base = baseDoApp();
  return {
    issuer: base,
    authorization_endpoint: `${base}${CAMINHOS_OAUTH.autorizar}`,
    token_endpoint: `${base}${CAMINHOS_OAUTH.token}`,
    registration_endpoint: `${base}${CAMINHOS_OAUTH.registrar}`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...ESCOPOS],
  };
}

export function metadadosDoRecurso() {
  return {
    resource: urlDoRecurso(),
    authorization_servers: [baseDoApp()],
    bearer_methods_supported: ["header"],
    scopes_supported: [...ESCOPOS],
    resource_name: "CRM",
  };
}

/** Erro no formato do RFC 6749 §5.2. */
export class ErroOAuth extends Error {
  constructor(
    public readonly codigo:
      | "invalid_request"
      | "invalid_client"
      | "invalid_grant"
      | "unsupported_grant_type"
      | "invalid_redirect_uri"
      | "invalid_client_metadata"
      | "access_denied",
    public readonly descricao: string,
    public readonly status = 400,
  ) {
    super(descricao);
    this.name = "ErroOAuth";
  }
}

export function respostaDoErroOAuth(e: ErroOAuth): Response {
  return new Response(JSON.stringify({ error: e.codigo, error_description: e.descricao }), {
    status: e.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// ---------------------------------------------------------------------------
// PKCE e redirect
// ---------------------------------------------------------------------------

/** `BASE64URL(SHA256(verifier)) === challenge`, em tempo constante. */
export function pkceConfere(verificador: string, desafio: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verificador)) return false;
  const calculado = Buffer.from(createHash("sha256").update(verificador).digest("base64url"));
  const esperado = Buffer.from(desafio);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export function desafioValido(desafio: string): boolean {
  return /^[A-Za-z0-9\-_]{43}$/.test(desafio);
}

/**
 * Redirect aceito: https sem fragmento, ou http só no loopback (cliente nativo,
 * RFC 8252 §7.3). Nada de `javascript:`, de esquema customizado nem de curinga.
 */
export function redirectValido(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash !== "" || u.username !== "" || u.password !== "") return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  return false;
}

// ---------------------------------------------------------------------------
// registro dinâmico (RFC 7591)
// ---------------------------------------------------------------------------

export interface ClienteRegistrado {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  client_id_issued_at: number;
  token_endpoint_auth_method: "none";
  grant_types: string[];
  response_types: string[];
}

export async function registrarCliente(db: SupabaseClient, corpo: unknown): Promise<ClienteRegistrado> {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const nome = typeof c.client_name === "string" ? c.client_name.trim().slice(0, 120) : "";
  const uris = Array.isArray(c.redirect_uris) ? c.redirect_uris : [];
  if (uris.length < 1 || uris.length > 10 || !uris.every((u) => typeof u === "string" && u.length <= 500 && redirectValido(u))) {
    throw new ErroOAuth("invalid_redirect_uri", "redirect_uris: de 1 a 10 URIs https (ou http no loopback), sem fragmento.");
  }
  const metodo = c.token_endpoint_auth_method;
  if (metodo !== undefined && metodo !== "none") {
    throw new ErroOAuth("invalid_client_metadata", "Só clientes públicos (token_endpoint_auth_method: none), com PKCE.");
  }
  const clientId = `apx_cli_${randomBytes(16).toString("base64url")}`;
  const nomeFinal = nome || "Cliente MCP";
  const { error } = await db
    .from("mcp_oauth_clients")
    .insert({ client_id: clientId, client_name: nomeFinal, redirect_uris: uris as string[] });
  if (error) throw new ErroOAuth("invalid_client_metadata", "Não foi possível registrar o cliente.", 500);
  return {
    client_id: clientId,
    client_name: nomeFinal,
    redirect_uris: uris as string[],
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export interface ClienteOAuth {
  id: string;
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

export async function lerCliente(db: SupabaseClient, clientId: string): Promise<ClienteOAuth | null> {
  if (!clientId || clientId.length > 100) return null;
  const { data } = await db
    .from("mcp_oauth_clients")
    .select("id, client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as ClienteOAuth | null) ?? null;
}

// ---------------------------------------------------------------------------
// pedido de autorização (o que a tela de consentimento recebe)
// ---------------------------------------------------------------------------

export interface PedidoDeAutorizacao {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state: string | null;
}

/**
 * Confere o pedido ANTES de mostrar a tela. Cliente ou redirect inválido NÃO
 * redireciona (seria um redirecionador aberto): a tela mostra o erro.
 */
export async function conferirPedido(
  db: SupabaseClient,
  q: Record<string, string | undefined>,
): Promise<{ ok: true; pedido: PedidoDeAutorizacao; cliente: ClienteOAuth } | { ok: false; erro: string }> {
  const cliente = await lerCliente(db, q.client_id ?? "");
  if (!cliente) return { ok: false, erro: "Cliente OAuth desconhecido. Reconecte pela ferramenta." };
  const redirect = q.redirect_uri ?? "";
  if (!cliente.redirect_uris.includes(redirect)) return { ok: false, erro: "Endereço de retorno não registrado para este cliente." };
  if (q.response_type !== "code") return { ok: false, erro: "Só o fluxo authorization code é aceito." };
  if (q.code_challenge_method !== "S256" || !desafioValido(q.code_challenge ?? "")) {
    return { ok: false, erro: "PKCE S256 é obrigatório." };
  }
  if (q.resource && q.resource.replace(/\/+$/, "") !== urlDoRecurso()) {
    return { ok: false, erro: "Este servidor de autorização só emite acesso para o MCP desta instalação." };
  }
  return {
    ok: true,
    cliente,
    pedido: {
      client_id: cliente.client_id,
      redirect_uri: redirect,
      code_challenge: q.code_challenge!,
      state: q.state ? q.state.slice(0, 500) : null,
    },
  };
}

/** Emite o código (uso único, 10 min) para a conexão recém-criada. */
export async function emitirCodigo(
  db: SupabaseClient,
  a: { organizationId: string; conexaoId: string; cliente: ClienteOAuth; pedido: PedidoDeAutorizacao },
): Promise<string> {
  const codigo = randomBytes(32).toString("base64url");
  const { error } = await db.from("mcp_oauth_codes").insert({
    code_hash: hashComoBytea(codigo),
    organization_id: a.organizationId,
    connection_id: a.conexaoId,
    client_id: a.cliente.id,
    redirect_uri: a.pedido.redirect_uri,
    code_challenge: a.pedido.code_challenge,
    expires_at: new Date(Date.now() + VALIDADE_DO_CODIGO_MS).toISOString(),
  });
  if (error) throw new Error(`mcp_oauth_code_insert: ${error.message}`);
  return codigo;
}

export function urlDeVolta(pedido: PedidoDeAutorizacao, params: Record<string, string>): string {
  const u = new URL(pedido.redirect_uri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (pedido.state !== null) u.searchParams.set("state", pedido.state);
  u.searchParams.set("iss", baseDoApp());
  return u.toString();
}

// ---------------------------------------------------------------------------
// endpoint de token
// ---------------------------------------------------------------------------

export interface ParDeTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface ConexaoDoPar {
  id: string;
  organization_id: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
}

async function conexaoDoPar(db: SupabaseClient, organizationId: string, conexaoId: string): Promise<ConexaoDoPar | null> {
  const { data } = await db
    .from("mcp_connections")
    .select("id, organization_id, scopes, expires_at, revoked_at")
    .eq("organization_id", organizationId)
    .eq("id", conexaoId)
    .maybeSingle();
  return (data as ConexaoDoPar | null) ?? null;
}

async function revogarPorReuso(db: SupabaseClient, organizationId: string, conexaoId: string): Promise<void> {
  const agora = new Date().toISOString();
  await db
    .from("mcp_connections")
    .update({ revoked_at: agora, suspended_reason: "reuso_de_credencial_oauth" })
    .eq("organization_id", organizationId)
    .eq("id", conexaoId)
    .is("revoked_at", null);
  await db
    .from("mcp_oauth_tokens")
    .update({ rotated_at: agora })
    .eq("organization_id", organizationId)
    .eq("connection_id", conexaoId)
    .is("rotated_at", null);
}

async function emitirPar(db: SupabaseClient, c: ConexaoDoPar): Promise<ParDeTokens> {
  const access = gerarSegredo("access");
  const refresh = gerarSegredo("refresh");
  const agora = Date.now();
  const fimDaConexao = new Date(c.expires_at).getTime();
  const fimDoRefresh = Math.min(agora + VALIDADE_DO_REFRESH_DIAS * 86_400_000, fimDaConexao);
  const { error } = await db.from("mcp_oauth_tokens").insert({
    organization_id: c.organization_id,
    connection_id: c.id,
    access_hash: hashComoBytea(access),
    access_expires_at: new Date(Math.min(agora + VALIDADE_DO_ACCESS_S * 1000, fimDaConexao)).toISOString(),
    refresh_hash: hashComoBytea(refresh),
    refresh_expires_at: new Date(fimDoRefresh).toISOString(),
  });
  if (error) throw new ErroOAuth("invalid_grant", "Não foi possível emitir o acesso.", 500);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: VALIDADE_DO_ACCESS_S,
    refresh_token: refresh,
    scope: c.scopes.join(" "),
  };
}

function conexaoUtilizavel(c: ConexaoDoPar | null, agora: Date): c is ConexaoDoPar {
  return c !== null && !c.revoked_at && new Date(c.expires_at) > agora;
}

export async function trocarCodigo(
  db: SupabaseClient,
  p: { code: string; redirect_uri: string; client_id: string; code_verifier: string },
  agora: Date = new Date(),
): Promise<ParDeTokens> {
  if (!p.code || !p.redirect_uri || !p.client_id || !p.code_verifier) {
    throw new ErroOAuth("invalid_request", "code, redirect_uri, client_id e code_verifier são obrigatórios.");
  }
  const cliente = await lerCliente(db, p.client_id);
  if (!cliente) throw new ErroOAuth("invalid_client", "Cliente desconhecido.", 401);

  const { data } = await db
    .from("mcp_oauth_codes")
    .select("code_hash, organization_id, connection_id, client_id, redirect_uri, code_challenge, expires_at, used_at")
    .eq("code_hash", hashComoBytea(p.code))
    .maybeSingle();
  const codigo = data as {
    organization_id: string;
    connection_id: string;
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    expires_at: string;
    used_at: string | null;
  } | null;
  if (!codigo || codigo.client_id !== cliente.id) throw new ErroOAuth("invalid_grant", "Código inválido.");
  if (codigo.used_at) {
    await revogarPorReuso(db, codigo.organization_id, codigo.connection_id);
    throw new ErroOAuth("invalid_grant", "Código já usado. A conexão foi revogada por segurança.");
  }
  if (new Date(codigo.expires_at) <= agora) throw new ErroOAuth("invalid_grant", "Código expirado.");
  if (codigo.redirect_uri !== p.redirect_uri) throw new ErroOAuth("invalid_grant", "redirect_uri não confere.");
  if (!pkceConfere(p.code_verifier, codigo.code_challenge)) throw new ErroOAuth("invalid_grant", "code_verifier não confere.");

  // Uso único decidido no banco: duas trocas simultâneas, só uma vence.
  const { data: marcado } = await db
    .from("mcp_oauth_codes")
    .update({ used_at: agora.toISOString() })
    .eq("code_hash", hashComoBytea(p.code))
    .is("used_at", null)
    .select("code_hash")
    .maybeSingle();
  if (!marcado) throw new ErroOAuth("invalid_grant", "Código já usado.");

  const conexao = await conexaoDoPar(db, codigo.organization_id, codigo.connection_id);
  if (!conexaoUtilizavel(conexao, agora)) throw new ErroOAuth("invalid_grant", "Conexão revogada ou expirada.");
  return emitirPar(db, conexao);
}

export async function renovarPar(
  db: SupabaseClient,
  p: { refresh_token: string; client_id: string },
  agora: Date = new Date(),
): Promise<ParDeTokens> {
  if (!p.refresh_token || !p.client_id) throw new ErroOAuth("invalid_request", "refresh_token e client_id são obrigatórios.");
  const cliente = await lerCliente(db, p.client_id);
  if (!cliente) throw new ErroOAuth("invalid_client", "Cliente desconhecido.", 401);

  const { data } = await db
    .from("mcp_oauth_tokens")
    .select("id, organization_id, connection_id, refresh_expires_at, rotated_at")
    .eq("refresh_hash", hashComoBytea(p.refresh_token))
    .maybeSingle();
  const par = data as {
    id: string;
    organization_id: string;
    connection_id: string;
    refresh_expires_at: string;
    rotated_at: string | null;
  } | null;
  if (!par) throw new ErroOAuth("invalid_grant", "Refresh token inválido.");

  const conexao = await conexaoDoPar(db, par.organization_id, par.connection_id);
  const { data: daConexao } = await db
    .from("mcp_connections")
    .select("oauth_client_id")
    .eq("organization_id", par.organization_id)
    .eq("id", par.connection_id)
    .maybeSingle();
  if ((daConexao as { oauth_client_id?: string | null } | null)?.oauth_client_id !== cliente.id) {
    throw new ErroOAuth("invalid_grant", "Refresh token de outro cliente.");
  }
  if (par.rotated_at) {
    await revogarPorReuso(db, par.organization_id, par.connection_id);
    throw new ErroOAuth("invalid_grant", "Refresh token já usado. A conexão foi revogada por segurança.");
  }
  if (new Date(par.refresh_expires_at) <= agora) throw new ErroOAuth("invalid_grant", "Refresh token expirado.");
  if (!conexaoUtilizavel(conexao, agora)) throw new ErroOAuth("invalid_grant", "Conexão revogada ou expirada.");

  const { data: aposentado } = await db
    .from("mcp_oauth_tokens")
    .update({ rotated_at: agora.toISOString() })
    .eq("id", par.id)
    .is("rotated_at", null)
    .select("id")
    .maybeSingle();
  if (!aposentado) {
    await revogarPorReuso(db, par.organization_id, par.connection_id);
    throw new ErroOAuth("invalid_grant", "Refresh token já usado. A conexão foi revogada por segurança.");
  }
  return emitirPar(db, conexao);
}
