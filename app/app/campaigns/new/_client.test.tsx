// app/app/campaigns/new/_client.test.tsx
/**
 * CRIAR CAMPANHA abre o assistente no passo 1, sem nada salvo: o rascunho só
 * nasce quando há nome e número (o salvamento automático cria a campanha).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NovaCampanha } from "./_client";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/campanhas/useCampanhas", () => ({
  useModelosDaCampanha: () => ({ data: undefined, isSuccess: false, isError: false }),
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  useChannelSessions: () => ({ data: [], isLoading: false }),
  channelLabel: (c: { display_name?: string | null }) => c.display_name ?? "Número sem nome",
}));
vi.mock("@/hooks/campanhas/useDestinoDaCampanha", () => ({
  useFunis: () => ({ data: [], isLoading: false }),
  useEtapas: () => ({ data: [], isLoading: false }),
  useAgentesPublicados: () => ({ data: [], isLoading: false }),
  useCrms: () => ({ data: [], isLoading: false }),
  useVariaveisDaOrganizacao: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/app/app/fluxos/_blocos/useListaRemota", () => ({ useListaRemota: () => ({ itens: [], carregando: false }) }));

describe("nova campanha", () => {
  it("abre no passo 1, com o aviso de que nada é enviado antes de iniciar", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NovaCampanha />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Passo 1 de 5")).toBeInTheDocument();
    expect(screen.getByText("Isto cria um rascunho. Nada é enviado antes de você preparar a lista e iniciar.")).toBeInTheDocument();
    expect(screen.getByTestId("titulo-da-campanha")).toHaveAttribute("placeholder", "Nova campanha");
    // Sem nome nem número, nada é gravado.
    expect(api.post).not.toHaveBeenCalled();
  });

  it("sem número conectado, avisa onde conectar", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NovaCampanha />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Nenhum número conectado. Conecte um em Conexões antes de criar a campanha.")).toBeInTheDocument();
  });
});
