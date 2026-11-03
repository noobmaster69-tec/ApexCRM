"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";

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
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import {
  useAtualizarEtiquetasDaConta,
  useEtiquetasDaConta,
  usePodeGerenciarEtiquetas,
} from "@/hooks/fluxos/useEtiquetasDaConta";
import { apiClient } from "@/lib/api/client";
import type { LinhaDeVocabulario } from "@/lib/schemas/tags";
import {
  chaveDeBusca,
  contemEtiqueta,
  etiquetaIgual,
  filtrarEtiquetas,
  type EtiquetaDaConta,
} from "@/lib/tags/busca-de-etiqueta";

type Opcao = { tipo: "criar"; nome: string } | { tipo: "etiqueta"; etiqueta: EtiquetaDaConta };

/**
 * Campo do bloco Etiquetas (Etapa 1): ao focar, lista TODAS as etiquetas da
 * conta; ao digitar, filtra sem caixa nem acento; Enter escolhe a destacada.
 * "Criar" só aparece quando nada bate exatamente (evita `Lead` ao lado de
 * `lead`) e nunca no modo Remover. O × de cada linha exclui a etiqueta DA
 * CONTA — o do chip, acima, só a tira deste bloco.
 */
export function ComboDeEtiquetas({
  escolhidas,
  podeCriar,
  maxLength,
  onAlternar,
  onRemoverUltima,
}: {
  escolhidas: string[];
  podeCriar: boolean;
  maxLength: number;
  onAlternar: (nome: string) => void;
  onRemoverUltima: () => void;
}) {
  const t = useT();
  const idLista = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const { data: lista = [], isLoading } = useEtiquetasDaConta();
  const atualizar = useAtualizarEtiquetasDaConta();
  const podeExcluir = usePodeGerenciarEtiquetas();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [destaque, setDestaque] = useState(0);
  const [excluindo, setExcluindo] = useState<{ nome: string; contatos: number | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const opcoes = useMemo<Opcao[]>(() => {
    const filtradas = filtrarEtiquetas(lista, texto).map((etiqueta) => ({ tipo: "etiqueta" as const, etiqueta }));
    const nome = texto.trim();
    const criar = podeCriar && nome !== "" && !etiquetaIgual(lista, nome) && !contemEtiqueta(escolhidas, nome);
    return criar ? [{ tipo: "criar" as const, nome }, ...filtradas] : filtradas;
  }, [lista, texto, podeCriar, escolhidas]);
  const ativo = Math.min(destaque, Math.max(0, opcoes.length - 1));

  function escolher(opcao: Opcao | undefined) {
    if (!opcao) return;
    if (opcao.tipo === "criar") {
      onAlternar(opcao.nome);
      atualizar.criada(opcao.nome);
    } else {
      onAlternar(opcao.etiqueta.nome);
    }
    setTexto("");
    setDestaque(0);
    entrada.current?.focus();
  }

  async function pedirExclusao(nome: string) {
    setExcluindo({ nome, contatos: null });
    // A contagem vem da leitura do vocabulário (mesma régua de papel da exclusão).
    // Sem ela, a frase sai sem o número — nunca com um número inventado.
    try {
      const r = await apiClient.get<{ data: LinhaDeVocabulario[] }>("/api/v1/tags/vocabulario");
      const linha = r.data.find((l) => chaveDeBusca(l.tag) === chaveDeBusca(nome));
      setExcluindo((atual) => (atual?.nome === nome ? { nome, contatos: linha?.uso_em_contatos ?? 0 } : atual));
    } catch {
      // segue sem o número
    }
  }

  async function excluir() {
    if (!excluindo) return;
    setOcupado(true);
    try {
      // A MESMA operação da tela Configurações › Etiquetas: uma transação tira a
      // etiqueta de contatos, leads, conversas e do vocabulário.
      await apiClient.post("/api/v1/tags/vocabulario", { acao: "excluir", tag: excluindo.nome, destino: null });
      atualizar.excluida(excluindo.nome);
      setExcluindo(null);
    } catch (err) {
      showApiError(err);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverAnchor asChild>
          <input
            ref={entrada}
            id="etiquetas-nova"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={aberto && opcoes[ativo] ? `${idLista}-${ativo}` : undefined}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-hidden placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={texto}
            maxLength={maxLength}
            placeholder={podeCriar ? t("Digite e aperte Enter") : t("Escolha uma etiqueta")}
            autoComplete="off"
            data-testid="etiquetas-combo"
            onFocus={() => setAberto(true)}
            onClick={() => setAberto(true)}
            onChange={(e) => {
              setTexto(e.target.value);
              setDestaque(0);
              setAberto(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAberto(true);
                setDestaque((i) => Math.min(i + 1, opcoes.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setDestaque((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                // ⌘/Ctrl + Enter salva o modal: não é escolha de etiqueta.
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                escolher(opcoes[ativo]);
              } else if (e.key === "Backspace" && texto === "" && escolhidas.length > 0) {
                onRemoverUltima();
              }
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="fx-portal w-[var(--radix-popover-trigger-width)] p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          // Clicar no próprio campo não conta como "fora".
          onInteractOutside={(e) => {
            if (entrada.current?.contains(e.target as Node)) e.preventDefault();
          }}
          data-testid="etiquetas-lista"
        >
          <TooltipProvider delayDuration={300}>
          <ul id={idLista} role="listbox" aria-label={t("Etiquetas")} className="max-h-[280px] overflow-y-auto">
            {isLoading && <li className="px-2 py-1.5 text-xs text-[var(--fx-muted)]">{t("Carregando…")}</li>}
            {!isLoading && opcoes.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-[var(--fx-muted)]">
                {podeCriar ? t("Nenhuma etiqueta ainda. Digite para criar.") : t("Nenhuma etiqueta encontrada.")}
              </li>
            )}
            {opcoes.map((opcao, i) => {
              const id = `${idLista}-${i}`;
              const destacada = i === ativo;
              if (opcao.tipo === "criar") {
                return (
                  <li
                    key="criar"
                    id={id}
                    role="option"
                    aria-selected={destacada}
                    data-destaque={destacada || undefined}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--fx-text)] data-[destaque]:bg-[var(--fx-field)]"
                    onMouseEnter={() => setDestaque(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => escolher(opcao)}
                    data-testid="etiquetas-criar"
                  >
                    <Plus size={14} aria-hidden className="text-[var(--fx-accent)]" />
                    {t("Criar etiqueta")} &ldquo;{opcao.nome}&rdquo;
                  </li>
                );
              }
              const { etiqueta } = opcao;
              const marcada = contemEtiqueta(escolhidas, etiqueta.nome);
              return (
                <li
                  key={chaveDeBusca(etiqueta.nome)}
                  id={id}
                  role="option"
                  aria-selected={destacada}
                  data-destaque={destacada || undefined}
                  className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--fx-text)] data-[destaque]:bg-[var(--fx-field)]"
                  onMouseEnter={() => setDestaque(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(opcao)}
                  data-testid={`etiqueta-opcao-${chaveDeBusca(etiqueta.nome)}`}
                >
                  <span className="flex w-4 shrink-0 justify-center">
                    {marcada && <Check size={14} aria-label={t("No bloco")} className="text-[var(--fx-accent)]" />}
                  </span>
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--fx-panel-border)]"
                    style={etiqueta.cor ? { background: etiqueta.cor, borderColor: etiqueta.cor } : undefined}
                  />
                  <span className="min-w-0 flex-1 truncate">{etiqueta.nome}</span>
                  {podeExcluir && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${t("Excluir etiqueta")} ${etiqueta.nome}`}
                          className="rounded-sm p-0.5 text-[var(--fx-muted-2)] opacity-40 hover:bg-[var(--fx-panel)] hover:text-[var(--fx-danger)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--fx-accent)] group-hover:opacity-100"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            void pedirExclusao(etiqueta.nome);
                          }}
                          data-testid={`etiqueta-excluir-${chaveDeBusca(etiqueta.nome)}`}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t("Excluir esta etiqueta da conta")}</TooltipContent>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
          </TooltipProvider>
        </PopoverContent>
      </Popover>

      <AlertDialog open={excluindo !== null} onOpenChange={(a) => !a && !ocupado && setExcluindo(null)}>
        <AlertDialogContent data-testid="etiqueta-excluir-confirmacao">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Excluir a etiqueta")} <strong>{excluindo?.nome}</strong>?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.contatos != null ? (
                <>
                  {t("Ela será removida de")} <strong>{excluindo.contatos}</strong> {t("contatos e não poderá ser usada em novos blocos.")}
                </>
              ) : (
                t("Ela será removida de todos os contatos e não poderá ser usada em novos blocos.")
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={ocupado}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                void excluir();
              }}
              data-testid="etiqueta-excluir-confirmar"
            >
              {ocupado ? t("Excluindo…") : t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
