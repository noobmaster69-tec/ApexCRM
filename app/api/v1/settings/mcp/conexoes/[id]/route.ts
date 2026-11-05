/**
 * GET /api/v1/settings/mcp/conexoes/:id — a conexão, o que ela pode e as
 * últimas 200 chamadas (data, ferramenta, resultado, quantos registros). Admin.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { detalheDaConexao, statusDaConexao } from "@/lib/mcp/v1/conexoes";
import { ehEscopo, resumoDosEscopos } from "@/lib/mcp/v1/escopos";
import { adminDaOrganizacao, respostaDoErro } from "@/lib/mcp/v1/rotas-da-gestao";
import { resolveUserNames } from "@/lib/mcp/tools/_users";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const a = await adminDaOrganizacao(requestId);
  if (!a.ok) return a.response;
  try {
    const db = createAdminClient();
    const detalhe = await detalheDaConexao(db, a.quem.organizationId, id);
    if (!detalhe) return fail("not_found", "Conexão não encontrada.", 404, { requestId });
    const nomes = await resolveUserNames(db, [detalhe.conexao.created_by_user_id]);
    const resumo = resumoDosEscopos(detalhe.conexao.scopes.filter(ehEscopo));
    return ok(
      {
        connection: {
          ...detalhe.conexao,
          status: statusDaConexao(detalhe.conexao),
          created_by_name: nomes.get(detalhe.conexao.created_by_user_id) ?? null,
        },
        can: resumo.pode,
        cannot: resumo.naoPode,
        calls: detalhe.chamadas,
      },
      { requestId },
    );
  } catch (err) {
    return respostaDoErro(err, requestId);
  }
}
