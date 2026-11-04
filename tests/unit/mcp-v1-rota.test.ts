import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BancoEmMemoria } from "../helpers/banco-em-memoria";

/**
 * O caminho de `/api/mcp` para as CONEXÕES (migration 9923), de ponta a ponta:
 * o cliente OFICIAL do SDK (`Client` + `StreamableHTTPClientTransport`) fala
 * com `atenderConexao` por um `fetch` próprio, sobre um banco em memória.
 *
 * Prova: `tools/list` filtrado pelo escopo, uma leitura que funciona, uma
 * recusa registrada como `negado`, isolamento entre duas organizações,
 * revogada/expirada → 401, interruptor desligado → 403, queda de papel do dono,
 * e a suspensão depois de 20 recusas.
 */
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const { atenderConexao } = await import("@/lib/mcp/v1/rota");
const { gerarSegredo, hashComoBytea } = await import("@/lib/mcp/v1/token");

const ORG_A = "00000000-0000-4000-8000-0000000000aa";
const ORG_B = "00000000-0000-4000-8000-0000000000bb";
const DONO_A = "00000000-0000-4000-8000-00000000a001";
const DONO_B = "00000000-0000-4000-8000-00000000b001";
const URL_MCP = "https://crm.exemplo.com/api/mcp";

let banco: BancoEmMemoria;

function organizacao(id: string, ligado: boolean) {
  banco.linhas("organizations").push({ id, settings: { mcp: { enabled: ligado } } });
}

function conexao(o: {
  org: string;
  dono: string;
  escopos: string[];
  pii?: boolean;
  revogada?: boolean;
  expirada?: boolean;
  ips?: string[];
}): { id: string; token: string } {
  const token = gerarSegredo("token");
  const id = `conexao-${++banco.sequencia}-${Math.random().toString(36).slice(2)}`;
  banco.linhas("mcp_connections").push({
    id,
    organization_id: o.org,
    name: `Conexão ${id}`,
    tool: "claude_code",
    scopes: o.escopos,
    show_pii: o.pii ?? false,
    allowed_ips: o.ips ?? [],
    token_hash: hashComoBytea(token),
    created_by_user_id: o.dono,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + (o.expirada ? -1 : 1) * 86_400_000).toISOString(),
    revoked_at: o.revogada ? new Date().toISOString() : null,
    suspended_at: null,
    last_used_at: null,
  });
  return { id, token };
}

function membro(org: string, user: string, role: string) {
  banco.linhas("user_organizations").push({ organization_id: org, user_id: user, role, revoked_at: null });
}

function funil(org: string, id: string, nome: string) {
  banco.linhas("crm_pipelines").push({
    id,
    organization_id: org,
    crm_id: "crm",
    name: nome,
    is_default: true,
    is_archived: false,
    position: 1,
  });
  banco.linhas("crm_stages").push({ id: `${id}-etapa`, organization_id: org, pipeline_id: id, name: "Novo", position: 1 });
}

/** O `fetch` que o cliente do SDK usa: cada requisição vai para `atenderConexao`. */
function fetchDaRota(ip = "203.0.113.7") {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(url, init);
    const segredo = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
    return atenderConexao({ db: banco.comoCliente(), req, segredo, ip, requestId: `req-${Math.random()}` });
  };
}

async function conectar(token: string) {
  const transporte = new StreamableHTTPClientTransport(new URL(URL_MCP), {
    fetch: fetchDaRota(),
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const cliente = new Client({ name: "teste", version: "0.0.0" });
  await cliente.connect(transporte);
  return cliente;
}

async function postar(token: string, corpo: unknown): Promise<Response> {
  return fetchDaRota()(URL_MCP, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(corpo),
  });
}

const chamada = (nome: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: nome, arguments: args },
});

beforeEach(() => {
  banco = new BancoEmMemoria();
  organizacao(ORG_A, true);
  organizacao(ORG_B, true);
  membro(ORG_A, DONO_A, "admin");
  membro(ORG_B, DONO_B, "admin");
  funil(ORG_A, "00000000-0000-4000-8000-00000000f00a", "Vendas A");
  funil(ORG_B, "00000000-0000-4000-8000-00000000f00b", "Vendas B");
});

describe("conexão MCP pelo cliente oficial do SDK", () => {
  it("tools/list mostra só as ferramentas do escopo; a leitura funciona e fica registrada", async () => {
    const { token, id } = conexao({ org: ORG_A, dono: DONO_A, escopos: ["pipelines:read", "leads:read"] });
    const cliente = await conectar(token);

    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_lead", "list_leads", "list_pipelines"]);

    const r = await cliente.callTool({ name: "list_pipelines", arguments: {} });
    expect(r.isError).toBeFalsy();
    const texto = (r.content as Array<{ text: string }>)[0]!.text;
    expect(texto).toContain("Vendas A");
    expect(texto).not.toContain("Vendas B");
    await cliente.close();

    const registro = banco.linhas("mcp_call_log").filter((l) => l.connection_id === id && l.tool === "list_pipelines");
    expect(registro.at(-1)).toMatchObject({ result: "ok", records: 1, organization_id: ORG_A, owner_user_id: DONO_A });
  });

  it("ferramenta fora do escopo é recusada e registrada como negado", async () => {
    const { token, id } = conexao({ org: ORG_A, dono: DONO_A, escopos: ["pipelines:read"] });
    const cliente = await conectar(token);
    const r = await cliente.callTool({
      name: "create_lead",
      arguments: { pipeline_id: ORG_A, stage_id: ORG_A, title: "Novo negócio" },
    });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text: string }>)[0]!.text).toContain("leads:write");
    await cliente.close();
    expect(banco.linhas("mcp_call_log").find((l) => l.connection_id === id && l.tool === "create_lead")).toMatchObject({
      result: "negado",
      reason: "scope",
      arg_keys: ["pipeline_id", "stage_id", "title"],
    });
    expect(banco.linhas("crm_leads")).toHaveLength(0);
  });
});

describe("revalidação a cada chamada", () => {
  it("revogada → 401 com o desafio Bearer; expirada → 401", async () => {
    const revogada = conexao({ org: ORG_A, dono: DONO_A, escopos: ["pipelines:read"], revogada: true });
    const r1 = await postar(revogada.token, chamada("list_pipelines"));
    expect(r1.status).toBe(401);
    expect(r1.headers.get("www-authenticate")).toContain("resource_metadata=");
    const expirada = conexao({ org: ORG_A, dono: DONO_A, escopos: ["pipelines:read"], expirada: true });
    expect((await postar(expirada.token, chamada("list_pipelines"))).status).toBe(401);
    expect((await postar("apx_mcp_inexistente", chamada("list_pipelines"))).status).toBe(401);
  });

  it("interruptor desligado → 403 mcp_disabled, inclusive para conexão que já existia", async () => {
    const { token } = conexao({ org: ORG_A, dono: DONO_A, escopos: ["pipelines:read"] });
    (banco.linhas("organizations").find((o) => o.id === ORG_A)!.settings as { mcp: { enabled: boolean } }).mcp.enabled = false;
    const r = await postar(token, chamada("list_pipelines"));
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).toContain("mcp_disabled");
  });

  it("dono que caiu de papel perde o que o papel novo não alcança; dono removido → 403", async () => {
    const { token } = conexao({ org: ORG_A, dono: DONO_A, escopos: ["flows:read", "flows:write"] });
    banco.linhas("user_organizations").find((m) => m.user_id === DONO_A)!.role = "agent";
    const cliente = await conectar(token);
    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_flow", "list_flows"]);
    await cliente.close();

    banco.linhas("user_organizations").find((m) => m.user_id === DONO_A)!.revoked_at = new Date().toISOString();
    expect((await postar(token, chamada("list_flows"))).status).toBe(403);
  });

  it("IP fora da lista → 403", async () => {
    const { token } = conexao({ org: ORG_A, dono: DONO_A, escopos: ["pipelines:read"], ips: ["10.0.0.0/8"] });
    expect((await postar(token, chamada("list_pipelines"))).status).toBe(403);
  });
});

describe("isolamento entre organizações", () => {
  it("a conexão da B não alcança o negócio da A, nem pelo id", async () => {
    banco.linhas("crm_leads").push({
      id: "00000000-0000-4000-8000-00000000ae0a",
      organization_id: ORG_A,
      title: "Negócio da A",
    });
    const { token } = conexao({ org: ORG_B, dono: DONO_B, escopos: ["leads:read"] });
    const r = await postar(token, chamada("get_lead", { lead_id: "00000000-0000-4000-8000-00000000ae0a" }));
    const corpo = JSON.stringify(await r.json());
    expect(corpo).toContain("not_found");
    expect(corpo).not.toContain("Negócio da A");
  });
});

describe("freio de uso indevido", () => {
  it("20 recusas de permissão em 10 minutos suspendem a conexão e avisam a Central", async () => {
    const { token, id } = conexao({ org: ORG_A, dono: DONO_A, escopos: ["pipelines:read"] });
    for (let i = 0; i < 20; i++) await postar(token, chamada("list_contacts"));
    const linha = banco.linhas("mcp_connections").find((c) => c.id === id)!;
    expect(linha.suspended_at).not.toBeNull();
    expect(banco.linhas("agent_inbox_items").filter((a) => a.kind === "mcp_conexao_suspensa")).toHaveLength(1);
    expect((await postar(token, chamada("list_pipelines"))).status).toBe(403);
  });
});
