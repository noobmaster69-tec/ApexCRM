import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { FlowNode } from "@/lib/followup/graph-schema";
import { CanvasDoFluxoContext, type CanvasDoFluxo } from "./canvas-do-fluxo";
import { FluxoNode } from "./FluxoNode";
import { PreviaDoBloco, itensDaPrevia, linhaDoItem, rodapeDoBloco } from "./previas";

const t = (s: string) => s;

function comCanvas(ui: ReactNode, extra: Partial<CanvasDoFluxo> = {}) {
  const valor: CanvasDoFluxo = {
    editar: vi.fn(),
    duplicar: vi.fn(),
    excluir: vi.fn(),
    distribuicoes: {},
    nomeDoFunil: () => "Vendas",
    nomeDoFluxo: () => "Boas-vindas",
    ...extra,
  };
  render(
    <ReactFlowProvider>
      <CanvasDoFluxoContext.Provider value={valor}>{ui}</CanvasDoFluxoContext.Provider>
    </ReactFlowProvider>,
  );
  return valor;
}

describe("prévia da Mensagem", () => {
  it("cada tipo de item vira uma linha, sem emoji", () => {
    expect(linhaDoItem({ id: "a", tipo: "texto", texto: "Oi!" }, t)).toBe("Oi!");
    expect(linhaDoItem({ id: "b", tipo: "intervalo", modo: "aleatorio", min_segundos: 6, max_segundos: 15 }, t)).toBe(
      "Pausa 6–15 s",
    );
    expect(linhaDoItem({ id: "c", tipo: "intervalo", modo: "fixo", segundos: 3 }, t)).toBe("Pausa 3 s");
    expect(linhaDoItem({ id: "d", tipo: "imagem", midia: { url: "https://x.y/a.png" } }, t)).toBe("Imagem");
    expect(linhaDoItem({ id: "e", tipo: "video", midia: { url: "https://x.y/a.mp4" }, legenda: "Demo" }, t)).toBe("Demo");
    expect(linhaDoItem({ id: "f", tipo: "audio", midia: { url: "https://x.y/a.ogg" } }, t)).toBe("Áudio");
  });

  it("variáveis destacadas e nenhum emoji no cartão", () => {
    const config = { itens: [{ id: "t1", tipo: "texto", texto: "Oi {nome}, tudo bem?" }] } as FlowNode["config"];
    comCanvas(<PreviaDoBloco tipo="mensagem" config={config} />);
    const variavel = screen.getByText("{nome}");
    expect(variavel).toHaveClass("fx-var");
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("o limite de 4 linhas vale para as condições do Condicional", () => {
    expect(itensDaPrevia([1, 2, 3, 4, 5, 6])).toEqual({ visiveis: [1, 2, 3, 4], resto: 2 });
    expect(itensDaPrevia([1, 2])).toEqual({ visiveis: [1, 2], resto: 0 });
  });
});

/**
 * Rodada 1 do editor de fluxos, item 2: o cartão da Mensagem mostra TODO o
 * conteúdo enviado — sem "+ N itens", sem "ver mais", sem pausa nem
 * "digitando" — e a imagem aparece em miniatura.
 */
describe("prévia da Mensagem — tudo o que sai, na ordem", () => {
  const PNG = "https://cdn.exemplo.com/fotos/produto%20azul.png";

  it("⭐ mostra todas as mensagens, na ordem, e nenhuma pausa nem digitando", () => {
    const config = {
      itens: [
        { id: "t0", tipo: "texto", texto: "linha 0" },
        { id: "p1", tipo: "intervalo", modo: "fixo", segundos: 3 },
        ...Array.from({ length: 6 }, (_, i) => ({ id: `t${i + 1}`, tipo: "texto", texto: `linha ${i + 1}`, typing_delay_seconds: 9 })),
      ],
    } as FlowNode["config"];
    comCanvas(
      <FluxoNode id="m1" tipo="mensagem" title="Mensagem" showTarget={false} showSource={false}>
        <PreviaDoBloco tipo="mensagem" config={config} />
      </FluxoNode>,
    );
    const textos = Array.from(document.querySelectorAll(".fx-row__text")).map((el) => el.textContent);
    expect(textos).toEqual(["linha 0", "linha 1", "linha 2", "linha 3", "linha 4", "linha 5", "linha 6"]);
    expect(document.body.textContent).not.toMatch(/Pausa|Digitando|\+ \d+ ite|ver mais/);
    expect(screen.queryByTestId("ver-mais-m1")).toBeNull();
    // Sem teto de altura nem corte no corpo do cartão.
    expect(screen.getByTestId("previa-m1").className).not.toMatch(/max-h|overflow-hidden/);
  });

  it("texto inteiro, com as quebras de linha e sem reticências", () => {
    const longo = `Primeira linha\nSegunda linha ${"bem comprida ".repeat(30)}fim.`;
    comCanvas(<PreviaDoBloco tipo="mensagem" config={{ itens: [{ id: "t", tipo: "texto", texto: longo }] } as FlowNode["config"]} />);
    const p = document.querySelector(".fx-row__text")!;
    expect(p.textContent).toBe(longo);
    expect(p).toHaveClass("fx-row__text--inteiro");
  });

  it("⭐ imagem por link: miniatura, nome do arquivo ao lado e legenda embaixo", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="mensagem"
        config={{ itens: [{ id: "i1", tipo: "imagem", midia: { url: PNG }, legenda: "Olha o {produto}" }] } as FlowNode["config"]}
      />,
    );
    const mini = screen.getByTestId("miniatura-i1");
    expect(mini).toHaveAttribute("data-miniatura", "imagem");
    expect(mini.querySelector("img")).toHaveAttribute("src", PNG);
    expect(mini.style.width).toBe("56px");
    expect(screen.getByText("produto azul.png")).toHaveClass("fx-media__name");
    expect(screen.getByTestId("previa-item-i1")).toHaveTextContent("Olha o {produto}");
  });

  it("⭐ imagem que não carrega volta ao ícone, sem quebrar o cartão", () => {
    comCanvas(<PreviaDoBloco tipo="mensagem" config={{ itens: [{ id: "i1", tipo: "imagem", midia: { url: PNG } }] } as FlowNode["config"]} />);
    fireEvent.error(screen.getByTestId("miniatura-i1").querySelector("img")!);
    expect(screen.getByTestId("miniatura-i1")).toHaveAttribute("data-miniatura", "icone");
    expect(screen.getByTestId("miniatura-i1").querySelector("img")).toBeNull();
    expect(screen.getByTestId("miniatura-i1").querySelector("svg")).not.toBeNull();
  });

  it("imagem enviada: pede o link assinado do Storage pelo fluxo aberto", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { url: "https://storage.local/assinado.png" } })));
    vi.stubGlobal("fetch", fetchMock);
    const caminho = "org-1/fluxos/fluxo-1/abc.png";
    comCanvas(
      <PreviaDoBloco
        tipo="mensagem"
        config={{ itens: [{ id: "i2", tipo: "imagem", midia: { storage_path: caminho, nome_arquivo: "2.png" } }] } as FlowNode["config"]}
      />,
      { flowId: "fluxo-1" },
    );
    expect(screen.getByText("2.png")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("miniatura-i2").querySelector("img")).toHaveAttribute("src", "https://storage.local/assinado.png"));
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/fluxos/fluxo-1/midia?path=${encodeURIComponent(caminho)}`);
    vi.unstubAllGlobals();
  });

  it("áudio, vídeo e arquivo: ícone do tipo e nome do arquivo, sem miniatura", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="mensagem"
        config={
          {
            itens: [
              { id: "a", tipo: "audio", midia: { storage_path: "o/fluxos/f/x.ogg", nome_arquivo: "recado.ogg" } },
              { id: "v", tipo: "video", midia: { url: "https://x.y/demo.mp4" } },
              { id: "d", tipo: "arquivo", midia: { storage_path: "o/fluxos/f/y.pdf", nome_arquivo: "contrato.pdf" } },
            ],
          } as FlowNode["config"]
        }
      />,
      { flowId: "f" },
    );
    expect(screen.getByText("recado.ogg")).toBeInTheDocument();
    expect(screen.getByText("demo.mp4")).toBeInTheDocument();
    expect(screen.getByText("contrato.pdf")).toBeInTheDocument();
    expect(document.querySelector("[data-miniatura]")).toBeNull();
  });
});

describe("prévias dos outros blocos", () => {
  it("Etiquetas: chips e a operação", () => {
    comCanvas(<PreviaDoBloco tipo="etiquetas" config={{ operacao: "adicionar", etiquetas: ["vip", "lead"] } as FlowNode["config"]} />);
    expect(screen.getByText("vip")).toHaveClass("fx-chip");
    expect(screen.getByText("Adicionar ao contato")).toBeInTheDocument();
    expect(rodapeDoBloco("etiquetas", { operacao: "adicionar", etiquetas: ["x"] } as FlowNode["config"], t)).toBe(
      "Adicionar etiquetas ao cliente",
    );
    expect(rodapeDoBloco("etiquetas", { operacao: "remover", etiquetas: ["x"] } as FlowNode["config"], t)).toBe(
      "Remover etiquetas",
    );
  });

  it("Kanban: campo com a ação e o funil", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="kanban"
        config={{ acao: "adicionar", pipeline_id: "11111111-1111-4111-8111-111111111111" } as FlowNode["config"]}
      />,
    );
    expect(screen.getByText("Adicionar card")).toHaveClass("fx-field__label");
    expect(screen.getByText("Vendas")).toBeInTheDocument();
  });

  it("Condicional: a regra e cada condição", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="condicional"
        config={
          {
            regra: "qualquer",
            condicoes: [{ id: "c1", campo: { tipo: "etiqueta" }, operador: "contem", valor: "vip" }],
          } as FlowNode["config"]
        }
      />,
    );
    expect(screen.getByText("SE qualquer")).toBeInTheDocument();
    expect(screen.getByText("Etiqueta contém vip")).toBeInTheDocument();
  });

  it("Aguardar resposta: o texto e o prazo", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="aguardar_resposta"
        config={{ sem_limite: false, tempo: { valor: 2, unidade: "horas" }, responder_citando: false } as FlowNode["config"]}
      />,
    );
    expect(screen.getByText("Aguardar pela resposta do cliente")).toBeInTheDocument();
    expect(screen.getByText("Após 2 h")).toBeInTheDocument();
  });

  it("Conexão de fluxo: o nome do fluxo de destino", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="conexao_fluxo"
        config={{ fluxo_id: "11111111-1111-4111-8111-111111111111", retornar: false } as FlowNode["config"]}
      />,
    );
    expect(screen.getByText("Ir para o fluxo")).toBeInTheDocument();
    expect(screen.getByText("Boas-vindas")).toBeInTheDocument();
  });
});

describe("FluxoNode — o cartão genérico", () => {
  it("cabeçalho com título e categoria; ações na barra flutuante ligadas ao canvas", async () => {
    const user = userEvent.setup({ delay: null });
    const canvas = comCanvas(
      <FluxoNode id="n1" tipo="mensagem" title="Saudação A" showTarget={false} showSource={false}>
        <p>corpo</p>
      </FluxoNode>,
    );
    expect(screen.getByText("Saudação A")).toBeInTheDocument();
    expect(screen.getByText("Enviar")).toBeInTheDocument();
    expect(screen.getByTestId("node-card-n1").style.getPropertyValue("--c")).toBe("oklch(0.66 0.155 262)");
    expect(screen.getByTestId("acoes-n1")).toContainElement(screen.getByTestId("bloco-editar-n1"));
    await user.click(screen.getByTestId("bloco-editar-n1"));
    await user.click(screen.getByTestId("bloco-duplicar-n1"));
    await user.click(screen.getByTestId("bloco-excluir-n1"));
    expect(canvas.editar).toHaveBeenCalledWith("n1");
    expect(canvas.duplicar).toHaveBeenCalledWith("n1");
    expect(canvas.excluir).toHaveBeenCalledWith("n1");
  });

  it("Fim: só cabeçalho, sem corpo", () => {
    comCanvas(<FluxoNode id="f1" tipo="end" title="Fim" showTarget={false} showSource={false} />);
    expect(screen.queryByTestId("previa-f1")).toBeNull();
    expect(screen.getByTestId("node-card-f1")).toHaveAttribute("data-so-cabecalho", "true");
  });

  it("acoes restringe os botões (o Início só edita)", () => {
    comCanvas(
      <FluxoNode id="i1" tipo="trigger" title="Início" showTarget={false} showSource={false} acoes={["editar"]} />,
    );
    expect(screen.getByTestId("bloco-editar-i1")).toBeInTheDocument();
    expect(screen.queryByTestId("bloco-excluir-i1")).toBeNull();
  });
});

describe("FluxoNode — saídas múltiplas", () => {
  it("uma linha por saída com valor à direita e OU entre elas", () => {
    comCanvas(
      <FluxoNode
        id="a1"
        tipo="aguardar_resposta"
        title="Aguardar"
        ouEntreSaidas
        saidas={[
          { id: "respondeu", conteudo: "Respondeu" },
          { id: "sem_resposta", conteudo: "Não respondeu", valor: "2 h" },
        ]}
      />,
    );
    expect(screen.getByTestId("node-branch-a1-sem_resposta")).toHaveTextContent("Não respondeu2 h");
    expect(screen.getByText("OU")).toBeInTheDocument();
  });
});
