/**
 * GET   /api/v1/settings/mcp — o interruptor "Permitir conexões MCP" e as conexões.
 * PATCH /api/v1/settings/mcp — liga/desliga o interruptor (admin).
 *
 * Desligado (o padrão), `/api/mcp` recusa toda conexão da organização com 403
 * `mcp_disabled`, inclusive as que já existem. Ver `lib/mcp/v1/conexao.ts`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { gravarInterruptor, interruptorSchema, lerInterruptor, listarConexoes, statusDaConexao } from "@/lib/mcp/v1/conexoes";
import { resolveUserNames } from "@/lib/mcp/tools/_users";
import { urlDoRecurso } from "@/lib/mcp/v1/enderecos";
import { adminDaOrganizacao, respostaDoErro } from "@/lib/mcp/v1/rotas-da-gestao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const a = await adminDaOrganizacao(requestId);
  if (!a.ok) return a.response;
  try {
    const db = createAdminClient();
    const [ligado, conexoes] = await Promise.all([
      lerInterruptor(db, a.quem.organizationId),
      listarConexoes(db, a.quem.organizationId),
    ]);
    const nomes = await resolveUserNames(db, conexoes.map((c) => c.created_by_user_id));
    return ok(
      {
        enabled: ligado,
        server_url: urlDoRecurso(),
        connections: conexoes.map((c) => ({
          ...c,
          status: statusDaConexao(c),
          created_by_name: nomes.get(c.created_by_user_id) ?? null,
        })),
      },
      { requestId },
    );
  } catch (err) {
    return respostaDoErro(err, requestId);
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const requestId = randomUUID();
  const a = await adminDaOrganizacao(requestId);
  if (!a.ok) return a.response;
  const parsed = interruptorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Envie { enabled: true | false }.", 422, { requestId });
  try {
    const enabled = await gravarInterruptor(createAdminClient(), a.quem, parsed.data.enabled);
    return ok({ enabled }, { requestId });
  } catch (err) {
    return respostaDoErro(err, requestId);
  }
}
