/**
 * O miolo comum das rotas de `/api/v1/settings/mcp`: quem é, e como um erro da
 * gestão vira resposta. Só admin — conexão MCP é credencial da organização.
 */
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { logger } from "@/lib/logger";
import { ErroDaGestao, type Quem } from "./conexoes";

export async function adminDaOrganizacao(
  requestId: string,
): Promise<{ ok: true; quem: Quem; idioma: string } | { ok: false; response: Response }> {
  const authz = await requireRole("admin", { requestId, resource: "mcp_connections" });
  if (!authz.ok) return { ok: false, response: authz.response };
  if (await mfaEmDivida()) {
    return { ok: false, response: fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId }) };
  }
  return {
    ok: true,
    idioma: authz.user.idioma,
    quem: {
      organizationId: authz.org.orgId,
      userId: authz.user.id,
      nome: authz.user.full_name?.trim() || authz.user.email || "Um admin",
      requestId,
    },
  };
}

export function respostaDoErro(err: unknown, requestId: string): Response {
  if (err instanceof ErroDaGestao) return fail(err.codigo, err.message, err.status, { requestId });
  logger.error("[mcp] gestão de conexões", { requestId, error: err instanceof Error ? err.message : String(err) });
  return fail("internal_error", "Não foi possível concluir a operação.", 500, { requestId });
}
