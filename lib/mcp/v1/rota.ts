/**
 * O atendimento de `/api/mcp` para as CONEXÕES (`apx_mcp_…` e access token
 * OAuth `apx_oat_…`). A rota chama `atenderConexao`; o caminho dos tokens de
 * API (`dsk_…`) segue o de antes, intacto.
 *
 * A ordem, e por que é esta:
 *   1. `resolverConexao` revalida tudo no banco (401 / 403 com o motivo);
 *   2. só JSON-RPC simples — lote (array) é recusado: cada mensagem precisa do
 *      próprio registro, cobrança e recusa, e a especificação atual do MCP já
 *      não usa lote;
 *   3. a cota por minuto/dia (429 + `Retry-After`) — antes de qualquer trabalho;
 *   4. `tools/call` de ferramenta CONHECIDA fora do escopo é recusada AQUI e
 *      registrada como `negado` (conta para a suspensão automática). O SDK
 *      recusaria também, mas sem rastro;
 *   5. o transporte oficial (Streamable HTTP, sem sessão) com o servidor
 *      montado só com as ferramentas dos escopos que valem agora.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { RecusaDaConexao, resolverConexao, type ConexaoResolvida } from "./conexao";
import { urlDosMetadadosDoRecurso } from "./enderecos";
import { FERRAMENTA_POR_NOME } from "./ferramentas";
import { cobrarChamada, mensagemDoLimite } from "./limites";
import { registrarChamada } from "./registro";
import { criarServidorDaConexao } from "./servidor";

/** Códigos JSON-RPC do servidor (faixa -32000..-32099). */
export const CODIGO_SEM_AUTENTICACAO = -32001;
export const CODIGO_PROIBIDO = -32003;
export const CODIGO_LIMITE = -32029;

function respostaJson(corpo: unknown, status: number, extras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...extras } });
}

export function erroJsonRpc(
  codigo: number,
  mensagem: string,
  status: number,
  dados: Record<string, unknown> = {},
  extras: Record<string, string> = {},
  id: unknown = null,
): Response {
  return respostaJson({ jsonrpc: "2.0", error: { code: codigo, message: mensagem, data: dados }, id }, status, extras);
}

/** O cabeçalho que leva o cliente OAuth aos metadados (RFC 9728). */
export function desafioBearer(erro?: "invalid_token"): string {
  const partes = [`resource_metadata="${urlDosMetadadosDoRecurso()}"`];
  if (erro) partes.push(`error="${erro}"`);
  return `Bearer ${partes.join(", ")}`;
}

export function respostaDaRecusa(r: RecusaDaConexao): Response {
  const extras: Record<string, string> = r.status === 401 ? { "WWW-Authenticate": desafioBearer("invalid_token") } : {};
  return erroJsonRpc(r.status === 401 ? CODIGO_SEM_AUTENTICACAO : CODIGO_PROIBIDO, `${r.motivo}: ${r.message}`, r.status, { reason: r.motivo }, extras);
}

interface MensagemJsonRpc {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { name?: unknown; arguments?: unknown };
}

export interface EntradaDoAtendimento {
  db: SupabaseClient;
  req: Request;
  segredo: string;
  ip: string | null;
  requestId: string;
  agora?: Date;
}

export async function atenderConexao(e: EntradaDoAtendimento): Promise<Response> {
  let conexao: ConexaoResolvida;
  try {
    conexao = await resolverConexao(e.db, e.segredo, e.ip, e.agora);
  } catch (err) {
    if (err instanceof RecusaDaConexao) return respostaDaRecusa(err);
    throw err;
  }

  const metodoHttp = e.req.method.toUpperCase();
  // Servidor sem sessão: não há fluxo iniciado pelo servidor para abrir (GET)
  // nem sessão para encerrar (DELETE). 405 é a resposta que a especificação
  // prevê, e o cliente oficial a trata como "sem stream".
  if (metodoHttp !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const corpoTexto = await e.req.text();
  {
    let bruto: unknown;
    try {
      bruto = JSON.parse(corpoTexto);
    } catch {
      return erroJsonRpc(-32700, "Parse error", 400);
    }
    if (Array.isArray(bruto)) return erroJsonRpc(-32600, "Batch requests are not supported.", 400);
    if (!bruto || typeof bruto !== "object") return erroJsonRpc(-32600, "Invalid Request", 400);
    const mensagem = bruto as MensagemJsonRpc;

    const nomeDaChamada =
      mensagem.method === "tools/call" && typeof mensagem.params?.name === "string"
        ? mensagem.params.name.slice(0, 80)
        : (mensagem.method ?? "desconhecido").slice(0, 80);
    const args =
      mensagem.params?.arguments && typeof mensagem.params.arguments === "object"
        ? (mensagem.params.arguments as Record<string, unknown>)
        : null;
    const base = { conexao, ferramenta: nomeDaChamada, ip: e.ip, requestId: e.requestId, args };

    // Notificações e respostas (sem `id`) não cobram: o cliente as manda por
    // protocolo, não por vontade, e o `initialized` contaria em toda sessão.
    if (mensagem.id !== undefined && mensagem.method) {
      const estouro = await cobrarChamada(conexao.id);
      if (estouro) {
        await registrarChamada(e.db, { ...base, resultado: "negado", motivo: estouro.motivo });
        return erroJsonRpc(
          CODIGO_LIMITE,
          `rate_limited: ${mensagemDoLimite(estouro)}`,
          429,
          { reason: "rate_limited", retry_after: estouro.retryAfter },
          { "Retry-After": String(estouro.retryAfter) },
          mensagem.id,
        );
      }
    }

    if (mensagem.method === "tools/call") {
      const f = FERRAMENTA_POR_NOME.get(nomeDaChamada);
      if (!f) {
        await registrarChamada(e.db, { ...base, resultado: "negado", motivo: "unknown_tool" });
      } else if (!conexao.escopos.has(f.escopo)) {
        await registrarChamada(e.db, { ...base, resultado: "negado", motivo: "scope" });
        return respostaJson(
          {
            jsonrpc: "2.0",
            id: mensagem.id ?? null,
            result: {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `forbidden: esta conexão não tem a permissão ${f.escopo}, exigida por ${f.nome}.`,
                },
              ],
            },
          },
          200,
        );
      } else if (!z.object(f.entrada).safeParse(args ?? {}).success) {
        await registrarChamada(e.db, { ...base, resultado: "erro", motivo: "validation_failed" });
      }
    }
  }

  const transporte = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const servidor = criarServidorDaConexao({ db: e.db, conexao, requestId: e.requestId, ip: e.ip });
  await servidor.connect(transporte);
  const pedido = new Request(e.req.url, { method: "POST", headers: e.req.headers, body: corpoTexto });
  return transporte.handleRequest(pedido);
}
