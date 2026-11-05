/**
 * OS CINCO PASSOS da campanha (fork jhoow, redesenho de nov/2026) — regra pura,
 * sem tela: o que cada passo exige, a mensagem de cada erro, quando o passo
 * está "Pronto" e o corpo do salvamento automático do rascunho.
 *
 * "Pronto" é o passo com os campos obrigatórios válidos, não o passo visitado:
 * a campanha aberta para editar já nasce com os passos marcados.
 */
import { errosDoRitmo, type ErroDoRitmo } from "@/components/campanhas/CamposDeRitmo";

import {
  corpoDaCampanha,
  temCriterio,
  type ContextoDoCanal,
  type ValoresDaCampanha,
} from "./valores";

export const PASSOS = [1, 2, 3, 4, 5] as const;
export type Passo = (typeof PASSOS)[number];

export const TITULO_DO_PASSO: Record<Passo, string> = {
  1: "Informações",
  2: "Público",
  3: "Mensagem",
  4: "Funil",
  5: "Ritmo",
};

/** Os campos que podem ter erro — cada um é o `id` do elemento que recebe o foco. */
export type CampoComErro =
  | "nome"
  | "canal"
  | "lia"
  | "criterio"
  | "lista"
  | "limite"
  | "texto"
  | "fluxo"
  | "modelo"
  | "idioma"
  | "inicio"
  | "fuso"
  | "janela"
  | "cota"
  | "intervalo";

export const TEXTO_DO_ERRO: Record<CampoComErro, string> = {
  nome: "Dê um nome à campanha.",
  canal: "Escolha o número que vai enviar.",
  lia: "Informe a referência da avaliação (LIA).",
  criterio: "Escolha pelo menos um critério de público.",
  lista: "Suba uma planilha ou escolha uma lista salva.",
  limite: "O máximo de contatos vai de 1 a 5.000.",
  texto: "Escreva a mensagem.",
  fluxo: "Escolha o fluxo que a campanha vai iniciar.",
  modelo: "Escolha o modelo aprovado e complete as variáveis.",
  idioma: "Use o formato pt-PT, es ou en.",
  inicio: "Escolha uma data e uma hora no futuro.",
  fuso: "Fuso horário desconhecido.",
  janela: "A janela diária de envio é obrigatória: início e fim (HH:mm), com o fim depois do início.",
  cota: "Informe quantos contatos chamar (1 ou mais) e o período.",
  intervalo: "O intervalo mínimo é de pelo menos 10 segundos, e o máximo não pode ser menor que o mínimo.",
};

/** O erro do ritmo vai para o campo que o causa. */
const CAMPO_DO_RITMO: Record<ErroDoRitmo, CampoComErro> = {
  minimo: "intervalo",
  maximo: "intervalo",
  fuso: "fuso",
  janela: "janela",
  cota: "cota",
  cota_acima: "cota",
  agenda_sem_fuso: "fuso",
  agenda_invalida: "inicio",
  agenda_passado: "inicio",
};

export const IDIOMA_VALIDO = /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/;

export type ErrosDoPasso = Partial<Record<CampoComErro, string>>;

/**
 * Os erros de um passo. A mensagem do ritmo é a frase exata de
 * `TEXTO_DO_ERRO_DO_RITMO` (a tela a traduz pela tabela); as outras, de
 * `TEXTO_DO_ERRO`.
 */
export function errosDoPasso(
  passo: Passo,
  v: ValoresDaCampanha,
  canal: ContextoDoCanal,
  agora: Date = new Date(),
): Array<{ campo: CampoComErro; ritmo?: ErroDoRitmo }> {
  const erros: Array<{ campo: CampoComErro; ritmo?: ErroDoRitmo }> = [];
  if (passo === 1) {
    if (!v.nome.trim()) erros.push({ campo: "nome" });
    if (!v.canal) erros.push({ campo: "canal" });
    if (v.baseLegal === "legitimate_interest" && !v.liaRef.trim()) erros.push({ campo: "lia" });
  }
  if (passo === 2) {
    if (v.fonte === "importacao" && !v.listaImportada) erros.push({ campo: "lista" });
    else if (!temCriterio(v)) erros.push({ campo: "criterio" });
    const n = Number(v.limite);
    if (!(Number.isInteger(n) && n >= 1 && n <= 5000)) erros.push({ campo: "limite" });
  }
  if (passo === 3) {
    if (v.modo === "flow") {
      if (!v.fluxo) erros.push({ campo: "fluxo" });
    } else if (canal.ehOficial) {
      if (!canal.modeloPronto) erros.push({ campo: "modelo" });
    } else if (!v.texto.trim()) erros.push({ campo: "texto" });
    if (v.idioma.trim() && !IDIOMA_VALIDO.test(v.idioma.trim())) erros.push({ campo: "idioma" });
  }
  if (passo === 5) {
    const vistos = new Set<CampoComErro>();
    for (const e of errosDoRitmo(v, agora)) {
      const campo = CAMPO_DO_RITMO[e];
      if (vistos.has(campo)) continue;
      vistos.add(campo);
      erros.push({ campo, ritmo: e });
    }
  }
  return erros;
}

export function passoPronto(passo: Passo, v: ValoresDaCampanha, canal: ContextoDoCanal, agora?: Date): boolean {
  return errosDoPasso(passo, v, canal, agora).length === 0;
}

/** As variáveis `{assim}` do texto, sem repetir e sem o texto de reserva (`{nome|amigo}` → `nome`). */
export function variaveisDoTexto(texto: string): string[] {
  const vistas = new Set<string>();
  for (const m of texto.matchAll(/\{\{?\s*([a-zA-Z0-9_.]+)\s*(?:\|[^}]*)?\}?\}/g)) {
    if (m[1]) vistas.add(m[1]);
  }
  return [...vistas];
}

/**
 * O corpo do SALVAMENTO AUTOMÁTICO: o mesmo de "Salvar", sem o que ainda não
 * passa na validação do servidor — o rascunho guarda o que já está certo e
 * não recusa o resto. `null` = ainda não dá para criar o rascunho (falta o
 * nome, o número ou a LIA).
 */
export function corpoDoRascunho(
  v: ValoresDaCampanha,
  canal: ContextoDoCanal,
  agora: Date = new Date(),
): Record<string, unknown> | null {
  if (!v.nome.trim() || !v.canal) return null;
  if (v.baseLegal === "legitimate_interest" && !v.liaRef.trim()) return null;
  const corpo = corpoDaCampanha(v, canal);
  if (!temCriterio(v) || errosDoPasso(2, v, canal).some((e) => e.campo === "limite")) delete corpo.audience_filter;
  if (v.modo === "flow" && !v.fluxo) {
    delete corpo.mode;
    delete corpo.flow_id;
  }
  if (canal.ehOficial && v.modo !== "flow" && !canal.modeloPronto) {
    delete corpo.message_mode;
    delete corpo.provider_template_name;
    delete corpo.provider_template_language;
    delete corpo.provider_template_variables;
    delete corpo.velocidade;
  }
  if (v.idioma.trim() && !IDIOMA_VALIDO.test(v.idioma.trim())) delete corpo.language;
  if (errosDoRitmo(v, agora).length > 0) {
    for (const k of [
      "intervalo_segundos",
      "janela_inicio_minuto",
      "janela_fim_minuto",
      "janela_inicio_hora",
      "janela_fim_hora",
      "cota_quantidade",
      "cota_periodo",
      "scheduled_at",
      "teto_diario",
      "teto_horario",
      "min_interval_seconds",
      "max_interval_seconds",
      "timezone",
    ]) {
      delete corpo[k];
    }
  }
  return corpo;
}
