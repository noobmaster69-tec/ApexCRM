/**
 * DE ONDE VEIO A MUTAÇÃO — o contexto da chamada MCP, sem passar por argumento.
 *
 * As ferramentas v1 reusam os handlers que a tela e a API já usam (contatos,
 * negócios, etiquetas, fluxos). Esses handlers gravam auditoria e timeline com
 * o ator que recebem — a pessoa dona da conexão —, e não sabem que a chamada
 * veio do MCP. Em vez de abrir um parâmetro em cada um, o servidor MCP roda a
 * ferramenta dentro deste contexto, e os dois pontos centrais o leem:
 *
 *   - `audit()` (`lib/audit/index.ts`) acrescenta à metadata quem agiu de fato:
 *     "conexão MCP <nome> (de <pessoa>)";
 *   - `buildLeadActivityRow` (`lib/leads/activity-emitter.ts`) marca a linha da
 *     timeline com a origem "via MCP: <nome da conexão>".
 *
 * Fora de uma chamada MCP o contexto é `undefined` e nada muda.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface OrigemMcp {
  conexaoId: string;
  conexaoNome: string;
  donoId: string;
  donoNome: string;
}

const armazem = new AsyncLocalStorage<OrigemMcp>();

export function comOrigemMcp<T>(origem: OrigemMcp, fn: () => Promise<T>): Promise<T> {
  return armazem.run(origem, fn);
}

export function origemMcpAtual(): OrigemMcp | undefined {
  return armazem.getStore();
}

/** O rótulo da timeline. */
export function rotuloDaOrigem(o: OrigemMcp): string {
  return `via MCP: ${o.conexaoNome}`;
}

/** O que a auditoria acrescenta à metadata de uma mutação feita pelo MCP. */
export function metadataDaOrigem(o: OrigemMcp): Record<string, unknown> {
  return {
    via: "mcp",
    mcp_connection_id: o.conexaoId,
    mcp_connection_name: o.conexaoNome,
    ator_descricao: `conexão MCP ${o.conexaoNome} (de ${o.donoNome})`,
  };
}
