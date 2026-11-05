/**
 * GET /.well-known/oauth-authorization-server[/api/mcp] — metadados do
 * servidor de autorização do MCP (RFC 8414). Documento estático, público.
 */
import { metadadosDoServidor } from "@/lib/mcp/v1/oauth";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(metadadosDoServidor(), { headers: { "cache-control": "public, max-age=300" } });
}
