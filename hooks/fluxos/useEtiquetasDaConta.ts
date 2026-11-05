"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { apiClient } from "@/lib/api/client";
import { ROLE_RANK } from "@/lib/auth/types";
import { chaveDeBusca, juntarEtiquetas, type EtiquetaDaConta } from "@/lib/tags/busca-de-etiqueta";
import { invalidarCoresDasEtiquetas } from "@/components/tags/CoresDasEtiquetas";

const CHAVE = "fluxo-etiquetas-da-conta";
const CHAVE_EXCLUIDAS = "fluxo-etiquetas-excluidas";

/**
 * Etiquetas da conta para o seletor do bloco Etiquetas: as em uso nos contatos
 * (`GET /api/v1/contact-tags`, a mesma fonte do editor do Inbox) mais as do
 * vocabulário com cor (`GET /api/v1/tags/cores`). As duas rotas recortam pela
 * organização da sessão — nada vem do pedido. Fica em cache durante a sessão
 * do editor e é recarregada depois de criar ou excluir.
 */
export function useEtiquetasDaConta() {
  const { activeOrg } = useAuth();
  const orgId = activeOrg?.orgId ?? null;
  return useQuery({
    queryKey: [CHAVE, orgId],
    enabled: !!orgId,
    staleTime: Infinity,
    queryFn: async (): Promise<EtiquetaDaConta[]> => {
      const [nomes, cores] = await Promise.all([
        apiClient.get<{ data: string[] }>("/api/v1/contact-tags").then((r) => r.data),
        apiClient
          .get<{ data: { tag: string; cor: string }[] }>("/api/v1/tags/cores")
          .then((r) => r.data)
          .catch(() => []),
      ]);
      return juntarEtiquetas(nomes, cores);
    },
  });
}

/**
 * Etiquetas excluídas da conta nesta sessão do editor. A plataforma não guarda
 * registro de etiqueta excluída (ela some das linhas e do vocabulário), então é
 * daqui que o chip riscado e o aviso de publicação sabem o que foi apagado.
 */
export function useEtiquetasExcluidas(): string[] {
  const { activeOrg } = useAuth();
  const { data } = useQuery({
    queryKey: [CHAVE_EXCLUIDAS, activeOrg?.orgId ?? null],
    queryFn: () => [] as string[],
    initialData: [] as string[],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data;
}

export function etiquetasExcluidas(queryClient: QueryClient, orgId: string | null): string[] {
  return queryClient.getQueryData<string[]>([CHAVE_EXCLUIDAS, orgId]) ?? [];
}

/** Quem pode excluir etiqueta da conta: a mesma régua da rota do vocabulário (manager). */
export function usePodeGerenciarEtiquetas(): boolean {
  const { user, activeOrg } = useAuth();
  if (user.is_platform_admin && !user.support) return true;
  if (!activeOrg) return false;
  return ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
}

export function useAtualizarEtiquetasDaConta() {
  const queryClient = useQueryClient();
  const { activeOrg } = useAuth();
  const orgId = activeOrg?.orgId ?? null;
  return {
    /** Depois de criar: a etiqueta nova entra na lista já, sem esperar o servidor. */
    criada(nome: string) {
      queryClient.setQueryData<EtiquetaDaConta[]>([CHAVE, orgId], (lista) =>
        juntarEtiquetas(
          [...(lista ?? []).map((e) => e.nome), nome],
          (lista ?? []).filter((e) => e.cor).map((e) => ({ tag: e.nome, cor: e.cor })),
        ),
      );
      queryClient.setQueryData<string[]>([CHAVE_EXCLUIDAS, orgId], (lista) =>
        (lista ?? []).filter((e) => chaveDeBusca(e) !== chaveDeBusca(nome)),
      );
    },
    /** Depois de excluir: some da lista, entra nas excluídas e o resto da tela recarrega. */
    excluida(nome: string) {
      queryClient.setQueryData<EtiquetaDaConta[]>([CHAVE, orgId], (lista) =>
        (lista ?? []).filter((e) => chaveDeBusca(e.nome) !== chaveDeBusca(nome)),
      );
      queryClient.setQueryData<string[]>([CHAVE_EXCLUIDAS, orgId], (lista) => [...(lista ?? []), nome]);
      void queryClient.invalidateQueries({ queryKey: [CHAVE, orgId] });
      void queryClient.invalidateQueries({ queryKey: ["contact-tag-vocabulary"] });
      invalidarCoresDasEtiquetas(queryClient);
    },
  };
}
