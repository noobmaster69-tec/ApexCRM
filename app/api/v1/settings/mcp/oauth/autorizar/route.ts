/**
 * POST /api/v1/settings/mcp/oauth/autorizar — o "Permitir" da tela de
 * consentimento OAuth. O admin logado escolhe perfil, validade e dados
 * pessoais; nasce uma conexão `oauth` da organização DELE, um código de uso
 * único (10 min, PKCE S256) e a URL de volta para o cliente.
 *
 * "Recusar" também passa por aqui (`decision: "deny"`): volta ao cliente com
 * `error=access_denied`, sem criar nada.
 *
 * O pedido OAuth é conferido DE NOVO aqui (cliente, redirect, PKCE): a tela é
 * só a vitrine, e o corpo desta chamada vem do navegador.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { criarConexao, lerInterruptor, novaConexaoSchema } from "@/lib/mcp/v1/conexoes";
import { conferirPedido, emitirCodigo, urlDeVolta } from "@/lib/mcp/v1/oauth";
import { adminDaOrganizacao, respostaDoErro } from "@/lib/mcp/v1/rotas-da-gestao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({
  decision: z.enum(["allow", "deny"]),
  request: z.record(z.string(), z.string().max(2000)),
  connection: novaConexaoSchema.omit({ tool: true }).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const requestId = randomUUID();
  const a = await adminDaOrganizacao(requestId);
  if (!a.ok) return a.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Pedido de autorização inválido.", 422, { requestId });

  const db = createAdminClient();
  const conferido = await conferirPedido(db, parsed.data.request);
  if (!conferido.ok) return fail("invalid_request", conferido.erro, 422, { requestId });

  if (parsed.data.decision === "deny") {
    return ok({ redirect_to: urlDeVolta(conferido.pedido, { error: "access_denied" }) }, { requestId });
  }
  if (!(await lerInterruptor(db, a.quem.organizationId))) {
    return fail("mcp_disabled", "Ligue \"Permitir conexões MCP\" antes de autorizar.", 409, { requestId });
  }
  if (!parsed.data.connection) return fail("validation_failed", "Escolha o perfil da conexão.", 422, { requestId });

  try {
    const { conexao } = await criarConexao(
      db,
      a.quem,
      { ...parsed.data.connection, tool: "claude_desktop" },
      { clientId: conferido.cliente.id },
    );
    const codigo = await emitirCodigo(db, {
      organizationId: a.quem.organizationId,
      conexaoId: conexao.id,
      cliente: conferido.cliente,
      pedido: conferido.pedido,
    });
    return ok({ redirect_to: urlDeVolta(conferido.pedido, { code: codigo }) }, { requestId });
  } catch (err) {
    return respostaDoErro(err, requestId);
  }
}
