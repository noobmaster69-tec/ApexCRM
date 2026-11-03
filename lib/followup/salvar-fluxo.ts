/**
 * Salvar as mudanças de um fluxo (o PATCH de `/api/v1/ai/followup-flows/:id`),
 * num lugar só para os dois ingressos: a rota do construtor e a ferramenta MCP
 * `update_flow_draft`. Duas cópias da regra divergiriam no dia em que uma
 * ganhasse uma recusa nova — e a recusa do Início único é justamente a que não
 * pode faltar a quem escreve por fora da tela.
 *
 * Só grava o RASCUNHO e os campos do ponteiro: publicar é outra porta
 * (`/publish`), e nada aqui toca `active_version_id`.
 *
 * Quem chama já validou o patch com `patchFollowupFlowSchema`, resolveu a
 * organização de fonte confiável e audita o efeito.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import { recusaDoInicio } from "@/lib/fluxos/inicio-unico";
import { rascunhoDoFluxo } from "@/lib/followup/rascunho";
import type { patchFollowupFlowSchema } from "@/lib/followup/api-schemas";

export const COLUNAS_DO_FLUXO =
  "id, name, status, active_version_id, draft_graph, handoff_policy, trigger_config, surface, created_at, updated_at";

export type PatchDoFluxo = z.infer<typeof patchFollowupFlowSchema>;

export type ResultadoDoSalvar =
  | { ok: true; fluxo: Record<string, unknown>; mudou: boolean }
  | {
      ok: false;
      motivo: "nao_encontrado" | "sem_inicio" | "inicio_a_mais" | "nome_repetido" | "gatilho_recusado" | "erro";
      detalhe?: string;
    };

export async function salvarFluxo(
  db: SupabaseClient,
  organizationId: string,
  id: string,
  patch: PatchDoFluxo,
): Promise<ResultadoDoSalvar> {
  const { data: existing, error: fetchErr } = await db
    .from("followup_flow_pointers")
    .select("id, surface, draft_graph, active_version_id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (fetchErr) return { ok: false, motivo: "erro", detalhe: fetchErr.message };
  if (!existing) return { ok: false, motivo: "nao_encontrado" };

  // FLUXOS: um Início por fluxo. Recusa o rascunho sem Início ou com um Início
  // a mais do que já tinha; o legado com vários segue salvável (`recusaDoInicio`).
  if (existing.surface === "fluxo" && patch.draft_graph) {
    const anterior = await rascunhoDoFluxo(db, existing, organizationId);
    const recusa = recusaDoInicio(patch.draft_graph, anterior);
    if (recusa) return { ok: false, motivo: recusa === "sem_inicio" ? "sem_inicio" : "inicio_a_mais" };
  }

  if (Object.keys(patch).length === 0) {
    const { data: unchanged, error: reloadErr } = await db
      .from("followup_flow_pointers")
      .select(COLUNAS_DO_FLUXO)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();
    if (reloadErr || !unchanged) return { ok: false, motivo: "erro", detalhe: reloadErr?.message ?? "reload_failed" };
    return { ok: true, fluxo: unchanged as Record<string, unknown>, mudou: false };
  }

  const { data: updated, error: updErr } = await db
    .from("followup_flow_pointers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(COLUNAS_DO_FLUXO)
    .single();

  if (updErr || !updated) {
    if (updErr?.code === "23505") return { ok: false, motivo: "nome_repetido" };
    // O banco recusa gatilho de relógio em roteiro de atendimento (0394,
    // `followup_flow_pointers_roteiro_so_manual`): ele começa na conversa.
    if (updErr?.code === "23514") return { ok: false, motivo: "gatilho_recusado" };
    return { ok: false, motivo: "erro", detalhe: updErr?.message ?? "followup_flow_update_failed" };
  }
  return { ok: true, fluxo: updated as Record<string, unknown>, mudou: true };
}
