"use client";
/**
 * Criar campanha (PRD §8) — o assistente é o mesmo do editar
 * (`_form/FormularioDaCampanha`). O primeiro salvamento automático cria o
 * rascunho; daí em diante a tela é a de editar.
 */
import { FormularioDaCampanha } from "../_form/FormularioDaCampanha";
import { valoresDaCampanha } from "../_form/valores";

export function NovaCampanha() {
  return <FormularioDaCampanha inicial={valoresDaCampanha()} />;
}
