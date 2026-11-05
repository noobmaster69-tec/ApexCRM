// app/app/campaigns/[id]/edit/_client.test.tsx
/**
 * O AVISO DO TETO NA PRÉVIA DA EDIÇÃO (#2402, #2404).
 *
 * O `truncado` de `buscarCandidatos` só protege o operador se a edição — que é
 * onde uma campanha grande é conferida de novo — também mostrar o recibo. No
 * assistente ele aparece no card "Quem vai receber" do passo Público.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditarCampanha } from "./_client";

const previa = vi.hoisted(() => ({
  data: {
    total: 20_001,
    elegiveis: 500,
    excluidos: 0,
    motivos: {} as Record<string, number>,
    truncado: false,
    amostra: [] as Array<{ nome: string | null; motivo: string | null }>,
    legenda: {} as Record<string, string>,
  },
}));
const estado = vi.hoisted(() => ({ status: "draft", busca: new URLSearchParams("passo=2") }));

const CAMPANHA = {
  id: "c1",
  name: "Reativação de clientes parados",
  status: "draft",
  channel_session_id: "",
  base_legal: "consent",
  lia_ref: null,
  audience_filter: { com_alguma_tag: ["vip"], limite: 100 },
  message_body: "Oi {{nome}}",
  pipeline_id: null,
  stage_id: null,
  agent_id: null,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => estado.busca,
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn(async () => ({ data: previa.data })) },
}));
vi.mock("@/hooks/campanhas/useCampanhas", () => ({
  useCampanha: () => ({ data: { ...CAMPANHA, status: estado.status }, isLoading: false }),
  useModelosDaCampanha: () => ({ data: { modo: "text", modelos: [] }, isSuccess: true, isError: false }),
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
vi.mock("@/hooks/fluxos/useEtiquetasDaConta", () => ({
  useEtiquetasDaConta: () => ({ data: [{ nome: "vip", cor: null }], isLoading: false }),
}));
vi.mock("@/app/app/fluxos/_blocos/useListaRemota", () => ({ useListaRemota: () => ({ itens: [], carregando: false }) }));
vi.mock("@/hooks/contacts/useContactList", () => ({
  useContactList: () => ({ data: { pages: [] }, isLoading: false }),
}));

const AVISO = /bateu o teto de 20\.000 negócios desta prévia/;

function montar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EditarCampanha id="c1" />
    </QueryClientProvider>,
  );
}

describe("edição de campanha", () => {
  beforeEach(() => {
    previa.data.truncado = false;
    estado.status = "draft";
    estado.busca = new URLSearchParams("passo=2");
  });

  it("recorte truncado: a edição mostra o aviso", async () => {
    previa.data.truncado = true;
    montar();
    expect(await screen.findByText(AVISO, undefined, { timeout: 2000 })).toBeInTheDocument();
  });

  it("recorte inteiro: nenhum aviso, e o nome carregado no título", async () => {
    montar();
    expect(await screen.findByDisplayValue("Reativação de clientes parados")).toBeInTheDocument();
    expect(await screen.findByTestId("quem-vai-receber-numero")).toBeInTheDocument();
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });

  it("campanha já preparada não abre o assistente", () => {
    estado.status = "ready";
    montar();
    expect(screen.queryByTestId("assistente-de-campanha")).not.toBeInTheDocument();
    expect(screen.getByText("Voltar para a campanha")).toBeInTheDocument();
  });
});
