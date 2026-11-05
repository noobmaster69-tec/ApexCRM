/**
 * MCP server endpoint (Spec 11 §2 + §5.4).
 *
 * Streamable HTTP transport via `WebStandardStreamableHTTPServerTransport`
 * (Next.js App Router recebe Web `Request`). Stateless: cada request abre
 * um transport+server fresh.
 *
 * DUAS CREDENCIAIS, UM SERVIDOR (migration 9023):
 *   - `apx_mcp_…` / `apx_oat_…` — as CONEXÕES MCP de Configurações › Integrações
 *     › MCP (Claude Code, Claude Desktop, Cursor). Escopos fechados, lista de
 *     bloqueio, interruptor da organização, limites e registro por chamada:
 *     `lib/mcp/v1/rota.ts`;
 *   - `dsk_…` — os tokens de API de servidor (`api_tokens`), o caminho de
 *     antes, intacto: integrações e o harness dos agentes dependem dele.
 *
 * Nas duas: só `Authorization: Bearer` (credencial em query string é
 * recusada) e `Origin` conferido quando o cliente manda um (DNS rebinding).
 *
 * NUNCA logamos plaintext do bearer. Em erro retornamos JSON-RPC 2.0
 * envelope com `error.code` MCP (-32001/-32002/etc).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createMcpServer } from "@/lib/mcp/server";
import { McpAuthError, validateBearerToken } from "@/lib/mcp/auth";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { chaveDaRequisicao } from "@/lib/api/idempotency";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { origemPermitida } from "@/lib/mcp/v1/enderecos";
import { atenderConexao, desafioBearer } from "@/lib/mcp/v1/rota";
import { tipoDoSegredo } from "@/lib/mcp/v1/token";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function jsonRpcError(code: number, message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

/** Credencial em query string vaza em log de proxy: recusada antes de tudo. */
const PARAMETROS_DE_CREDENCIAL = ["access_token", "token", "api_key", "apikey", "key"];

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!origemPermitida(req.headers.get("origin"))) {
    return jsonRpcError(-32003, "origin_not_allowed", 403);
  }
  const busca = new URL(req.url).searchParams;
  if (PARAMETROS_DE_CREDENCIAL.some((p) => busca.has(p))) {
    return jsonRpcError(-32600, "Credentials are accepted only in the Authorization header.", 400);
  }

  const cabecalho = req.headers.get("authorization") ?? "";
  const segredo = /^Bearer\s+(\S+)$/i.exec(cabecalho.trim())?.[1] ?? null;
  if (segredo === null) {
    const r = jsonRpcError(-32001, "Missing bearer token.", 401);
    r.headers.set("WWW-Authenticate", desafioBearer());
    return r;
  }

  if (tipoDoSegredo(segredo) !== null) {
    try {
      const response = await atenderConexao({
        db: createAdminClient(),
        req: req as unknown as Request,
        segredo,
        ip: ipDoCliente(req.headers),
        requestId,
      });
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (err) {
      logger.error("[mcp] conexão: falha no atendimento", { requestId, error: err instanceof Error ? err.message : String(err) });
      return jsonRpcError(-32603, "internal_error", 500);
    }
  }

  let auth;
  try {
    // Empresa suspensa entra marcada: o servidor só deixa a privacidade
    // responder (LGPD nunca é bloqueada — decisão do dono, 30/09).
    auth = await validateBearerToken(req.headers.get("authorization"), { permiteOrgSuspensa: true });
  } catch (err) {
    if (err instanceof McpAuthError) {
      return jsonRpcError(err.mcpCode, err.message, err.httpStatus);
    }
    const msg = err instanceof Error ? err.message : "auth_failed";
    return jsonRpcError(-32603, msg, 500);
  }

  const idempotencyKey = chaveDaRequisicao(req);
  if (idempotencyKey !== null && !z.string().uuid().safeParse(idempotencyKey).success) {
    return jsonRpcError(-32602, "Idempotency-Key deve ser UUID", 400);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({});
  const admin = createAdminClient();
  const server = createMcpServer(
    auth,
    requestId,
    await modulosLigados(admin),
    await capacidadesDaOrganizacao(admin, auth.organizationId),
    idempotencyKey ?? undefined,
  );

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(req as unknown as Request);
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "transport_error";
    return jsonRpcError(-32603, msg, 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}
