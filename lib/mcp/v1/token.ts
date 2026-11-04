/**
 * Os segredos das conexões MCP (migration 9923).
 *
 * Três tipos, cada um com prefixo reconhecível — quem acha um destes num log ou
 * num repositório sabe na hora o que é e onde revogar:
 *   - `apx_mcp_…`  token de conexão (Claude Code, Cursor, outras)
 *   - `apx_oat_…`  access token OAuth (1h)
 *   - `apx_ort_…`  refresh token OAuth (com rotação)
 *
 * Todos são o prefixo + 32 bytes aleatórios em base64url. No banco fica SÓ o
 * SHA-256 (índice único); o texto aparece uma vez, na criação, e nunca mais.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PREFIXO_DO_TOKEN = "apx_mcp_";
export const PREFIXO_DO_ACCESS = "apx_oat_";
export const PREFIXO_DO_REFRESH = "apx_ort_";

export type TipoDeSegredo = "token" | "access" | "refresh";

const PREFIXO: Record<TipoDeSegredo, string> = {
  token: PREFIXO_DO_TOKEN,
  access: PREFIXO_DO_ACCESS,
  refresh: PREFIXO_DO_REFRESH,
};

export function gerarSegredo(tipo: TipoDeSegredo): string {
  return PREFIXO[tipo] + randomBytes(32).toString("base64url");
}

export function hashDoSegredo(texto: string): Buffer {
  return createHash("sha256").update(texto).digest();
}

/** O literal `bytea` que o PostgREST entende (`\x…`). */
export function hashComoBytea(texto: string): string {
  return `\\x${hashDoSegredo(texto).toString("hex")}`;
}

/** O que o PostgREST devolve de uma coluna `bytea` (`\x…`) de volta em bytes. */
export function byteaParaBuffer(valor: unknown): Buffer | null {
  if (typeof valor !== "string" || !valor.startsWith("\\x")) return null;
  return Buffer.from(valor.slice(2), "hex");
}

/**
 * Confere em tempo constante que o hash gravado é o do texto apresentado. A
 * busca é pelo índice único do hash; esta conferência existe para que nenhuma
 * comparação de segredo dependa de `===`, nem a de depois do índice.
 */
export function confereSegredo(texto: string, gravado: unknown): boolean {
  const esperado = byteaParaBuffer(gravado);
  if (!esperado) return false;
  const calculado = hashDoSegredo(texto);
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
}

export function tipoDoSegredo(texto: string): TipoDeSegredo | null {
  if (texto.startsWith(PREFIXO_DO_TOKEN)) return "token";
  if (texto.startsWith(PREFIXO_DO_ACCESS)) return "access";
  if (texto.startsWith(PREFIXO_DO_REFRESH)) return "refresh";
  return null;
}

/** Os últimos 4 caracteres, para a lista mostrar "…a1b2" sem guardar o token. */
export function dicaDoToken(texto: string): string {
  return `…${texto.slice(-4)}`;
}
