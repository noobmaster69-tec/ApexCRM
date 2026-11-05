/**
 * Os endereços públicos do MCP: o recurso protegido e os metadados OAuth.
 *
 * Saem SEMPRE de `NEXT_PUBLIC_APP_URL`, nunca do header `Host` da requisição:
 * um `Host` forjado faria os metadados apontarem o cliente para outro servidor
 * de autorização (mesma régua de `lib/auth/entrada-com-google.ts`).
 */
import { env } from "@/lib/env";

export function baseDoApp(): string {
  return (env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function urlDoRecurso(): string {
  return `${baseDoApp()}/api/mcp`;
}

export function urlDosMetadadosDoRecurso(): string {
  return `${baseDoApp()}/.well-known/oauth-protected-resource`;
}

export const CAMINHOS_OAUTH = {
  autorizar: "/app/settings/integracoes/mcp/autorizar",
  token: "/api/mcp/oauth/token",
  registrar: "/api/mcp/oauth/register",
  revogar: "/api/mcp/oauth/revoke",
} as const;

/** O `Origin` de um navegador só passa se for o da própria aplicação. */
export function origemPermitida(origin: string | null): boolean {
  if (origin === null || origin === "") return true;
  try {
    return new URL(origin).origin === new URL(baseDoApp()).origin;
  } catch {
    return false;
  }
}
