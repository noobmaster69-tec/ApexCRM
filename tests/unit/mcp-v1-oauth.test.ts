import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { BancoEmMemoria } from "../helpers/banco-em-memoria";

/**
 * O OAuth 2.1 das conexões MCP (migration 9023), com o banco em memória:
 * registro dinâmico → consentimento (vira uma conexão como as outras) →
 * código com PKCE S256 → par access/refresh → rotação → reuso revoga.
 */
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const { registrarCliente, conferirPedido, emitirCodigo, trocarCodigo, renovarPar, ErroOAuth, metadadosDoServidor } =
  await import("@/lib/mcp/v1/oauth");
const { criarConexao } = await import("@/lib/mcp/v1/conexoes");
const { resolverConexao } = await import("@/lib/mcp/v1/conexao");

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ADMIN = "00000000-0000-4000-8000-00000000a001";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFICADOR = "v".repeat(50);
const DESAFIO = createHash("sha256").update(VERIFICADOR).digest("base64url");

let banco: BancoEmMemoria;

async function autorizar() {
  const db = banco.comoCliente<never>();
  const cliente = await registrarCliente(db, { client_name: "Claude", redirect_uris: [REDIRECT] });
  const conferido = await conferirPedido(db, {
    client_id: cliente.client_id,
    redirect_uri: REDIRECT,
    response_type: "code",
    code_challenge: DESAFIO,
    code_challenge_method: "S256",
    state: "xyz",
  });
  if (!conferido.ok) throw new Error(conferido.erro);
  const { conexao } = await criarConexao(
    db,
    { organizationId: ORG, userId: ADMIN, nome: "Admin", requestId: "r" },
    {
      name: "Claude",
      tool: "claude_desktop",
      profile: "somente_leitura",
      scopes: [],
      validity_days: 90,
      allowed_ips: [],
      show_pii: false,
    },
    { clientId: conferido.cliente.id },
  );
  const codigo = await emitirCodigo(db, { organizationId: ORG, conexaoId: conexao.id, cliente: conferido.cliente, pedido: conferido.pedido });
  return { db, clientId: cliente.client_id, conexaoId: conexao.id, codigo };
}

beforeEach(() => {
  banco = new BancoEmMemoria();
  banco.linhas("organizations").push({ id: ORG, settings: { mcp: { enabled: true } } });
  banco.linhas("user_organizations").push({ organization_id: ORG, user_id: ADMIN, role: "admin", revoked_at: null });
});

describe("OAuth 2.1 do MCP", () => {
  it("os metadados exigem PKCE S256 e só authorization code", () => {
    const m = metadadosDoServidor();
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
  });

  it("registro recusa redirect inseguro", async () => {
    await expect(
      registrarCliente(banco.comoCliente<never>(), { client_name: "x", redirect_uris: ["http://evil.example.com/cb"] }),
    ).rejects.toBeInstanceOf(ErroOAuth);
  });

  it("pedido sem PKCE S256 não chega à tela de aprovação", async () => {
    const db = banco.comoCliente<never>();
    const cliente = await registrarCliente(db, { client_name: "Claude", redirect_uris: [REDIRECT] });
    const r = await conferirPedido(db, {
      client_id: cliente.client_id,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: DESAFIO,
      code_challenge_method: "plain",
    });
    expect(r.ok).toBe(false);
  });

  it("código + verificador certo → par; o access token resolve a conexão com o perfil aprovado", async () => {
    const { db, clientId, codigo, conexaoId } = await autorizar();
    const par = await trocarCodigo(db, { code: codigo, redirect_uri: REDIRECT, client_id: clientId, code_verifier: VERIFICADOR });
    expect(par.access_token).toMatch(/^apx_oat_/);
    expect(par.refresh_token).toMatch(/^apx_ort_/);
    expect(par.expires_in).toBe(3600);
    const conexao = await resolverConexao(db, par.access_token, null);
    expect(conexao.id).toBe(conexaoId);
    expect(conexao.escopos.has("leads:read")).toBe(true);
    expect(conexao.escopos.has("leads:write")).toBe(false);
    expect(banco.linhas("mcp_connections")[0]).toMatchObject({ auth_kind: "oauth", token_hash: null });
  });

  it("verificador errado é recusado", async () => {
    const { db, clientId, codigo } = await autorizar();
    await expect(
      trocarCodigo(db, { code: codigo, redirect_uri: REDIRECT, client_id: clientId, code_verifier: "x".repeat(50) }),
    ).rejects.toBeInstanceOf(ErroOAuth);
  });

  it("código reapresentado revoga a conexão", async () => {
    const { db, clientId, codigo, conexaoId } = await autorizar();
    await trocarCodigo(db, { code: codigo, redirect_uri: REDIRECT, client_id: clientId, code_verifier: VERIFICADOR });
    await expect(
      trocarCodigo(db, { code: codigo, redirect_uri: REDIRECT, client_id: clientId, code_verifier: VERIFICADOR }),
    ).rejects.toBeInstanceOf(ErroOAuth);
    expect(banco.linhas("mcp_connections").find((c) => c.id === conexaoId)!.revoked_at).not.toBeNull();
  });

  it("refresh gira o par; o refresh antigo reapresentado revoga a conexão", async () => {
    const { db, clientId, codigo, conexaoId } = await autorizar();
    const primeiro = await trocarCodigo(db, { code: codigo, redirect_uri: REDIRECT, client_id: clientId, code_verifier: VERIFICADOR });
    const segundo = await renovarPar(db, { refresh_token: primeiro.refresh_token, client_id: clientId });
    expect(segundo.refresh_token).not.toBe(primeiro.refresh_token);
    await expect(resolverConexao(db, primeiro.access_token, null)).rejects.toMatchObject({ status: 401 });
    expect((await resolverConexao(db, segundo.access_token, null)).id).toBe(conexaoId);

    await expect(renovarPar(db, { refresh_token: primeiro.refresh_token, client_id: clientId })).rejects.toBeInstanceOf(ErroOAuth);
    expect(banco.linhas("mcp_connections").find((c) => c.id === conexaoId)!.revoked_at).not.toBeNull();
    await expect(resolverConexao(db, segundo.access_token, null)).rejects.toMatchObject({ status: 401 });
  });
});
