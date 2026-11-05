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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { nodeBranches, type FlowNode } from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import type { PublishValidationError } from "@/lib/followup/validate-publish";
import { useT } from "@/hooks/i18n/useT";

import { corDoTema, temaDoBloco } from "./tema-dos-blocos";

type Traduzir = (texto: string) => string;

/** Por que o bloco está na lista — uma frase por aviso, sem id de nó. */
export function motivoDoAviso(node: FlowNode, aviso: PublishValidationError, t: Traduzir): string {
  if (aviso.code === "unreachable_node") return t("Solto: o Início não chega até ele.");
  if (aviso.code === "no_end_path") return t("O caminho para aqui: não há seta para o próximo bloco.");
  if (aviso.code === "multiple_triggers") return t("Início duplicado: o fluxo só começa pelo Início principal.");
  if (aviso.code === "etiqueta_excluida") return `${t("Usa etiqueta excluída:")} ${aviso.message}`;
  const ramo = nodeBranches(node).find((b) => b.id === aviso.branch_id);
  return ramo ? `${t("Saída sem seta:")} ${t(rotuloDoRamo(ramo))}` : t("Uma saída está sem seta.");
}

const TETO_DA_PISTA = 40;

function cortar(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > TETO_DA_PISTA ? `${limpo.slice(0, TETO_DA_PISTA).trimEnd()}…` : limpo;
}

/**
 * O que diferencia dois blocos do mesmo tipo na lista: o nome dado ao bloco,
 * se houver; senão o começo do conteúdo ou a configuração principal.
 */
export function pistaDoBloco(node: FlowNode, t: Traduzir): string | null {
  const tipo = temaDoBloco(node.type).label;
  if (node.label && node.label !== tipo && node.label !== t(tipo)) return cortar(node.label);
  switch (node.type) {
    case "mensagem": {
      const texto = node.config.itens.find((i) => i.tipo === "texto");
      if (texto && "texto" in texto && texto.texto.trim()) return cortar(texto.texto);
      const midia = node.config.itens.find((i) => "midia" in i);
      return midia && "midia" in midia ? cortar(midia.midia.nome_arquivo ?? t("Mídia")) : null;
    }
    case "aguardar_resposta":
      if (node.config.sem_limite) return t("Aguardar sem limite de tempo");
      return node.config.tempo ? `${t("Aguardar")} ${node.config.tempo.valor} ${t(node.config.tempo.unidade)}` : null;
    case "intervalo":
      return node.config.modo === "duracao" ? `${t("Esperar")} ${node.config.valor} ${t(node.config.unidade)}` : null;
    case "distribuidor":
      return `${node.config.saidas.length} ${t("saídas")}`;
    case "condicional":
      return `${node.config.condicoes.length} ${t("condição(ões)")}`;
    case "etiquetas":
      return cortar(node.config.etiquetas.join(", "));
    case "notificacao":
      return cortar(node.config.nome);
    case "bloco_ia":
      return cortar(node.config.modelo);
    default:
      return null;
  }
}

export interface BlocoDesconectado {
  node: FlowNode;
  avisos: PublishValidationError[];
}

/**
 * Confirmação de publicar com blocos desconectados (rodada 1 do editor, item 3).
 * Só abre quando sobram AVISOS; com erro que bloqueia, nada disto aparece. Cada
 * cartão leva a cor e o ícone do bloco no canvas (a mesma fonte, BLOCK_THEME),
 * uma pista para distinguir blocos do mesmo tipo e, ao clicar, leva até ele.
 */
export function AvisosDoPublish({
  blocos,
  publicando,
  onVoltar,
  onPublicarMesmoAssim,
  onIrAteBloco,
}: {
  blocos: BlocoDesconectado[] | null;
  publicando: boolean;
  onVoltar: () => void;
  onPublicarMesmoAssim: () => void;
  /** Fecha o aviso e leva o canvas até o bloco. */
  onIrAteBloco?: (nodeId: string) => void;
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
        <TooltipProvider delayDuration={300}>
          <ul className="-mx-1 flex max-h-72 flex-col gap-2 overflow-y-auto px-1 py-1" data-testid="avisos-lista">
            {(blocos ?? []).map(({ node, avisos }) => {
              const tema = temaDoBloco(node.type);
              const cor = corDoTema(tema);
              const Icone = tema.icon;
              const pista = pistaDoBloco(node, t);
              const ir = () => onIrAteBloco?.(node.id);
              return (
                <li key={node.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={ir}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            ir();
                          }
                        }}
                        className="flex cursor-pointer gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2 text-left text-sm outline-hidden hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ borderLeft: `3px solid ${cor}` }}
                        data-testid={`aviso-${node.id}`}
                        data-cor={cor}
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: cor, color: tema.sobreCor }}
                          data-testid={`aviso-icone-${node.id}`}
                        >
                          <Icone size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-text">{t(tema.label)}</span>
                          {pista && <span className="block truncate text-xs text-text-subtle">{pista}</span>}
                          {avisos.map((a, i) => (
                            <span key={`${a.code}-${a.branch_id ?? i}`} className="block text-xs text-text-muted">
                              {motivoDoAviso(node, a, t)}
                            </span>
                          ))}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left">{t("Ir até o bloco")}</TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </TooltipProvider>
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
