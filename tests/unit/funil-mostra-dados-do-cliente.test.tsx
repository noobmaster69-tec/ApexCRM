/**
 * O FUNIL MOSTRA OS DADOS DO CLIENTE — telefone, e-mail e links (Instagram, site,
 * Google Meu Negócio…) nas abas do dossiê. O card compacto (estilo Leona) mostra
 * só o telefone; e-mail e links saíram dele junto com o `ContatoNoCard`.
 *
 * Garantias que um teste só de "renderiza" não daria:
 *
 *  1. salvar links troca o `custom_fields` INTEIRO (o PATCH substitui o objeto),
 *     então o que não é link tem que ir junto — perder um campo personalizado da
 *     organização ao salvar um Instagram seria o pior tipo de defeito: silencioso;
 *  2. o card lê os dados do QUADRO, não do contato: salvar sem reler o quadro
 *     parece "não fez nada" onde a pessoa mais olha.
 *
 * Mais a fiação, lida da fonte (a mesma técnica dos irmãos deste diretório): a
 * rota lê os dados do contato na MESMA consulta dos marcadores, o card mostra o
 * telefone e o dossiê renderiza as abas.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useContact = vi.hoisted(() => vi.fn());
const useContatosRelacionados = vi.hoisted(() => vi.fn());
const adicionarParticipante = vi.hoisted(() => vi.fn());
const removerParticipante = vi.hoisted(() => vi.fn());
const useContactList = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/contacts/useContact", () => ({ useContact }));
vi.mock("@/hooks/contacts/useContactList", () => ({ useContactList }));
// O ESCRITOR do vínculo (#3083 F1): o dossiê ganhou adicionar, remover e dar
// papel. Aqui os dois hooks entram dublados — o que este arquivo prova é a
// TELA (o controle existe, manda o que deve e some quando não há âncora).
vi.mock("@/hooks/leads/useContatosRelacionados", () => ({ useContatosRelacionados }));
vi.mock("@/hooks/leads/useParticipantesDoNegocio", () => ({
  useAdicionarParticipante: () => ({ mutateAsync: adicionarParticipante, isPending: false }),
  useRemoverParticipante: () => ({ mutate: removerParticipante, isPending: false }),
}));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/hooks/kanban/useBoard", () => ({
  chaveDoQuadro: (pipelineId: string | null) => ["kanban-board", pipelineId],
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { ContatoDoNegocio } from "@/components/kanban/ContatoDoNegocio";

const RAIZ = process.cwd();
const fonte = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8");

function comQuery(ui: ReactNode, cliente = new QueryClient()) {
  return { cliente, ...render(<QueryClientProvider client={cliente}>{ui}</QueryClientProvider>) };
}

const CONTATO = {
  id: "c-1",
  name: "Ana Souza",
  display_name: null,
  email: "ana@exemplo.com",
  phone_number: "+5511999998888",
  updated_at: "2026-09-19T10:00:00Z",
  custom_fields: { cor_favorita: "azul", link_instagram: "instagram.com/loja" } as Record<string, unknown>,
};

/** O candidato a PARTICIPANTE que a busca do dossiê oferece (#3083 F1). */
const OUTRO = {
  id: "c-2",
  name: "João Souza",
  display_name: null,
  email: null,
  phone_number: null,
  updated_at: "2026-09-19T10:00:00Z",
  custom_fields: {} as Record<string, unknown>,
};

beforeEach(() => {
  vi.clearAllMocks();
  useContact.mockReturnValue({ data: { data: CONTATO }, isLoading: false, isError: false });
  mutateAsync.mockResolvedValue({ data: CONTATO });
  // Sem `leadId` a lista não consulta nada; quem passa a âncora devolve o que
  // cada teste montar.
  useContatosRelacionados.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
  useContactList.mockReturnValue({ data: { pages: [{ data: [OUTRO] }] }, isLoading: false });
  adicionarParticipante.mockResolvedValue({ data: {} });
});

afterEach(cleanup);

describe("ContatoDoNegocio — as abas do dossiê", () => {
  it("negócio sem contato vinculado avisa, sem consultar nada", () => {
    comQuery(<ContatoDoNegocio contactId={null} pipelineId="p-1" />);

    expect(screen.getByText("Este negócio não tem contato vinculado.")).toBeInTheDocument();
    expect(useContact).not.toHaveBeenCalled();
  });

  it("aba Dados: nome, telefone com atalho do WhatsApp, e-mail e a ficha completa", () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);

    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("+5511999998888")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir no WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511999998888",
    );
    expect(screen.getByRole("link", { name: "ana@exemplo.com" })).toHaveAttribute(
      "href",
      "mailto:ana@exemplo.com",
    );
    expect(screen.getByRole("link", { name: "Ver ficha completa do contato" })).toHaveAttribute(
      "href",
      "/app/contacts/c-1",
    );
  });

  function abrirAbaDeLinks() {
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Links" }), { button: 0 });
    return screen.getByTestId("formulario-de-links");
  }

  it("aba Links: vem preenchida com o que está gravado no contato", () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);
    const formulario = abrirAbaDeLinks();

    expect(within(formulario).getByLabelText("Instagram")).toHaveValue("instagram.com/loja");
    expect(within(formulario).getByLabelText("Site")).toHaveValue("");
    // todos os tipos do catálogo aparecem, inclusive "Google Meu Negócio" e "Outro"
    expect(within(formulario).getByLabelText("Google Meu Negócio")).toBeInTheDocument();
    expect(within(formulario).getByLabelText("Outro")).toBeInTheDocument();
  });

  it("⭐ salvar manda o custom_fields COMPLETO e relê o quadro do funil", async () => {
    const { cliente } = comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);
    const invalidar = vi.spyOn(cliente, "invalidateQueries");
    const formulario = abrirAbaDeLinks();

    fireEvent.change(within(formulario).getByLabelText("Site"), {
      target: { value: "exemplo.com.br" },
    });
    fireEvent.click(within(formulario).getByRole("button", { name: "Salvar links" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      custom_fields: {
        cor_favorita: "azul", // o campo que NÃO é link sobrevive ao PATCH
        link_instagram: "instagram.com/loja",
        link_site: "exemplo.com.br",
      },
    });
    await waitFor(() =>
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ["kanban-board", "p-1"] }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Links salvos."));
  });

  it("apagar o texto de um link remove a chave, em vez de gravar string vazia", async () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);
    const formulario = abrirAbaDeLinks();

    fireEvent.change(within(formulario).getByLabelText("Instagram"), { target: { value: "" } });
    fireEvent.click(within(formulario).getByRole("button", { name: "Salvar links" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ custom_fields: { cor_favorita: "azul" } });
  });

  it("⭐ endereço inválido bloqueia o salvamento e marca o campo", async () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);
    const formulario = abrirAbaDeLinks();

    fireEvent.change(within(formulario).getByLabelText("Site"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(within(formulario).getByRole("button", { name: "Salvar links" }));

    expect(await within(formulario).findByText("Endereço inválido.")).toBeInTheDocument();
    expect(within(formulario).getByLabelText("Site")).toHaveAttribute("aria-invalid", "true");
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("enquanto o contato carrega, mostra o estado de carregamento", () => {
    useContact.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);

    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("falha ao carregar o contato é dita, não silenciada", () => {
    useContact.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);

    expect(screen.getByText("Não consegui carregar o contato.")).toBeInTheDocument();
  });
});

describe("ContatoDoNegocio — o escritor das pessoas relacionadas (a #3083 F1)", () => {
  it("⭐ lista vazia NÃO some: ela diz que está vazia e oferece o controle de adicionar", () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" leadId="l-1" />);

    // A seção existir com a lista vazia é o ponto: se ela devolvesse null (como
    // na versão só-leitora), o único controle que ADICIONA a primeira pessoa
    // ficaria inalcançável justo nos negócios que mais precisam dele.
    expect(screen.getByTestId("pessoas-relacionadas")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma pessoa relacionada ainda.")).toBeInTheDocument();
    expect(screen.getByTestId("adicionar-participante")).toBeInTheDocument();
  });

  it("sem a âncora do negócio, o bloco inteiro não renderiza — e ninguém consulta nada", () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);

    expect(useContatosRelacionados).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId("pessoas-relacionadas")).toBeNull();
    expect(screen.queryByTestId("adicionar-participante")).toBeNull();
    // A busca só existe com o formulário aberto: sem âncora, nenhuma chamada.
    expect(useContactList).not.toHaveBeenCalled();
  });

  it("⭐ adicionar manda o POST com o papel digitado e relê a lista", async () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" leadId="l-1" />);

    // Fechado, o formulário não existe: a lista de contatos só é buscada quando
    // alguém abre o controle.
    expect(screen.queryByTestId("formulario-de-participante")).toBeNull();
    fireEvent.click(screen.getByTestId("adicionar-participante"));

    const form = screen.getByTestId("formulario-de-participante");
    expect(within(form).getByText("João Souza")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Papel"), { target: { value: "Pagante" } });
    fireEvent.click(within(form).getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(adicionarParticipante).toHaveBeenCalledWith({ contact_id: "c-2", papel: "Pagante" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Participante adicionado."));
    // Fechou: o dossiê volta ao estado de leitura depois do gesto.
    await waitFor(() => expect(screen.queryByTestId("formulario-de-participante")).toBeNull());
  });

  it("papel em branco vai como null — o servidor limpa o papel sem tirar a pessoa", async () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" leadId="l-1" />);
    fireEvent.click(screen.getByTestId("adicionar-participante"));
    const form = screen.getByTestId("formulario-de-participante");

    fireEvent.click(within(form).getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(adicionarParticipante).toHaveBeenCalledWith({ contact_id: "c-2", papel: null }),
    );
  });

  it("⭐ remover manda o DELETE do contato daquela linha", () => {
    useContatosRelacionados.mockReturnValue({
      data: {
        data: [{ contact_id: "c-2", nome: "João Souza", papel: "Pagante", anonimizado: false }],
      },
      isLoading: false,
      isError: false,
    });
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" leadId="l-1" />);

    expect(screen.getByText("João Souza")).toBeInTheDocument();
    expect(screen.getByText("(Pagante)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover João Souza" }));

    expect(removerParticipante).toHaveBeenCalledWith(
      "c-2",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    // A confirmação só sai depois que o servidor removeu: é o onSuccess da
    // mutação que a dispara, não o clique.
    expect(toast.success).not.toHaveBeenCalled();
    const [, opcoes] = removerParticipante.mock.calls[0] ?? [];
    opcoes?.onSuccess();
    expect(toast.success).toHaveBeenCalledWith("Participante removido.");
  });
});

describe("a fiação — quem usa a regra a chama", () => {
  it("⭐ a rota lê o dado do contato na MESMA consulta dos marcadores e o aplica nos leads", () => {
    const rota = fonte("app/api/v1/pipelines/[id]/board/route.ts");
    const inicio = rota.indexOf("async function withMarcadoresDoContato");
    const fim = rota.indexOf("async function withNextActions");
    expect(inicio, "a etapa dos marcadores sumiu da rota").toBeGreaterThan(-1);
    const etapa = rota.slice(inicio, fim);

    // `display_name` e `avatar_storage_path`: a foto e o nome do WhatsApp do
    // topo do card (estilo Kommo) saem desta MESMA leitura.
    expect(etapa, "a consulta não traz telefone, e-mail, custom_fields, nome do WhatsApp e foto").toMatch(
      /\.select\(\s*"id, tags, phone_number, email, custom_fields, is_anonymized, display_name, avatar_storage_path"\s*\)/,
    );
    expect(etapa, "anexarDadosDoContato não é chamada na etapa").toMatch(
      /anexarDadosDoContato\(\s*leadsDoQuadro,\s*linhas\s*\)/,
    );
    // sem etapa nova na cadeia: `funil-filtro-de-tag-le-as-duas-caixas` e
    // `kanban-atalho-conversa` vigiam withConversas → withMarcadoresDoContato → resposta
    expect(rota).toMatch(/leads:\s*leadsComMarcadores\.leads/);
  });

  it("o card mostra o telefone e o dossiê renderiza as abas", () => {
    expect(fonte("components/kanban/KanbanCard.tsx")).toMatch(/phoneForDisplay\(lead\.contact_phone\)/);
    expect(fonte("components/kanban/LeadDossier.tsx")).toMatch(
      /<ContatoDoNegocio\s+contactId=\{lead\.contact_id\}\s+pipelineId=\{pipelineId\}/,
    );
  });
});
