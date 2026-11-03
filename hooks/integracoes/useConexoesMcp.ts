"use client";
/**
 * As conexões MCP da organização (Configurações › Integrações › MCP). Só admin
 * — as rotas recusam os outros papéis.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

export type StatusDaConexaoMcp = "ativa" | "suspensa" | "expirada" | "revogada";

export interface ConexaoMcp {
  id: string;
  name: string;
  tool: "claude_code" | "claude_desktop" | "cursor" | "outra";
  profile: "somente_leitura" | "operacao_crm" | "construtor_fluxos" | "personalizado";
  scopes: string[];
  show_pii: boolean;
  allowed_ips: string[];
  auth_kind: "token" | "oauth";
  token_hint: string | null;
  created_by_user_id: string;
  created_by_name?: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  status: StatusDaConexaoMcp;
}

export interface ChamadaMcp {
  id: string;
  tool: string;
  result: "ok" | "negado" | "erro";
  reason: string | null;
  records: number;
  duration_ms: number;
  ip: string | null;
  created_at: string;
}

export interface PainelMcp {
  enabled: boolean;
  server_url: string;
  connections: ConexaoMcp[];
}

export interface NovaConexaoMcp {
  name: string;
  tool: ConexaoMcp["tool"];
  profile: ConexaoMcp["profile"];
  scopes: string[];
  validity_days: number;
  allowed_ips: string[];
  show_pii: boolean;
}

const CHAVE = ["mcp-conexoes"];

export function usePainelMcp() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: async () => apiClient.get<{ data: PainelMcp }>("/api/v1/settings/mcp"),
    staleTime: 15_000,
  });
}

export function useDetalheMcp(id: string | null) {
  return useQuery({
    queryKey: [...CHAVE, id],
    enabled: id !== null,
    queryFn: async () =>
      apiClient.get<{ data: { connection: ConexaoMcp; can: string[]; cannot: string[]; calls: ChamadaMcp[] } }>(
        `/api/v1/settings/mcp/conexoes/${id}`,
      ),
  });
}

export function useInterruptorMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      apiClient.patch<{ data: { enabled: boolean } }>("/api/v1/settings/mcp", { enabled }),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useCriarConexaoMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaConexaoMcp) =>
      apiClient.post<{ data: { connection: ConexaoMcp; token?: string; server_url: string } }>(
        "/api/v1/settings/mcp/conexoes",
        input,
      ),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useAcaoNaConexaoMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, acao }: { id: string; acao: "revogar" | "renovar" | "reativar" }) =>
      apiClient.post<{ data: { connection: ConexaoMcp; token?: string } }>(
        `/api/v1/settings/mcp/conexoes/${id}/${acao}`,
        {},
      ),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
