/**
 * GET /.well-known/oauth-protected-resource[/api/mcp] — metadados do recurso
 * protegido `/api/mcp` (RFC 9728): aponta o cliente para o servidor de
 * autorização. Documento estático, público.
 */
import { metadadosDoRecurso } from "@/lib/mcp/v1/oauth";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(metadadosDoRecurso(), { headers: { "cache-control": "public, max-age=300" } });
}
