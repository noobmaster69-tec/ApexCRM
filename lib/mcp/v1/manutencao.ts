/**
 * A manutenção diária das conexões MCP, pendurada no cron `data-retention`
 * (que todo clone já roda — cron novo pediria linha nova no scheduler):
 *
 *   1. apaga o registro de chamadas com mais de 90 dias, em lotes;
 *   2. avisa os admins, UMA vez, quando uma conexão ativa entra nos últimos 7
 *      dias de validade (`expiry_notified_at` segura a repetição; renovar zera).
 */
import type { createAdminClient } from "@/lib/supabase/admin";

import { avisarAdmins, avisoDeConexaoExpirando } from "./avisos";

export const RETENCAO_DO_REGISTRO_DIAS = 90;
export const DIAS_DE_ANTECEDENCIA_DO_AVISO = 7;
const LOTE = 1_000;
const MAX_LOTES = 20;

export interface ResultadoDaManutencaoMcp {
  chamadas_apagadas: number;
  avisos_de_vencimento: number;
}

export async function manutencaoDoMcp(
  admin: ReturnType<typeof createAdminClient>,
  agora: Date = new Date(),
): Promise<ResultadoDaManutencaoMcp> {
  const corte = new Date(agora.getTime() - RETENCAO_DO_REGISTRO_DIAS * 86_400_000).toISOString();
  let apagadas = 0;
  for (let i = 0; i < MAX_LOTES; i++) {
    const { data, error } = await admin
      .from("mcp_call_log")
      .delete()
      .lt("created_at", corte)
      .select("id")
      .order("id")
      .limit(LOTE);
    if (error) throw new Error(`mcp_call_log: ${error.message}`);
    const n = Array.isArray(data) ? data.length : 0;
    apagadas += n;
    if (n < LOTE) break;
  }

  const limite = new Date(agora.getTime() + DIAS_DE_ANTECEDENCIA_DO_AVISO * 86_400_000).toISOString();
  const { data: vencendo, error } = await admin
    .from("mcp_connections")
    .select("id, organization_id, name, expires_at")
    .is("revoked_at", null)
    .is("expiry_notified_at", null)
    .gt("expires_at", agora.toISOString())
    .lte("expires_at", limite)
    .limit(500);
  if (error) throw new Error(`mcp_connections: ${error.message}`);

  let avisos = 0;
  for (const c of (vencendo ?? []) as Array<{ id: string; organization_id: string; name: string; expires_at: string }>) {
    // Marca ANTES de avisar, só se ninguém marcou: duas rodadas não avisam duas vezes.
    const { data: marcada } = await admin
      .from("mcp_connections")
      .update({ expiry_notified_at: agora.toISOString() })
      .eq("id", c.id)
      .eq("organization_id", c.organization_id)
      .is("expiry_notified_at", null)
      .select("id")
      .maybeSingle();
    if (!marcada) continue;
    await avisarAdmins(admin, { organizationId: c.organization_id, ...avisoDeConexaoExpirando(c.name, c.expires_at) });
    avisos++;
  }
  return { chamadas_apagadas: apagadas, avisos_de_vencimento: avisos };
}
