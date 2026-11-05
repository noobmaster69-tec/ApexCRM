/**
 * POST /api/mcp/oauth/register — registro dinâmico de cliente OAuth (RFC 7591).
 *
 * Público por natureza: o cliente MCP se registra ANTES de qualquer login.
 * Registrar não dá acesso a nada — só um admin, na tela de consentimento, cria
 * a conexão. Limite de 20 registros por hora por IP contra enchimento da tabela.
 */
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { segundosAteVirar } from "@/lib/mcp/v1/limites";
import { ErroOAuth, registrarCliente, respostaDoErroOAuth } from "@/lib/mcp/v1/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POR_HORA = 20;

export async function POST(req: NextRequest): Promise<Response> {
  const ip = ipDoCliente(req.headers) ?? "sem-ip";
  const limite = await checkRateLimit(`mcpv1:oauth-reg:${ip}`, POR_HORA, 3_600);
  if (!limite.allowed) {
    const r = respostaDoErroOAuth(new ErroOAuth("invalid_request", "Muitos registros deste endereço. Tente mais tarde.", 429));
    r.headers.set("Retry-After", String(segundosAteVirar(3_600)));
    return r;
  }
  try {
    const cliente = await registrarCliente(createAdminClient(), await req.json().catch(() => null));
    return new Response(JSON.stringify(cliente), {
      status: 201,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ErroOAuth) return respostaDoErroOAuth(err);
    return respostaDoErroOAuth(new ErroOAuth("invalid_client_metadata", "Não foi possível registrar o cliente.", 500));
  }
}
