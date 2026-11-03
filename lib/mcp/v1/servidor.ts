/**
 * O servidor MCP das CONEXÕES (`apx_mcp_…` e OAuth), montado a cada chamada
 * para a conexão que está chamando.
 *
 * Só as ferramentas dos escopos que valem AGORA (conexão ∩ papel atual do dono)
 * são registradas: o resto nem aparece em `tools/list`. A chamada a uma
 * ferramenta conhecida fora do escopo não chega aqui — a rota a recusa antes e
 * registra a recusa (`recusaDeEscopo`), porque ferramenta não registrada o SDK
 * recusaria sem deixar rastro.
 *
 * Cada execução:
 *   1. cobra a cota de escrita, quando escreve;
 *   2. roda dentro de `comOrigemMcp`, para a auditoria e a linha do tempo dos
 *      handlers reaproveitados dizerem "via MCP: <conexão>";
 *   3. age como o dono, com o papel atual dele;
 *   4. registra ok/erro com a quantidade de registros, e o último uso.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import { resolveUserNames } from "@/lib/mcp/tools/_users";
import type { ConexaoResolvida } from "./conexao";
import { ferramentasVisiveis, type FerramentaV1 } from "./ferramentas";
import { cobrarEscrita, mensagemDoLimite } from "./limites";
import { comOrigemMcp } from "./origem";
import { marcarUltimoUso, registrarChamada } from "./registro";

export const NOME_DO_SERVIDOR = "apex-crm";
export const VERSAO_DO_SERVIDOR = "1.0.0";

export interface ChamadaDoServidor {
  db: SupabaseClient;
  conexao: ConexaoResolvida;
  requestId: string;
  ip: string | null;
}

/** O texto de erro que volta ao modelo: código e mensagem, nunca stack nem SQL. */
export function erroParaOModelo(err: unknown): { codigo: string; mensagem: string } {
  if (err instanceof ApiError) {
    const interno = err.status >= 500;
    return { codigo: err.code, mensagem: interno ? "Erro interno. Tente de novo." : err.message };
  }
  if (err && typeof err === "object" && "issues" in err) {
    return { codigo: "validation_failed", mensagem: "Argumentos inválidos." };
  }
  const msg = err instanceof Error ? err.message : "";
  if (msg === "target_not_found" || msg === "not_found") return { codigo: "not_found", mensagem: "Registro não encontrado." };
  return { codigo: "internal_error", mensagem: "Erro interno. Tente de novo." };
}

async function nomeDoDono(db: SupabaseClient, donoId: string): Promise<string> {
  const nomes = await resolveUserNames(db, [donoId]);
  return nomes.get(donoId) ?? "dono da conexão";
}

export async function executarFerramenta(
  f: FerramentaV1,
  args: Record<string, unknown>,
  c: ChamadaDoServidor,
): Promise<{ isError?: boolean; content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown> }> {
  const inicio = Date.now();
  const base = { conexao: c.conexao, ferramenta: f.nome, ip: c.ip, requestId: c.requestId, args };

  if (f.escrita) {
    const estouro = await cobrarEscrita(c.conexao.id);
    if (estouro) {
      await registrarChamada(c.db, { ...base, resultado: "negado", motivo: estouro.motivo, duracaoMs: Date.now() - inicio });
      return { isError: true, content: [{ type: "text", text: `write_cap: ${mensagemDoLimite(estouro)}` }] };
    }
  }

  try {
    const origem = {
      conexaoId: c.conexao.id,
      conexaoNome: c.conexao.nome,
      donoId: c.conexao.donoId,
      donoNome: f.escrita ? await nomeDoDono(c.db, c.conexao.donoId) : "",
    };
    const { resultado, registros } = await comOrigemMcp(origem, () =>
      f.executar(args as never, { db: c.db, conexao: c.conexao, requestId: c.requestId }),
    );
    await registrarChamada(c.db, { ...base, resultado: "ok", registros, duracaoMs: Date.now() - inicio });
    await marcarUltimoUso(c.db, c.conexao, c.ip);
    return {
      content: [{ type: "text", text: JSON.stringify(resultado) }],
      structuredContent: resultado as Record<string, unknown>,
    };
  } catch (err) {
    const { codigo, mensagem } = erroParaOModelo(err);
    await registrarChamada(c.db, { ...base, resultado: "erro", motivo: codigo, duracaoMs: Date.now() - inicio });
    await marcarUltimoUso(c.db, c.conexao, c.ip);
    return { isError: true, content: [{ type: "text", text: `${codigo}: ${mensagem}` }] };
  }
}

export function criarServidorDaConexao(c: ChamadaDoServidor): McpServer {
  const servidor = new McpServer({ name: NOME_DO_SERVIDOR, version: VERSAO_DO_SERVIDOR });
  for (const f of ferramentasVisiveis(c.conexao.escopos)) {
    servidor.registerTool(
      f.nome,
      {
        description: f.descricao,
        inputSchema: f.entrada,
        annotations: { readOnlyHint: !f.escrita, destructiveHint: false, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => executarFerramenta(f, args ?? {}, c),
    );
  }
  return servidor;
}
