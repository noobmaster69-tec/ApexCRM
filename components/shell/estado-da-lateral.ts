"use client";

import { useCallback, useEffect, useState } from "react";

import { gravarLateral } from "@/app/actions/shell/gravarLateral";

/**
 * Lateral expandida (248px) ou recolhida (68px).
 *
 * A escolha da pessoa mora no `localStorage` (lido e escrito em try/catch: em
 * janela anônima ou com o armazenamento bloqueado, vale o padrão da largura) e
 * é espelhada num cookie, que o servidor lê para a casca já nascer no tamanho
 * certo. Sem escolha salva, quem decide é a largura da janela: ≥1280px
 * expandida, 1024–1279px recolhida (abaixo de 1024 a lateral vira gaveta).
 */
export type PreferenciaDaLateral = "expandida" | "recolhida";

export const CHAVE_DA_LATERAL = "lateral-recolhida";
/**
 * A preferência do CONSTRUTOR DE FLUXO, separada da geral: lá a lateral nasce
 * recolhida para dar espaço ao canvas, e expandir num fluxo não mexe nas outras
 * telas (nem o contrário). Só `localStorage` — o servidor não a lê.
 */
export const CHAVE_DA_LATERAL_DO_CONSTRUTOR = "sidebar-collapsed:builder";
/** Faixa em que, sem escolha salva, a lateral nasce recolhida. */
export const FAIXA_RECOLHIDA = "(min-width: 1024px) and (max-width: 1279.98px)";

export function lerPreferenciaDaLateral(): PreferenciaDaLateral | null {
  try {
    const v = window.localStorage.getItem(CHAVE_DA_LATERAL);
    return v === "expandida" || v === "recolhida" ? v : null;
  } catch {
    return null;
  }
}

function gravarPreferencia(p: PreferenciaDaLateral): void {
  try {
    window.localStorage.setItem(CHAVE_DA_LATERAL, p);
  } catch {
    // Sem armazenamento: a escolha vale até recarregar.
  }
  void gravarLateral(p === "recolhida").catch(() => {});
}

/** `true` = recolhida, que é o padrão do construtor quando nada foi salvo. */
export function lerLateralDoConstrutor(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DA_LATERAL_DO_CONSTRUTOR) !== "false";
  } catch {
    return true;
  }
}

function gravarLateralDoConstrutor(recolhida: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_DA_LATERAL_DO_CONSTRUTOR, String(recolhida));
  } catch {
    // Sem armazenamento: a escolha vale até recarregar.
  }
}

export function useLateralDoConstrutor(): { recolhida: boolean; alternar: () => void } {
  const [recolhida, setRecolhida] = useState(true);
  useEffect(() => setRecolhida(lerLateralDoConstrutor()), []);
  const alternar = useCallback(() => {
    setRecolhida((atual) => {
      gravarLateralDoConstrutor(!atual);
      return !atual;
    });
  }, []);
  return { recolhida, alternar };
}

export function useLateral(inicial: PreferenciaDaLateral | null): {
  recolhida: boolean;
  /** `true` enquanto não há escolha salva — a largura da janela decide. */
  automatica: boolean;
  alternar: () => void;
} {
  const [preferencia, setPreferencia] = useState<PreferenciaDaLateral | null>(inicial);
  const [faixaRecolhida, setFaixaRecolhida] = useState(false);

  useEffect(() => {
    const salva = lerPreferenciaDaLateral();
    if (salva) setPreferencia(salva);
    const mq = window.matchMedia(FAIXA_RECOLHIDA);
    const medir = () => setFaixaRecolhida(mq.matches);
    medir();
    mq.addEventListener("change", medir);
    return () => mq.removeEventListener("change", medir);
  }, []);

  const recolhida = preferencia ? preferencia === "recolhida" : faixaRecolhida;
  const alternar = useCallback(() => {
    const nova: PreferenciaDaLateral = recolhida ? "expandida" : "recolhida";
    setPreferencia(nova);
    gravarPreferencia(nova);
  }, [recolhida]);

  return { recolhida, automatica: preferencia === null, alternar };
}
