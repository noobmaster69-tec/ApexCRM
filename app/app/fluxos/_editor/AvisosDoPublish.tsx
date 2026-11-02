"use client";

import { Unplug } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { nodeBranches, type FlowNode } from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import type { PublishValidationError } from "@/lib/followup/validate-publish";
import { useT } from "@/hooks/i18n/useT";

import { temaDoBloco } from "./tema-dos-blocos";

type Traduzir = (texto: string) => string;

/** Por que o bloco está na lista — uma frase por aviso, sem id de nó. */
export function motivoDoAviso(node: FlowNode, aviso: PublishValidationError, t: Traduzir): string {
  if (aviso.code === "unreachable_node") return t("Solto: o Início não chega até ele.");
  if (aviso.code === "no_end_path") return t("O caminho para aqui: não há seta para o próximo bloco.");
  const ramo = nodeBranches(node).find((b) => b.id === aviso.branch_id);
  return ramo ? `${t("Saída sem seta:")} ${t(rotuloDoRamo(ramo))}` : t("Uma saída está sem seta.");
}

export interface BlocoDesconectado {
  node: FlowNode;
  avisos: PublishValidationError[];
}

/**
 * Confirmação de publicar com blocos desconectados (rodada 1 do editor, item 3).
 * Só abre quando o servidor devolveu SÓ avisos (`publish_warnings`); com erro
 * que bloqueia, nada disto aparece. Os blocos seguem destacados no canvas.
 */
export function AvisosDoPublish({
  blocos,
  publicando,
  onVoltar,
  onPublicarMesmoAssim,
}: {
  blocos: BlocoDesconectado[] | null;
  publicando: boolean;
  onVoltar: () => void;
  onPublicarMesmoAssim: () => void;
}) {
  const t = useT();
  return (
    <AlertDialog open={blocos !== null} onOpenChange={(aberto) => !aberto && onVoltar()}>
      <AlertDialogContent data-testid="avisos-do-publish">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Unplug size={18} aria-hidden />
            {t("Alguns blocos estão desconectados")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "Bloco solto nunca roda, e o contato que chegar a um caminho sem seta encerra o fluxo ali. Você pode conectar agora ou publicar assim mesmo.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto" data-testid="avisos-lista">
          {(blocos ?? []).map(({ node, avisos }) => {
            const tipo = t(temaDoBloco(node.type).label);
            const nome = node.label && node.label !== tipo ? node.label : null;
            return (
              <li
                key={node.id}
                className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
                data-testid={`aviso-${node.id}`}
              >
                <p className="font-medium text-text">
                  {nome ?? tipo}
                  {nome && <span className="ml-1.5 font-normal text-text-muted">· {tipo}</span>}
                </p>
                {avisos.map((a, i) => (
                  <p key={`${a.code}-${a.branch_id ?? i}`} className="text-xs text-text-muted">
                    {motivoDoAviso(node, a, t)}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="avisos-voltar">{t("Voltar e conectar")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={publicando}
            onClick={(e) => {
              e.preventDefault();
              onPublicarMesmoAssim();
            }}
            data-testid="avisos-publicar-mesmo-assim"
          >
            {publicando ? t("Publicando…") : t("Publicar mesmo assim")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
