import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FlowNode } from "@/lib/followup/graph-schema";
import { AvisosDoPublish } from "./AvisosDoPublish";

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
    expect(screen.getByTestId("aviso-c1")).toHaveTextContent("Pergunta do preço· CondicionalSaída sem seta: Não");
    await user.click(screen.getByTestId("avisos-publicar-mesmo-assim"));
    expect(onPublicar).toHaveBeenCalledOnce();
    await user.click(screen.getByTestId("avisos-voltar"));
    expect(onVoltar).toHaveBeenCalled();
  });

  it("fechado quando não há avisos", () => {
    render(<AvisosDoPublish blocos={null} publicando={false} onVoltar={() => {}} onPublicarMesmoAssim={() => {}} />);
    expect(screen.queryByTestId("avisos-do-publish")).toBeNull();
  });
});
