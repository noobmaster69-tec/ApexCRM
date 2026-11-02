/**
 * RODADA 1 DO EDITOR DE FLUXOS, PELA TELA (DoD 12).
 *
 * Um gerente abre um fluxo com um bloco Mensagem de 3 textos + 2 imagens
 * ENVIADAS (Storage, link assinado) e um bloco solto, e:
 *   1. vê o cartão da Mensagem com TODO o conteúdo — sem pausa, sem
 *      "digitando", sem "+ itens"/"ver mais" — e a miniatura das duas imagens;
 *   2. abre o bloco: a mesma imagem, maior, ao lado de "Trocar arquivo"; sem
 *      campo "Rótulo";
 *   3. não acha o botão "Organizar";
 *   4. clica Publicar → modal "Alguns blocos estão desconectados" listando o
 *      solto → "Publicar mesmo assim" → o fluxo fica Publicado.
 *
 * O grafo entra pela API (o desenho não é o que se prova aqui); a imagem sobe
 * pela MESMA rota que o botão "Enviar arquivo" usa.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";

import { expect, test } from "./helpers/test";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "editor-fluxo-rodada-1");
function evidencia(nome: string): string {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  return path.join(EVIDENCIA, nome);
}

/** PNG 8×8 de uma cor só — basta para provar que a miniatura carregou. */
function png(r: number, g: number, b: number): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.from(tipo, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, sum]);
  };
  const lado = 8;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 2; // RGB
  const linha = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: lado }, () => [r, g, b]).flat())]);
  const pixels = Buffer.concat(Array.from({ length: lado }, () => linha));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(pixels)),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 180_000 });

test("Mensagem completa com miniaturas, sem Rótulo nem Organizar, e publicar com bloco solto depois de confirmar", async ({
  page,
}) => {
  await loginComoAdmin(page, lerCreds());

  const criado = await page.request.post("/api/v1/ai/followup-flows", {
    data: { name: `E2E Rodada 1 ${Date.now()}`, surface: "fluxo" },
  });
  expect(criado.status()).toBe(201);
  const { data: fluxo } = (await criado.json()) as { data: { id: string } };

  const subir = async (nome: string, buffer: Buffer) => {
    const r = await page.request.post(`/api/v1/fluxos/${fluxo.id}/midia`, {
      multipart: { file: { name: nome, mimeType: "image/png", buffer } },
    });
    expect(r.status(), await r.text()).toBe(201);
    const { data } = (await r.json()) as { data: { storage_path: string; mime: string } };
    return { storage_path: data.storage_path, mime: data.mime, nome_arquivo: nome };
  };
  const azul = await subir("produto-azul.png", png(40, 90, 230));
  const verde = await subir("produto-verde.png", png(30, 170, 90));

  const mensagem = {
    id: "mensagem-1",
    type: "mensagem",
    label: "Mensagem",
    position: { x: 360, y: 0 },
    config: {
      itens: [
        { id: "t1", tipo: "texto", texto: "Oi {primeiro_nome}! Tudo bem?" },
        { id: "p1", tipo: "intervalo", modo: "fixo", segundos: 3 },
        { id: "t2", tipo: "texto", texto: "Separei duas opções para você:\nas duas chegam amanhã." },
        { id: "i1", tipo: "imagem", midia: azul, legenda: "A azul" },
        { id: "i2", tipo: "imagem", midia: verde },
        { id: "t3", tipo: "texto", texto: "Qual delas você prefere? Me responde por aqui que eu separo agora mesmo." },
      ],
    },
  };
  const grafo = {
    nodes: [
      { id: "inicio", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
      mensagem,
      { id: "fim", type: "end", label: "Fim", position: { x: 760, y: 0 }, config: { outcome: "custom" } },
      // O bloco solto: nenhuma seta chega nele.
      {
        id: "etiquetas-1",
        type: "etiquetas",
        label: "Etiquetas",
        position: { x: 360, y: 900 },
        config: { operacao: "adicionar", etiquetas: ["teste"] },
      },
    ],
    edges: [
      { id: "e1", source: "inicio", target: "mensagem-1", priority: 0, condition: { type: "always" } },
      { id: "e2", source: "mensagem-1", target: "fim", priority: 0, condition: { type: "always" } },
    ],
  };
  const salvo = await page.request.patch(`/api/v1/ai/followup-flows/${fluxo.id}`, { data: { draft_graph: grafo } });
  expect(salvo.status(), await salvo.text()).toBe(200);

  try {
    await page.goto(`/app/fluxos/${fluxo.id}`);
    const cartao = page.getByTestId("node-card-mensagem-1");
    await expect(cartao).toBeVisible();

    // 1. Todo o conteúdo, na ordem; nada de pausa, digitando, "+ itens", "ver mais".
    const previa = page.getByTestId("previa-mensagem-1");
    await expect(previa).toContainText("Oi {primeiro_nome}! Tudo bem?");
    await expect(previa).toContainText("as duas chegam amanhã.");
    await expect(previa).toContainText("Me responde por aqui que eu separo agora mesmo.");
    await expect(previa).toContainText("produto-azul.png");
    await expect(previa).toContainText("produto-verde.png");
    await expect(previa).toContainText("A azul");
    await expect(previa).not.toContainText(/Pausa|Digitando|ver mais|\+ \d+ ite/);
    await expect(page.getByTestId("ver-mais-mensagem-1")).toHaveCount(0);
    for (const id of ["i1", "i2"]) {
      const img = page.getByTestId(`miniatura-${id}`).locator("img");
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const caixa = await img.boundingBox();
      expect(caixa?.width).toBeGreaterThanOrEqual(48);
      expect(caixa?.width).toBeLessThanOrEqual(64);
    }
    // O cartão maior não cobre nenhum outro bloco.
    const caixas = await page.locator("[data-testid^='node-card-']").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute("data-testid"), x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (const a of caixas)
      for (const b of caixas)
        if (a.id !== b.id)
          expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.id} × ${b.id}`).toBe(false);
    await page.screenshot({ path: evidencia("01-cartao-da-mensagem-completo.png") });

    // 3. Sem "Organizar" na barra.
    await expect(page.getByTestId("auto-fit-flow")).toHaveCount(0);

    // 2. Dentro do bloco: miniatura maior, sem "Rótulo".
    await cartao.hover();
    await page.getByTestId("bloco-editar-mensagem-1").click();
    const modal = page.getByTestId("bloco-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel("Rótulo")).toHaveCount(0);
    const grande = page.getByTestId("miniatura-editor-i1");
    await grande.scrollIntoViewIfNeeded();
    await expect(grande.locator("img")).toBeVisible();
    const lado = (await grande.boundingBox())?.width ?? 0;
    expect(lado).toBeGreaterThanOrEqual(96);
    expect(lado).toBeLessThanOrEqual(120);
    await page.screenshot({ path: evidencia("02-imagem-dentro-do-bloco.png") });
    await page.getByTestId("bloco-modal-salvar").click();
    await expect(modal).toHaveCount(0);

    // 4. Publicar → confirmar o bloco solto → publicado.
    await page.getByTestId("publish-button").click();
    const avisos = page.getByTestId("avisos-do-publish");
    await expect(avisos).toBeVisible();
    await expect(avisos).toContainText("Alguns blocos estão desconectados");
    await expect(page.getByTestId("aviso-etiquetas-1")).toContainText("Etiquetas");
    await expect(page.getByTestId("node-error-etiquetas-1")).toBeVisible();
    await page.screenshot({ path: evidencia("03-modal-blocos-desconectados.png") });
    await page.getByTestId("avisos-publicar-mesmo-assim").click();
    await expect(avisos).toHaveCount(0);
    await expect(page.locator(".fx-status")).toHaveText("Publicado");
    await page.screenshot({ path: evidencia("04-publicado.png") });
  } finally {
    await page.request.post(`/api/v1/ai/followup-flows/${fluxo.id}/disable`, { data: {} });
    await page.request.delete(`/api/v1/ai/followup-flows/${fluxo.id}`);
  }
});
