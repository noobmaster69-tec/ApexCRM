"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

import type { ItemDaMensagem } from "@/lib/followup/blocos-do-fluxo";

type Midia = Extract<ItemDaMensagem, { midia: unknown }>["midia"];

/** O link assinado vale 10 min (`GET /api/v1/fluxos/:id/midia`); renova um pouco antes. */
const VALIDADE_MS = 9 * 60_000;

/**
 * Links assinados já pedidos, por caminho — o cartão e o modal da mesma
 * imagem, e o mesmo cartão a cada render, não pedem de novo.
 */
const assinados = new Map<string, { url: Promise<string | null>; ate: number }>();

function pedirAssinado(flowId: string, caminho: string): Promise<string | null> {
  const chave = `${flowId}:${caminho}`;
  const guardado = assinados.get(chave);
  if (guardado && guardado.ate > Date.now()) return guardado.url;
  const url = fetch(`/api/v1/fluxos/${flowId}/midia?path=${encodeURIComponent(caminho)}`)
    .then(async (r) => (r.ok ? (((await r.json()) as { data?: { url?: string } }).data?.url ?? null) : null))
    .catch(() => null);
  assinados.set(chave, { url, ate: Date.now() + VALIDADE_MS });
  return url;
}

/**
 * De onde vem a imagem — a MESMA origem que o envio usa: o link https colado
 * vale como está; o arquivo enviado vira link assinado do Storage (só dentro
 * do editor, que tem o `flowId`; o link compartilhado fica no ícone).
 */
export function useUrlDaMidia(midia: Midia | null | undefined, flowId: string | undefined): string | null {
  const caminho = midia?.storage_path;
  // Link ainda sendo digitado não vira <img>: só o https completo.
  const direta = midia?.url?.startsWith("https://") ? midia.url : null;
  const [assinada, setAssinada] = useState<{ caminho: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!caminho || !flowId) return;
    let vivo = true;
    void pedirAssinado(flowId, caminho).then((url) => {
      if (vivo) setAssinada({ caminho, url });
    });
    return () => {
      vivo = false;
    };
  }, [caminho, flowId]);
  if (direta) return direta;
  return caminho && assinada?.caminho === caminho ? assinada.url : null;
}

/** "foto.png" a partir do nome enviado ou, num link, do fim do caminho. */
export function nomeDaMidia(midia: Midia | null | undefined): string | null {
  if (midia?.nome_arquivo) return midia.nome_arquivo;
  if (!midia?.url) return null;
  try {
    const fim = new URL(midia.url).pathname.split("/").filter(Boolean).pop();
    return fim ? decodeURIComponent(fim) : null;
  } catch {
    return null;
  }
}

/**
 * Miniatura da imagem de um item da Mensagem (rodada 1, item 2): `object-cover`
 * com cantos arredondados; enquanto o link não chega, ou se a imagem não
 * carrega, fica o ícone — o cartão nunca quebra por causa dela.
 */
export function MiniaturaDaMidia({
  midia,
  flowId,
  tamanho,
  Icone,
  className,
  testId,
}: {
  midia: Midia | null | undefined;
  flowId: string | undefined;
  tamanho: number;
  Icone: LucideIcon;
  className?: string;
  testId?: string;
}) {
  const url = useUrlDaMidia(midia, flowId);
  const [falhou, setFalhou] = useState<string | null>(null);
  const mostrar = url !== null && falhou !== url;
  return (
    <span
      className={className}
      style={{ width: tamanho, height: tamanho }}
      data-testid={testId}
      data-miniatura={mostrar ? "imagem" : "icone"}
    >
      {mostrar ? (
        // eslint-disable-next-line @next/next/no-img-element -- link assinado do Storage ou link do usuário, sem otimização do Next
        <img src={url} alt="" loading="lazy" onError={() => setFalhou(url)} />
      ) : (
        <Icone size={Math.min(24, Math.round(tamanho * 0.36))} aria-hidden />
      )}
    </span>
  );
}
