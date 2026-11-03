/**
 * POST /api/v1/settings/mcp/conexoes — cria uma conexão MCP por token (admin).
 *
 * O token volta UMA vez, nesta resposta; no banco fica só o SHA-256. Criar
 * avisa todos os admins na Central. A lista é o GET de `/api/v1/settings/mcp`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { criarConexao, novaConexaoSchema, statusDaConexao } from "@/lib/mcp/v1/conexoes";
import { urlDoRecurso } from "@/lib/mcp/v1/enderecos";
import { adminDaOrganizacao, respostaDoErro } from "@/lib/mcp/v1/rotas-da-gestao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const requestId = randomUUID();
  const a = await adminDaOrganizacao(requestId);
  if (!a.ok) return a.response;

  const parsed = novaConexaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Confira o nome, o perfil, a validade e os IPs.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  if (parsed.data.tool === "claude_desktop") {
    return fail(
      "use_oauth",
      "Claude Desktop e claude.ai conectam por OAuth: adicione o conector com o endereço do servidor e aprove na tela que abrir.",
      422,
      { requestId },
    );
  }
  try {
    const { conexao, token } = await criarConexao(createAdminClient(), a.quem, parsed.data);
    return ok(
      { connection: { ...conexao, status: statusDaConexao(conexao) }, token, server_url: urlDoRecurso() },
      { requestId, status: 201 },
    );
  } catch (err) {
    return respostaDoErro(err, requestId);
  }
}
