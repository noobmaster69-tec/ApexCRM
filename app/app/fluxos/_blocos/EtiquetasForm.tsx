"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { etiquetasConfigSchema } from "@/lib/followup/blocos-do-fluxo";
import { useT } from "@/hooks/i18n/useT";
import { useEtiquetasExcluidas } from "@/hooks/fluxos/useEtiquetasDaConta";
import { contemEtiqueta } from "@/lib/tags/busca-de-etiqueta";
import { X } from "@/lib/ui/icons";

import { ComboDeEtiquetas } from "./ComboDeEtiquetas";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";

/**
 * Bloco Etiquetas (fork jhoow, Fase B): adiciona ou remove etiquetas do contato.
 * O campo é um combobox com as etiquetas da conta (`ComboDeEtiquetas`); o nó só
 * recebe a config que passa no schema (ao menos uma etiqueta, até 40
 * caracteres cada). Etiqueta excluída da conta nesta sessão aparece riscada.
 */
export function EtiquetasForm({
  config,
  onChange,
}: {
  config: ConfigOf<"etiquetas">;
  onChange: (c: ConfigOf<"etiquetas">) => void;
}) {
  const t = useT();
  const [operacao, setOperacao] = useState(config.operacao);
  const [etiquetas, setEtiquetas] = useState<string[]>(config.etiquetas);
  const excluidas = useEtiquetasExcluidas();
  const [erro, setErro] = useState<string | null>(null);

  function gravar(next: { operacao: typeof operacao; etiquetas: string[] }) {
    setOperacao(next.operacao);
    setEtiquetas(next.etiquetas);
    const r = etiquetasConfigSchema.safeParse(next);
    if (!r.success) {
      setErro(next.etiquetas.length === 0 ? t("Informe ao menos uma etiqueta.") : t("Etiqueta com até 40 caracteres."));
      return;
    }
    setErro(null);
    onChange(r.data);
  }

  function alternar(nome: string) {
    const limpa = nome.trim();
    if (!limpa) return;
    gravar({
      operacao,
      etiquetas: contemEtiqueta(etiquetas, limpa)
        ? etiquetas.filter((e) => !contemEtiqueta([e], limpa))
        : [...etiquetas, limpa],
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="etiquetas-operacao">{t("O que fazer")}</Label>
        <Select value={operacao} onValueChange={(v) => gravar({ operacao: v as typeof operacao, etiquetas })}>
          <SelectTrigger id="etiquetas-operacao">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="adicionar">{t("Adicionar etiquetas")}</SelectItem>
            <SelectItem value="remover">{t("Remover etiquetas")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="etiquetas-nova">{t("Etiquetas")}</Label>
        {etiquetas.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {etiquetas.map((e) => {
              const excluida = contemEtiqueta(excluidas, e);
              return (
                <li
                  key={e}
                  className="flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text"
                  data-excluida={excluida || undefined}
                  data-testid={`etiqueta-chip-${e}`}
                >
                  <span className={excluida ? "line-through opacity-60" : undefined}>{e}</span>
                  {excluida && <span className="text-[10px] text-error-fg">{t("etiqueta excluída")}</span>}
                  <button
                    type="button"
                    aria-label={`${t("Remover")} ${e}`}
                    className="text-text-muted hover:text-text"
                    onClick={() => gravar({ operacao, etiquetas: etiquetas.filter((x) => x !== e) })}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <ComboDeEtiquetas
          escolhidas={etiquetas}
          podeCriar={operacao === "adicionar"}
          maxLength={40}
          onAlternar={alternar}
          onRemoverUltima={() => gravar({ operacao, etiquetas: etiquetas.slice(0, -1) })}
        />
      </div>
      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
