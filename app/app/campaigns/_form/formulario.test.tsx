import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn(), busca: new URLSearchParams() }));
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const previa = vi.hoisted(() => ({
  data: {
    total: 120,
    elegiveis: 90,
    excluidos: 30,
    motivos: { sem_consentimento: 20, variavel_ausente: 10 } as Record<string, number>,
    truncado: false,
    amostra: [] as Array<{ nome: string | null; motivo: string | null }>,
    legenda: {} as Record<string, string>,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => nav.busca,
}));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/hooks/contacts/useContactList", () => ({ useContactList: () => ({ data: undefined }) }));
vi.mock("@/hooks/campanhas/useListas", () => ({ useListas: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/campanhas/useCampanhas", () => ({
  useModelosDaCampanha: () => ({ data: { modo: "text", modelos: [] }, isSuccess: true, isError: false }),
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  useChannelSessions: () => ({
    data: [
      { id: "c1", display_name: "Principal", phone_number: "+55 11 90000-0001", status: "WORKING", is_warmup_complete: true, daily_message_limit: 200 },
      { id: "c2", display_name: "Reserva", phone_number: "+55 11 90000-0002", status: "STOPPED", is_warmup_complete: true, daily_message_limit: 200 },
    ],
  }),
  channelLabel: (c: { display_name: string }) => c.display_name,
}));
vi.mock("@/hooks/campanhas/useDestinoDaCampanha", () => ({
  useFunis: () => ({ data: [{ id: "f1", name: "Vendas" }] }),
  useEtapas: () => ({ data: [{ id: "e1", name: "Entrada", is_won: false, is_lost: false }] }),
  useAgentesPublicados: () => ({ data: [] }),
  useCrms: () => ({ data: [{ id: "k1", name: "Comercial", is_default: true }] }),
  useVariaveisDaOrganizacao: () => ({ data: [] }),
}));
vi.mock("@/hooks/fluxos/useEtiquetasDaConta", () => ({
  useEtiquetasDaConta: () => ({ data: [{ nome: "vip", cor: null }, { nome: "frio", cor: null }], isLoading: false }),
}));
vi.mock("@/app/app/fluxos/_blocos/useListaRemota", () => ({ useListaRemota: () => ({ itens: [], carregando: false }) }));

import type { CampanhaDetalhada } from "@/hooks/campanhas/useCampanhas";
import { FormularioDaCampanha } from "./FormularioDaCampanha";
import { corpoDaCampanha, valoresDaCampanha } from "./valores";

const salva = {
  id: "x",
  name: "Reativação",
  status: "draft",
  channel_session_id: "c1",
  channel_session_ids: [],
  base_legal: "consent",
  lia_ref: null,
  message_body: "Oi {primeiro_nome}",
  audience_filter: { com_alguma_tag: ["vip"], funis: ["f1"], etapas: ["e1"], sem_interacao_ha_dias: 30, limite: 200 },
  pipeline_id: "f1",
  stage_id: "e1",
  agent_id: null,
  intervalo_segundos: 120,
  janela_inicio_hora: 9,
  janela_fim_hora: 18,
  cota_quantidade: 10,
  cota_periodo: "dia",
  teto_diario: null,
  teto_horario: null,
} as unknown as CampanhaDetalhada;

function montar(no: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{no}</QueryClientProvider>);
}

beforeEach(() => {
  nav.push.mockReset();
  nav.busca = new URLSearchParams();
  api.get.mockReset();
  api.patch.mockReset().mockResolvedValue({ data: {} });
  api.post.mockReset().mockImplementation(async (url: string) =>
    url === "/api/v1/campaigns/preview" ? { data: previa.data } : url === "/api/v1/campaigns" ? { data: { id: "nova" } } : { data: {} },
  );
  previa.data.truncado = false;
  window.history.replaceState(null, "", "/app/campaigns/new");
});

describe("formulário único de campanha", () => {
  it("editar e salvar DEVOLVE os mesmos filtros, ritmo e números (antes o editar apagava funil/etapa)", () => {
    const corpo = corpoDaCampanha(valoresDaCampanha({ ...salva, channel_session_ids: ["c2"] } as CampanhaDetalhada));
    expect(corpo.audience_filter).toEqual({
      fonte: "crm",
      campos: [],
      entrou_de: null,
      entrou_ate: null,
      com_alguma_tag: ["vip"],
      sem_tags: [],
      sem_interacao_ha_dias: 30,
      funis: ["f1"],
      etapas: ["e1"],
      limite: 200,
    });
    expect(corpo).toMatchObject({
      intervalo_segundos: 120,
      // 9018: a janela volta em minutos (09:00–18:00) e a de horas é zerada.
      janela_inicio_minuto: 540,
      janela_fim_minuto: 1080,
      janela_inicio_hora: null,
      janela_fim_hora: null,
      scheduled_at: null,
      channel_session_ids: ["c2"],
      pipeline_id: "f1",
      stage_id: "e1",
    });
  });
});

describe("assistente de cinco passos", () => {
  it("o título do cabeçalho e o campo Nome são o mesmo valor", () => {
    montar(<FormularioDaCampanha inicial={valoresDaCampanha()} />);
    fireEvent.change(screen.getByTestId("titulo-da-campanha"), { target: { value: "Black Friday" } });
    expect(screen.getByLabelText("Nome da campanha", { selector: "#nome" })).toHaveValue("Black Friday");
    fireEvent.change(screen.getByLabelText("Nome da campanha", { selector: "#nome" }), { target: { value: "Natal" } });
    expect(screen.getByTestId("titulo-da-campanha")).toHaveValue("Natal");
  });

  it("Continuar sem nome: fica no passo 1 e mostra o erro embaixo do campo", async () => {
    montar(<FormularioDaCampanha inicial={valoresDaCampanha()} />);
    fireEvent.click(screen.getByTestId("continuar"));
    expect(await screen.findByText("Dê um nome à campanha.")).toBeInTheDocument();
    expect(screen.getByText("Escolha o número que vai enviar.")).toBeInTheDocument();
    expect(screen.getByText("Passo 1 de 5")).toBeInTheDocument();
  });

  it("número desconectado não é selecionável; o conectado é", () => {
    montar(<FormularioDaCampanha inicial={valoresDaCampanha()} />);
    const reserva = screen.getByTestId("canal-c2");
    expect(reserva).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(reserva);
    expect(reserva).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByTestId("canal-c1"));
    expect(screen.getByTestId("canal-c1")).toHaveAttribute("aria-checked", "true");
  });

  it("passo 1 válido: Continuar leva ao Público e grava o passo na URL", () => {
    montar(<FormularioDaCampanha inicial={{ ...valoresDaCampanha(), nome: "X", canal: "c1" }} />);
    fireEvent.click(screen.getByTestId("continuar"));
    expect(screen.getByText("Passo 2 de 5")).toBeInTheDocument();
    expect(window.location.search).toBe("?passo=2");
  });

  it("abre no passo da URL e a linha do tempo marca os passos prontos", () => {
    nav.busca = new URLSearchParams("passo=4");
    montar(<FormularioDaCampanha campanhaId="x" inicial={valoresDaCampanha(salva)} />);
    expect(screen.getByText("Passo 4 de 5")).toBeInTheDocument();
    expect(screen.getByTestId("passo-1")).toHaveAttribute("data-estado", "pronto");
    expect(screen.getByTestId("passo-4")).toHaveAttribute("data-estado", "atual");
    expect(screen.getByText("5 de 5 prontos")).toBeInTheDocument();
  });

  it("Quem vai receber conta sozinho, com o funil de elegibilidade", async () => {
    nav.busca = new URLSearchParams("passo=2");
    montar(<FormularioDaCampanha campanhaId="x" inicial={valoresDaCampanha(salva)} />);
    const card = screen.getByTestId("quem-vai-receber");
    await waitFor(() => expect(within(card).getByTestId("quem-vai-receber-numero")).toHaveTextContent("90"), {
      timeout: 2000,
    });
    expect(within(card).getByText("Sem {primeiro_nome}")).toBeInTheDocument();
    expect(within(card).getByText("−20")).toBeInTheDocument();
    const pedido = api.post.mock.calls.find(([url]) => url === "/api/v1/campaigns/preview")![1];
    expect(pedido).toMatchObject({ base_legal: "consent", message_body: "Oi {primeiro_nome}" });
  });

  it("recorte truncado: o aviso do teto aparece no card", async () => {
    previa.data.truncado = true;
    nav.busca = new URLSearchParams("passo=2");
    montar(<FormularioDaCampanha campanhaId="x" inicial={valoresDaCampanha(salva)} />);
    expect(await screen.findByText(/bateu o teto de 20\.000 negócios desta prévia/, undefined, { timeout: 2000 })).toBeInTheDocument();
  });

  it("etiqueta escolhida no positivo fica desabilitada no negativo", () => {
    nav.busca = new URLSearchParams("passo=2");
    montar(<FormularioDaCampanha campanhaId="x" inicial={valoresDaCampanha(salva)} />);
    fireEvent.click(document.getElementById("sem-tags")!);
    const vip = screen.getAllByRole("button", { name: /vip/ }).find((b) => b.classList.contains("cw-chip-tag"))!;
    expect(vip).toBeDisabled();
  });

  it("salvamento automático: o primeiro grava com POST e a tela vira a de editar", async () => {
    montar(<FormularioDaCampanha inicial={valoresDaCampanha()} />);
    fireEvent.change(screen.getByTestId("titulo-da-campanha"), { target: { value: "Reativação" } });
    fireEvent.click(screen.getByTestId("canal-c1"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/campaigns", expect.objectContaining({ name: "Reativação" })), {
      timeout: 2000,
    });
    await waitFor(() => expect(window.location.pathname).toBe("/app/campaigns/nova/edit"));
    expect(await screen.findByText("Rascunho salvo agora")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("titulo-da-campanha"), { target: { value: "Reativação 2" } });
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/v1/campaigns/nova", expect.objectContaining({ name: "Reativação 2" })), {
      timeout: 2000,
    });
  });

  it("editar não regrava o que acabou de carregar", async () => {
    montar(<FormularioDaCampanha campanhaId="x" inicial={valoresDaCampanha(salva)} />);
    await act(() => new Promise((r) => setTimeout(r, 1000)));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("Salvar rascunho no passo 5 grava o corpo inteiro e abre a campanha", async () => {
    nav.busca = new URLSearchParams("passo=5");
    montar(<FormularioDaCampanha campanhaId="x" inicial={valoresDaCampanha(salva)} />);
    expect(screen.getByTestId("resumo-do-envio")).toHaveTextContent("10 contatos por dia, entre 09:00 e 18:00");
    fireEvent.click(screen.getByTestId("salvar-campanha"));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/app/campaigns/x"));
    expect(api.patch).toHaveBeenCalledWith(
      "/api/v1/campaigns/x",
      expect.objectContaining({ name: "Reativação", message_body: "Oi {primeiro_nome}", cota_quantidade: 10 }),
    );
  });

  it("Salvar rascunho com passo incompleto vai ao passo com erro", () => {
    nav.busca = new URLSearchParams("passo=5");
    montar(<FormularioDaCampanha campanhaId="x" inicial={{ ...valoresDaCampanha(salva), texto: "" }} />);
    fireEvent.click(screen.getByTestId("salvar-campanha"));
    expect(screen.getByText("Passo 3 de 5")).toBeInTheDocument();
    expect(screen.getByText("Escreva a mensagem.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("Mover no funil desligado apaga funil e etapa ao salvar", async () => {
    nav.busca = new URLSearchParams("passo=4");
    montar(<FormularioDaCampanha campanhaId="x" inicial={valoresDaCampanha(salva)} />);
    fireEvent.click(screen.getByTestId("mover-no-funil"));
    expect(screen.getByText("Sem mudança no funil")).toBeInTheDocument();
    await waitFor(
      () => expect(api.patch).toHaveBeenCalledWith("/api/v1/campaigns/x", expect.objectContaining({ pipeline_id: null, stage_id: null })),
      { timeout: 2000 },
    );
  });
});
