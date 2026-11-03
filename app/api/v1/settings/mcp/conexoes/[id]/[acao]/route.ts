/**
 * POST /api/v1/settings/mcp/conexoes/:id/revogar  — para de valer na hora.
 * POST /api/v1/settings/mcp/conexoes/:id/renovar  — token novo; o antigo morre.
 * POST /api/v1/settings/mcp/conexoes/:id/reativar — tira a suspensão automática.
 *
 * Admin. Cada uma audita (`mcp.connection_*`).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { reativarConexao, renovarConexao, revogarConexao, statusDaConexao } from "@/lib/mcp/v1/conexoes";
import { adminDaOrganizacao, respostaDoErro } from "@/lib/mcp/v1/rotas-da-gestao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACOES = ["revogar", "renovar", "reativar"] as const;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; acao: string }> }): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const requestId = randomUUID();
  const { id, acao } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  if (!(ACOES as readonly string[]).includes(acao)) return fail("not_found", "Ação desconhecida.", 404, { requestId });
  const a = await adminDaOrganizacao(requestId);
  if (!a.ok) return a.response;
  const db = createAdminClient();
  try {
    if (acao === "renovar") {
      const { conexao, token } = await renovarConexao(db, a.quem, id);
      return ok({ connection: { ...conexao, status: statusDaConexao(conexao) }, token }, { requestId });
    }
    const conexao = acao === "revogar" ? await revogarConexao(db, a.quem, id) : await reativarConexao(db, a.quem, id);
    return ok({ connection: { ...conexao, status: statusDaConexao(conexao) } }, { requestId });
  } catch (err) {
    return respostaDoErro(err, requestId);
  }
}
