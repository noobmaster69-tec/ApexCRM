/**
 * O que todo passo do assistente recebe do orquestrador: os valores, como
 * mudá-los e o erro (já traduzido) de cada campo — `undefined` enquanto o
 * passo ainda não foi conferido por "Continuar" ou "Salvar".
 */
import type { CampoComErro } from "./passos";
import type { ValoresDaCampanha } from "./valores";

export type MudarValores = (f: (atual: ValoresDaCampanha) => ValoresDaCampanha) => void;

export interface PropsDoPasso {
  v: ValoresDaCampanha;
  setV: MudarValores;
  erro: (campo: CampoComErro) => string | undefined;
}

/** Atalho: muda um campo só. */
export function mudarCampo(setV: MudarValores) {
  return <K extends keyof ValoresDaCampanha>(campo: K, valor: ValoresDaCampanha[K]) =>
    setV((a) => ({ ...a, [campo]: valor }));
}

/** O elemento que recebe o foco quando o campo tem erro: o próprio `id`, ou o primeiro controle dentro de `[data-campo]`. */
export function alvoDoCampo(campo: string): HTMLElement | null {
  const direto = document.getElementById(campo);
  const caixa = direto ?? document.querySelector<HTMLElement>(`[data-campo="${campo}"]`);
  if (!caixa) return null;
  if (caixa.matches("input, select, textarea, button, [contenteditable='true']")) return caixa;
  return caixa.querySelector<HTMLElement>("input, select, textarea, [contenteditable='true'], button") ?? caixa;
}
