"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useReactFlow } from "@xyflow/react";
import { ArrowLeft, CloudCheck, Ellipsis, History, LoaderCircle, Pencil, Power, Rocket, Trash2 } from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { ApiError } from "@/lib/api/types";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import {
  blocosDesconectados,
  separarAvisos,
  validateFlowForPublish,
  type PublishValidationError,
} from "@/lib/followup/validate-publish";
import { contemEtiqueta } from "@/lib/tags/busca-de-etiqueta";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { etiquetasExcluidas } from "@/hooks/fluxos/useEtiquetasDaConta";
import { useT } from "@/hooks/i18n/useT";
import {
  useDeleteFollowupFlow,
  useDisableFollowupFlow,
  usePublishFollowupFlow,
  useRollbackFollowupFlow,
  useSaveFollowupFlowDraft,
  type FollowupFlowDetailRow,
} from "@/hooks/followup/useFollowupFlow";
import { RenameFollowupFlowDialog } from "@/app/app/ai/followups/_components/RenameFollowupFlowDialog";
import { TraduzirFluxo } from "@/app/app/fluxos/[id]/_traduzir-fluxo";

import { AvisosDoPublish, motivoDoAviso, type BlocoDesconectado } from "./AvisosDoPublish";
import { SimularDialog } from "./SimularDialog";

/** Espera depois da última edição antes de salvar sozinho. */
export const ESPERA_DO_AUTOSAVE_MS = 1200;

const STATUS: Record<FollowupFlowDetailRow["status"], string> = {
  draft: "Rascunho",
  active: "Publicado",
  disabled: "Desativado",
};

/**
 * Blocos Etiquetas que citam etiqueta excluída da conta nesta sessão (Etapa 1):
 * aviso do EDITOR — o servidor não tem como saber o que foi excluído.
 */
export function avisosDeEtiquetaExcluida(graph: FlowGraph, excluidas: readonly string[]): PublishValidationError[] {
  if (excluidas.length === 0) return [];
  return graph.nodes.flatMap((n) => {
    if (n.type !== "etiquetas") return [];
    const citadas = n.config.etiquetas.filter((e) => contemEtiqueta(excluidas, e));
    return citadas.length > 0
      ? [{ node_id: n.id, code: "etiqueta_excluida" as const, message: citadas.join(", "), severity: "warning" as const }]
      : [];
  });
}

/** "agora", "há 2 min", "há 3 h" — a partir de um instante. */
export function haQuanto(desde: number, agora: number): string {
  const s = Math.max(0, Math.round((agora - desde) / 1000));
  if (s < 60) return "agora";
  const min = Math.floor(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

interface Props {
  flowId: string;
  flow: FollowupFlowDetailRow;
  graph: FlowGraph;
  dirty: boolean;
  /** Com o modal de bloco aberto o rascunho não sai sozinho: Cancelar ainda pode desfazer. */
  pausarAutosave: boolean;
  onSaved: (graph: FlowGraph) => void;
  onPublishErrors: (errorsByNode: Record<string, string[]>) => void;
  onPublishSuccess: () => void;
}

/**
 * Topbar do construtor de FLUXOS (redesenho de 17 out), no lugar da PublishBar
 * do follow-up: voltar, nome + lápis, status, "Salvo há…" à esquerda; Simular,
 * "…" (Traduzir, Desativar, Rollback, Excluir) e Publicar à direita. Sem
 * "Organizar" (rodada 1, item 4): ele bagunçava o desenho e saiu.
 * Não há botão Salvar: o rascunho salva sozinho (mesmo PATCH de antes) pouco
 * depois de cada edição.
 */
export function BarraDoFluxo({
  flowId,
  flow,
  graph,
  dirty,
  pausarAutosave,
  onSaved,
  onPublishErrors,
  onPublishSuccess,
}: Props) {
  const t = useT();
  const router = useRouter();
  const save = useSaveFollowupFlowDraft(flowId, { silencioso: true });
  const publish = usePublishFollowupFlow(flowId);
  const disable = useDisableFollowupFlow(flowId);
  const rollback = useRollbackFollowupFlow(flowId);
  const del = useDeleteFollowupFlow();
  const queryClient = useQueryClient();
  const { activeOrg } = useAuth();
  const { getNode, getZoom, setCenter } = useReactFlow();
  const [renomear, setRenomear] = useState(false);
  const [desconectados, setDesconectados] = useState<BlocoDesconectado[] | null>(null);
  const [excluir, setExcluir] = useState(false);
  const [salvoEm, setSalvoEm] = useState(() => Date.parse(flow.updated_at) || Date.now());
  const [agora, setAgora] = useState(() => Date.now());
  const listHref = "/app/fluxos";

  // "Salvo há X min" anda sozinho.
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Salvamento automático: o último grafo, depois de uma pausa na edição.
  // `mutateAsync` do TanStack é estável: não refaz o efeito a cada render.
  const salvar = save.mutateAsync;
  useEffect(() => {
    if (!dirty || pausarAutosave) return;
    const id = window.setTimeout(() => {
      salvar(graph)
        .then(() => {
          onSaved(graph);
          setSalvoEm(Date.now());
          setAgora(Date.now());
        })
        .catch(() => {
          // O hook já mostrou o erro; o grafo segue "não salvo" e tenta de novo na próxima edição.
        });
    }, ESPERA_DO_AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [graph, dirty, pausarAutosave, onSaved, salvar]);

  // Fechar a aba com edição pendente pergunta antes.
  useEffect(() => {
    if (!dirty) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [dirty]);

  const avisosDoEditor = () => avisosDeEtiquetaExcluida(graph, etiquetasExcluidas(queryClient, activeOrg?.orgId ?? null));

  // Abre o aviso com os blocos destacados no canvas.
  const abrirAvisos = (avisos: PublishValidationError[]) => {
    const blocos = blocosDesconectados(avisos, graph);
    onPublishErrors(
      Object.fromEntries(blocos.map(({ node, avisos: a }) => [node.id, a.map((x) => motivoDoAviso(node, x, t))])),
    );
    setDesconectados(blocos);
  };

  // Etapa 3: clicar no cartão do aviso fecha o aviso, centraliza o bloco com
  // zoom e o faz piscar por 1,5 s.
  const irAteBloco = (nodeId: string) => {
    setDesconectados(null);
    const no = getNode(nodeId);
    if (!no) return;
    const w = no.measured?.width ?? 232;
    const h = no.measured?.height ?? 100;
    void setCenter(no.position.x + w / 2, no.position.y + h / 2, { zoom: Math.max(getZoom(), 1), duration: 300 });
    window.setTimeout(() => {
      const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
      if (!el) return;
      el.classList.remove("fx-piscar");
      void (el as HTMLElement).offsetWidth;
      el.classList.add("fx-piscar");
      window.setTimeout(() => el.classList.remove("fx-piscar"), 1500);
    }, 300);
  };

  const publicar = (aceitarAvisos: boolean) => {
    publish.mutate(aceitarAvisos ? { aceitarAvisos: true } : undefined, {
      onSuccess: () => {
        setDesconectados(null);
        onPublishSuccess();
      },
      onError: (err) => {
        // Rodada 1, item 3: só avisos (blocos desconectados) — os blocos ficam
        // destacados e a pessoa decide: voltar e conectar, ou publicar assim.
        if (err instanceof ApiError && err.code === "publish_warnings") {
          const avisos = (err.details?.errors as PublishValidationError[] | undefined) ?? [];
          abrirAvisos([...avisos, ...avisosDoEditor()]);
          return;
        }
        setDesconectados(null);
        if (err instanceof ApiError && err.code === "validation_failed") {
          const errors = (err.details?.errors as PublishValidationError[] | undefined) ?? [];
          const byNode: Record<string, string[]> = {};
          const flowLevel: string[] = [];
          for (const e of errors) {
            if (e.node_id) (byNode[e.node_id] ??= []).push(e.message);
            else flowLevel.push(e.message);
          }
          onPublishErrors(byNode);
          toast.error(t("Fluxo reprovado na validação — corrija os nós destacados."), {
            description: flowLevel.length > 0 ? flowLevel.join(" ") : undefined,
          });
          return;
        }
        showApiError(err);
      },
    });
  };

  const onPublish = async () => {
    try {
      await save.mutateAsync(graph);
      onSaved(graph);
      setSalvoEm(Date.now());
    } catch {
      return; // o erro do save já apareceu — não publica um rascunho que não salvou
    }
    // Aviso que só o editor conhece (etiqueta excluída): sem erro que bloqueie,
    // o aviso abre ANTES de ir ao servidor, junto dos avisos do validador — o
    // mesmo validador puro que o servidor roda.
    const doEditor = avisosDoEditor();
    if (doEditor.length > 0) {
      const r = validateFlowForPublish(graph, { surface: "fluxo" });
      const { bloqueantes, avisos } = separarAvisos(r.ok ? [] : r.errors);
      if (bloqueantes.length === 0) {
        abrirAvisos([...avisos, ...doEditor]);
        return;
      }
    }
    publicar(false);
  };

  const canRollback = flow.versions_count > 1 && flow.previous_version_id !== null;
  const busy = publish.isPending || disable.isPending || rollback.isPending;
  const traduzir = Boolean((flow as { translate_to_contact_locale?: boolean }).translate_to_contact_locale);

  let salvamento: ReactNode;
  if (save.isPending) {
    salvamento = (
      <>
        <LoaderCircle size={14} className="animate-spin" aria-hidden /> {t("Salvando…")}
      </>
    );
  } else if (dirty) {
    salvamento = <span data-testid="dirty-indicator">{t("Alterações não salvas")}</span>;
  } else {
    salvamento = (
      <>
        <CloudCheck size={14} aria-hidden /> {t("Salvo")} {haQuanto(salvoEm, agora)}
      </>
    );
  }

  return (
    <header className="fx-topbar" data-testid="fluxo-topbar">
      <Link href={listHref} aria-label={t("Voltar para Fluxos")} className="fx-iconbtn">
        <ArrowLeft size={18} aria-hidden />
      </Link>
      <h1 className="min-w-0 truncate text-[16px] font-semibold text-[var(--fx-text)]" title={flow.name}>
        {flow.name}
      </h1>
      <button
        type="button"
        className="fx-iconbtn -ml-2 h-7 w-7"
        onClick={() => setRenomear(true)}
        aria-label={t("Renomear")}
        data-testid="rename-followup-flow"
      >
        <Pencil size={14} aria-hidden />
      </button>
      <span className="fx-status" data-status={flow.status} aria-label={`${t("status")}: ${t(STATUS[flow.status])}`}>
        {t(STATUS[flow.status])}
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-[var(--fx-muted)]" data-testid="fluxo-salvamento">
        {salvamento}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <SimularDialog />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="fx-btn fx-btn--icon" aria-label={t("Mais ações")} data-testid="fluxo-mais">
              <Ellipsis size={16} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="fx-portal w-64">
            <TraduzirFluxo flowId={flowId} inicial={traduzir} />
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={busy || flow.status === "disabled"} onSelect={() => disable.mutate()} data-testid="disable-button">
              <Power size={14} aria-hidden className="mr-2" />
              {t("Desativar")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || !canRollback}
              onSelect={() => flow.previous_version_id && rollback.mutate(flow.previous_version_id)}
              data-testid="rollback-button"
            >
              <History size={14} aria-hidden className="mr-2" />
              {t("Rollback")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[#f87171] focus:text-[#f87171]"
              onSelect={() => setExcluir(true)}
              data-testid="delete-followup-flow"
            >
              <Trash2 size={14} aria-hidden className="mr-2" />
              {t("Excluir")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="fx-btn fx-btn--primary" disabled={busy || save.isPending} onClick={onPublish} data-testid="publish-button">
          <Rocket size={15} aria-hidden />
          {publish.isPending ? t("Publicando…") : t("Publicar")}
        </button>
      </div>

      <AvisosDoPublish
        blocos={desconectados}
        publicando={publish.isPending}
        onVoltar={() => setDesconectados(null)}
        onPublicarMesmoAssim={() => publicar(true)}
        onIrAteBloco={irAteBloco}
      />
      <RenameFollowupFlowDialog flowId={flowId} flowName={flow.name} open={renomear} onOpenChange={setRenomear} />
      <AlertDialog open={excluir} onOpenChange={setExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Excluir")} &ldquo;{flow.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("Inscrições e versões deste fluxo são apagadas junto. Não é possível desfazer.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                del.mutate(flowId, {
                  onSuccess: () => {
                    setExcluir(false);
                    router.push(listHref);
                  },
                });
              }}
            >
              {del.isPending ? t("Excluindo…") : t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
