import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FlowNode } from "@/lib/followup/graph-schema";
import { AvisosDoPublish, motivoDoAviso, pistaDoBloco } from "./AvisosDoPublish";
import { avisosDeEtiquetaExcluida } from "./BarraDoFluxo";
import { corDoTema, temaDoBloco } from "./tema-dos-blocos";

const pos = { x: 0, y: 0 };
const msg = { id: "m1", type: "mensagem", label: "Mensagem", position: pos, config: { itens: [] } } as unknown as FlowNode;
const cond = {
  id: "c1",
  type: "condicional",
  label: "Pergunta do preço",
  position: pos,
  config: { regra: "todas", condicoes: [] },
} as unknown as FlowNode;

/** Rodada 1 do editor de fluxos, item 3: a confirmação antes de publicar com blocos desconectados. */
describe("AvisosDoPublish", () => {
  it("lista cada bloco (nome + tipo) com o motivo, e os dois botões fazem o que dizem", async () => {
    const user = userEvent.setup({ delay: null });
    const onVoltar = vi.fn();
    const onPublicar = vi.fn();
    render(
      <AvisosDoPublish
        blocos={[
          { node: msg, avisos: [{ node_id: "m1", code: "unreachable_node", message: "", severity: "warning" }] },
          { node: cond, avisos: [{ node_id: "c1", code: "missing_branch_edge", branch_id: "nao", message: "", severity: "warning" }] },
        ]}
        publicando={false}
        onVoltar={onVoltar}
        onPublicarMesmoAssim={onPublicar}
      />,
    );
    expect(screen.getByText("Alguns blocos estão desconectados")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-m1")).toHaveTextContent("MensagemSolto: o Início não chega até ele.");
    expect(screen.getByTestId("aviso-c1")).toHaveTextContent("CondicionalPergunta do preçoSaída sem seta: Não");
    await user.click(screen.getByTestId("avisos-publicar-mesmo-assim"));
    expect(onPublicar).toHaveBeenCalledOnce();
    await user.click(screen.getByTestId("avisos-voltar"));
    expect(onVoltar).toHaveBeenCalled();
  });

  it("fechado quando não há avisos", () => {
    render(<AvisosDoPublish blocos={null} publicando={false} onVoltar={() => {}} onPublicarMesmoAssim={() => {}} />);
    expect(screen.queryByTestId("avisos-do-publish")).toBeNull();
  });

  it("cada cartão tem a cor e o ícone do bloco no canvas e, ao clicar ou com Enter, leva até ele", async () => {
    const user = userEvent.setup({ delay: null });
    const onIr = vi.fn();
    render(
      <AvisosDoPublish
        blocos={[{ node: cond, avisos: [{ node_id: "c1", code: "unreachable_node", message: "", severity: "warning" }] }]}
        publicando={false}
        onVoltar={() => {}}
        onPublicarMesmoAssim={() => {}}
        onIrAteBloco={onIr}
      />,
    );
    const cartao = screen.getByTestId("aviso-c1");
    const cor = corDoTema(temaDoBloco("condicional"));
    expect(cartao).toHaveAttribute("data-cor", cor);
    expect(cartao).toHaveAttribute("role", "button");
    expect(cartao.getAttribute("style")).toContain("3px solid");
    expect(screen.getByTestId("aviso-icone-c1").getAttribute("style")).toContain("background");
    await user.click(cartao);
    expect(onIr).toHaveBeenCalledWith("c1");
    cartao.focus();
    await user.keyboard("{Enter}");
    expect(onIr).toHaveBeenCalledTimes(2);
  });
});

describe("pista do bloco — distingue dois blocos do mesmo tipo", () => {
  const t = (s: string) => s;
  const aguardar = (id: string, valor: number) =>
    ({
      id,
      type: "aguardar_resposta",
      label: "Aguardar resposta",
      position: pos,
      config: { sem_limite: false, tempo: { valor, unidade: "minutos" } },
    }) as unknown as FlowNode;

  it("Aguardar 1 min × Aguardar 5 min; Mensagem pelo começo do texto; Distribuidor pelas saídas", () => {
    expect(pistaDoBloco(aguardar("a1", 1), t)).toBe("Aguardar 1 minutos");
    expect(pistaDoBloco(aguardar("a2", 5), t)).toBe("Aguardar 5 minutos");
    const longa = {
      ...msg,
      config: { itens: [{ id: "t1", tipo: "texto", texto: "Olá {primeiro_nome}! Tudo bem com você? Separei uma oferta" }] },
    } as unknown as FlowNode;
    expect(pistaDoBloco(longa, t)).toBe("Olá {primeiro_nome}! Tudo bem com você?…");
    const dist = {
      id: "d1",
      type: "distribuidor",
      label: "Distribuidor",
      position: pos,
      config: { modo: "proximo", saidas: [{ id: "s1", nome: "A" }, { id: "s2", nome: "B" }] },
    } as unknown as FlowNode;
    expect(pistaDoBloco(dist, t)).toBe("2 saídas");
  });

  it("o nome dado ao bloco vence o conteúdo", () => {
    expect(pistaDoBloco(cond, t)).toBe("Pergunta do preço");
  });
});

describe("aviso de etiqueta excluída (só o editor sabe)", () => {
  const etq = {
    id: "e1",
    type: "etiquetas",
    label: "Etiquetas",
    position: pos,
    config: { operacao: "adicionar", etiquetas: ["[LEAD-OUTBOUND-GOOGLE]", "vip"] },
  } as unknown as FlowNode;
  const graph = { nodes: [msg, etq], edges: [] } as never;

  it("lista o bloco que cita etiqueta excluída, sem caixa", () => {
    const avisos = avisosDeEtiquetaExcluida(graph, ["[lead-outbound-google]"]);
    expect(avisos).toEqual([
      { node_id: "e1", code: "etiqueta_excluida", message: "[LEAD-OUTBOUND-GOOGLE]", severity: "warning" },
    ]);
    expect(motivoDoAviso(etq, avisos[0]!, (s) => s)).toBe("Usa etiqueta excluída: [LEAD-OUTBOUND-GOOGLE]");
    expect(avisosDeEtiquetaExcluida(graph, [])).toEqual([]);
  });
});
