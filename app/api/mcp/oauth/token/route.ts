/**
 * POST /api/mcp/oauth/token — troca o código (PKCE S256) por access/refresh, e
 * renova com rotação. `application/x-www-form-urlencoded`, como o RFC 6749
 * pede; JSON também é aceito. Limite de 60 por minuto por IP.
 */
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { segundosAteVirar } from "@/lib/mcp/v1/limites";
import { ErroOAuth, renovarPar, respostaDoErroOAuth, trocarCodigo } from "@/lib/mcp/v1/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function lerCorpo(req: NextRequest): Promise<Record<string, string>> {
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  const texto = await req.text();
  return Object.fromEntries(new URLSearchParams(texto).entries());
}

export async function POST(req: NextRequest): Promise<Response> {
  const ip = ipDoCliente(req.headers) ?? "sem-ip";
  const limite = await checkRateLimit(`mcpv1:oauth-token:${ip}`, 60, 60);
  if (!limite.allowed) {
    const r = respostaDoErroOAuth(new ErroOAuth("invalid_request", "Muitas tentativas. Tente de novo em instantes.", 429));
    r.headers.set("Retry-After", String(segundosAteVirar(60)));
    return r;
  }
  const corpo = await lerCorpo(req);
  const db = createAdminClient();
  try {
    let par;
    if (corpo.grant_type === "authorization_code") {
      par = await trocarCodigo(db, {
        code: corpo.code ?? "",
        redirect_uri: corpo.redirect_uri ?? "",
        client_id: corpo.client_id ?? "",
        code_verifier: corpo.code_verifier ?? "",
      });
    } else if (corpo.grant_type === "refresh_token") {
      par = await renovarPar(db, { refresh_token: corpo.refresh_token ?? "", client_id: corpo.client_id ?? "" });
    } else {
      throw new ErroOAuth("unsupported_grant_type", "Use authorization_code ou refresh_token.");
    }
    return new Response(JSON.stringify(par), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store", pragma: "no-cache" },
    });
  } catch (err) {
    if (err instanceof ErroOAuth) return respostaDoErroOAuth(err);
    return respostaDoErroOAuth(new ErroOAuth("invalid_grant", "Não foi possível emitir o acesso.", 500));
  }
}
