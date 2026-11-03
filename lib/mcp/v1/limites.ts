/**
 * Os limites de uso de cada conexão MCP v1, no MESMO mecanismo que o resto do
 * produto usa (`checkRateLimit`: janela fixa, Redis quando há, memória quando
 * não há — ver o cabeçalho de `lib/mcp/rate-limit.ts` sobre o que isso implica).
 *
 *   - 60 chamadas por minuto
 *   - 5.000 chamadas por dia
 *   - 300 escritas por dia
 *
 * Estourou → a chamada é recusada com o tempo até a janela virar
 * (`Retry-After`), e entra no registro como `negado` (motivo `rate_limit` ou
 * `write_cap` — que NÃO contam para a suspensão automática: limite de uso não
 * é tentativa de fazer o que não pode).
 */
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

export const POR_MINUTO = 60;
export const POR_DIA = 5_000;
export const ESCRITAS_POR_DIA = 300;
const MINUTO = 60;
const DIA = 86_400;

export interface LimiteEstourado {
  motivo: "rate_limit" | "write_cap";
  qual: "minuto" | "dia" | "escritas";
  retryAfter: number;
}

/** Segundos até a janela fixa atual virar. */
export function segundosAteVirar(janelaSeg: number, agora: number = Date.now()): number {
  const passou = Math.floor(agora / 1000) % janelaSeg;
  return Math.max(1, janelaSeg - passou);
}

/** Cobra minuto e dia, nessa ordem; o primeiro que estourar decide. */
export async function cobrarChamada(conexaoId: string): Promise<LimiteEstourado | null> {
  const minuto = await checkRateLimit(`mcpv1:min:${conexaoId}`, POR_MINUTO, MINUTO);
  if (!minuto.allowed) return { motivo: "rate_limit", qual: "minuto", retryAfter: segundosAteVirar(MINUTO) };
  const dia = await checkRateLimit(`mcpv1:dia:${conexaoId}`, POR_DIA, DIA);
  if (!dia.allowed) return { motivo: "rate_limit", qual: "dia", retryAfter: segundosAteVirar(DIA) };
  return null;
}

export async function cobrarEscrita(conexaoId: string): Promise<LimiteEstourado | null> {
  const escritas = await checkRateLimit(`mcpv1:esc:${conexaoId}`, ESCRITAS_POR_DIA, DIA);
  if (!escritas.allowed) return { motivo: "write_cap", qual: "escritas", retryAfter: segundosAteVirar(DIA) };
  return null;
}

export function mensagemDoLimite(l: LimiteEstourado): string {
  const texto = {
    minuto: `Limite de ${POR_MINUTO} chamadas por minuto desta conexão atingido.`,
    dia: `Limite de ${POR_DIA} chamadas por dia desta conexão atingido.`,
    escritas: `Limite de ${ESCRITAS_POR_DIA} escritas por dia desta conexão atingido.`,
  }[l.qual];
  return `${texto} Tente de novo em ${l.retryAfter}s.`;
}
