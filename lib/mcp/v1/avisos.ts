/**
 * Os avisos das conexões MCP na Central (migration 9023): todos os admins da
 * organização veem. O aviso não aponta para uma linha (`ref_kind` nulo) — o
 * contexto geral leva à tela de MCP, que é só do admin (`lib/ai/inbox-destino.ts`).
 *
 * Fire-and-forget: aviso que não grava vira log, nunca derruba a operação.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export type KindDoAvisoMcp = "mcp_conexao_criada" | "mcp_conexao_expirando" | "mcp_conexao_suspensa";

export const TELA_DE_MCP = "/app/settings/integracoes/mcp";

export async function avisarAdmins(
  db: SupabaseClient,
  aviso: { organizationId: string; kind: KindDoAvisoMcp; titulo: string; corpo: string },
): Promise<void> {
  const { error } = await db.from("agent_inbox_items").insert({
    organization_id: aviso.organizationId,
    kind: aviso.kind,
    severity: aviso.kind === "mcp_conexao_suspensa" ? "critical" : aviso.kind === "mcp_conexao_expirando" ? "warn" : "info",
    title: aviso.titulo,
    body: aviso.corpo,
    ref_kind: null,
    ref_id: null,
  });
  if (error) logger.warn("[mcp] aviso da Central não gravou", { kind: aviso.kind, error: error.message });
}

export function avisoDeConexaoCriada(nome: string, quem: string) {
  return {
    kind: "mcp_conexao_criada" as const,
    titulo: `Nova conexão MCP: ${nome}`,
    corpo: `${quem} criou a conexão MCP "${nome}". Confira em Configurações › Integrações › MCP o que ela pode fazer — e revogue se não reconhecer.`,
  };
}

export function avisoDeConexaoExpirando(nome: string, expiraEm: string) {
  return {
    kind: "mcp_conexao_expirando" as const,
    titulo: `A conexão MCP "${nome}" expira em 7 dias`,
    corpo: `A conexão "${nome}" para de funcionar em ${expiraEm.slice(0, 10)}. Se ela ainda é usada, renove em Configurações › Integrações › MCP.`,
  };
}

export function avisoDeConexaoSuspensa(nome: string, recusas: number) {
  return {
    kind: "mcp_conexao_suspensa" as const,
    titulo: `Conexão MCP suspensa: ${nome}`,
    corpo: `A conexão "${nome}" teve ${recusas} recusas de permissão em 10 minutos — sinal de uso indevido — e foi suspensa. Ela fica parada até um admin reativar em Configurações › Integrações › MCP.`,
  };
}
