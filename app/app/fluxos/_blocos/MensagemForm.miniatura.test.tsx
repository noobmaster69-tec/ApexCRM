import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./useCamposDaFicha", () => ({ useCamposDaFicha: () => ({ campos: [], variaveis: [] }) }));

import { MensagemForm } from "./MensagemForm";

/** Rodada 1 do editor de fluxos, item 2: dentro do bloco, a imagem aparece ao lado do nome. */
describe("MensagemForm — miniatura da imagem", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("arquivo enviado: miniatura de 112px com o link assinado, ao lado de Trocar arquivo e do nome", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { url: "https://storage.local/a.png" } }))));
    render(
      <MensagemForm
        flowId="f1"
        config={{ itens: [{ id: "i", tipo: "imagem", midia: { storage_path: "o/fluxos/f1/a.png", nome_arquivo: "Captura.png" } }] }}
        onChange={() => {}}
      />,
    );
    const mini = screen.getByTestId("miniatura-editor-i");
    expect(mini.style.width).toBe("112px");
    expect(screen.getByText("Trocar arquivo")).toBeInTheDocument();
    expect(screen.getByText("Captura.png")).toBeInTheDocument();
    await waitFor(() => expect(mini.querySelector("img")).toHaveAttribute("src", "https://storage.local/a.png"));
  });

  it("link https colado também mostra a imagem; vídeo não tem miniatura", () => {
    render(
      <MensagemForm
        config={{
          itens: [
            { id: "i", tipo: "imagem", midia: { url: "https://x.y/foto.jpg" } },
            { id: "v", tipo: "video", midia: { url: "https://x.y/demo.mp4" } },
          ],
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("miniatura-editor-i").querySelector("img")).toHaveAttribute("src", "https://x.y/foto.jpg");
    expect(screen.queryByTestId("miniatura-editor-v")).toBeNull();
  });
});
