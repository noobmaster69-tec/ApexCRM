/**
 * O texto que vai para a pessoa.
 *
 * ═══ O vocabulário não é novo ═══
 *
 * `{{nome}}` e `{{primeiro_nome}}` são as MESMAS variáveis de
 * `lib/inbox/template-vars.ts`. Campanha não inventa vocabulário próprio: quem
 * aprendeu a escrever template no Inbox escreve igual aqui. A única que a
 * campanha acrescenta é `{{saudacao}}`, que sai do relógio.
 *
 * ═══ Por que `{{saudacao}}` é resolvida no ENVIO, e não na preparação ═══
 *
 * A janela de envio cobre o dia inteiro e a campanha anda devagar de propósito.
 * Um "Bom dia!" cravado no texto (ou congelado às 9h) chega às 16h dizendo bom
 * dia — numa mensagem que se apresenta como alguém escrevendo, isso denuncia o
 * disparo automático na primeira palavra, que é o que a lista não perdoa. Foi o
 * defeito do primeiro piloto desta feature.
 *
 * ═══ Por que variável sem valor PULA a pessoa ═══
 *
 * "Olá , tudo bem?" é pior que não mandar: é a mesma denúncia, com o agravante
 * de ir para um contato que se queima uma vez só. O renderizador devolve o que
 * faltou e quem chama decide — na preparação vira exclusão visível
 * (`variavel_ausente`), com o operador vendo o número antes de apertar.
 *
 * Sem `eval`, sem HTML, sem travessia de propriedade: é `replace` sobre um mapa
 * fechado de resolvedores.
 */

import { horaNoFuso } from "./relogio";
import { chaveCanonica, VARIAVEIS_DO_SISTEMA } from "@/lib/variables/sistema";
import {
  BURACO,
  ehVariavelConhecida,
  limparPontuacaoOrfa,
  partesDoToken,
  resolverVariavel,
  TOKEN_DE_VARIAVEL,
  VARIAVEIS_DE_TEMPO,
} from "@/lib/variables/resolve";

/** As variáveis que existem. Oferecer uma que não resolve é prometer dado que não há. */
/**
 * As variáveis que a tela de campanha oferece: as do SISTEMA (lib/variables) —
 * os nomes antigos `nome`, `primeiro_nome` e `saudacao` continuam valendo
 * (aliases). As personalizadas da organização entram por `personalizadas`.
 */
export const VARIAVEIS_DA_CAMPANHA = VARIAVEIS_DO_SISTEMA.map((v) => v.chave);

export type VariavelDaCampanha = string;

export const DESCRICAO_DA_VARIAVEL: Record<string, string> = Object.fromEntries(
  VARIAVEIS_DO_SISTEMA.map((v) => [v.chave, v.descricao]),
);

/** As duas raízes de campo personalizado do oficial: `{{lead.x}}` e `{{contato.x}}`. */
export const RAIZES_DE_CAMPO = ["lead", "contato"] as const;

/** Os campos personalizados de um lado só — jsonb lido do banco, nunca percorrido além do próprio mapa. */
export type CamposPersonalizados = Readonly<Record<string, unknown>>;

export interface ValoresDoDestinatario {
  nome: string | null;
  /** `{{lead.x}}` — campos do negócio. Sem mapa (contato sem negócio), a variável FALTA. */
  lead?: CamposPersonalizados | null;
  /** `{{contato.x}}` — campos do contato (os mesmos de `campos`, pela raiz explícita). */
  contato?: CamposPersonalizados | null;
  telefone?: string | null;
  email?: string | null;
  /** `contacts.custom_fields` do destinatário (dados importados e variáveis personalizadas). */
  campos?: Record<string, unknown>;
  /** Chaves das variáveis personalizadas DEFINIDAS na organização (9013) — sem valor vira "faltando". */
  personalizadas?: readonly string[];
  /** Valores padrão das personalizadas (chave → valor). */
  padroes?: Record<string, string>;
  /** `contacts.locale` / `source` / `last_activity_at` e a campanha que envia. */
  locale?: string | null;
  origem?: string | null;
  ultimaInteracao?: string | null;
  campanhaId?: string | null;
}

export interface TextoRenderizado {
  texto: string;
  /** Variáveis usadas no texto que não tinham valor. Vazio = pode enviar. */
  faltando: string[];
  /** Tokens que não são variáveis conhecidas — ficam literais, como no Inbox. */
  desconhecidas: string[];
}

/**
 * Monta o texto da campanha. Aceita `{{chave}}` e `{chave}`.
 *
 * - Variável de TEMPO (saudação, dia, data) sem instante (prévia/preparação)
 *   fica literal e não é falta: quem resolve é o envio, no relógio do contato.
 * - Variável conhecida sem valor fica literal e entra em `faltando` — a
 *   campanha não manda mensagem com buraco.
 * - Token desconhecido fica literal e entra em `desconhecidas`.
 */
export function renderizar(
  template: string,
  valores: ValoresDoDestinatario,
  quando?: { agora: Date; fuso: string; idioma?: string },
): TextoRenderizado {
  const faltando = new Set<string>();
  const desconhecidas = new Set<string>();
  const campos = valores.campos ?? {};
  const personalizadas = new Set(valores.personalizadas ?? []);
  const ctx = {
    nome: valores.nome,
    telefone: valores.telefone ?? null,
    email: valores.email ?? null,
    campos,
    padroes: valores.padroes,
    locale: valores.locale ?? null,
    origem: valores.origem ?? null,
    ultimaInteracao: valores.ultimaInteracao ?? null,
    campanhaId: valores.campanhaId ?? null,
    quando,
  };
  let apagou = false;

  const texto = template.replace(TOKEN_DE_VARIAVEL, (literal, ...grupos: (string | undefined)[]) => {
    const partes = partesDoToken([literal, ...grupos]);
    const nome = partes.nome;
    // A reserva do oficial vem entre aspas (`{{primeiro_nome|"aluno"}}`); a do
    // fork, sem (`{primeiro_nome|aluno}`). As duas querem dizer o mesmo.
    const alternativo = partes.alternativo === null ? null : semAspas(partes.alternativo);
    // `{{lead.x}}` / `{{contato.x}}` (oficial): campo personalizado pela raiz.
    const raiz = raizDeCampo(nome);
    if (raiz) {
      const mapa = raiz === "lead" ? valores.lead : (valores.contato ?? campos);
      const valor = lerCampo(mapa, nomeDoCampo(nome));
      if (valor !== null) return blindar(valor);
      if (alternativo !== null) {
        if (alternativo !== "") return alternativo;
        apagou = true;
        return BURACO;
      }
      faltando.add(nome.toLowerCase());
      return literal;
    }
    const sistema = chaveCanonica(nome);
    if (sistema && VARIAVEIS_DE_TEMPO.has(sistema) && !quando) return literal;
    const conhecida = ehVariavelConhecida(nome, personalizadas, campos);
    const v = conhecida ? resolverVariavel(nome, ctx) : "";
    if (v !== "") return sistema && VARIAVEIS_DE_TEMPO.has(sistema) ? v : blindar(v);
    if (!conhecida) desconhecidas.add(nome);
    // `{x|texto}`: o alternativo é o fallback SEGURO escrito por quem fez o texto.
    if (alternativo !== null) {
      if (alternativo !== "") return alternativo;
      apagou = true;
      return BURACO;
    }
    if (conhecida) faltando.add(sistema ? nome.toLowerCase() : nome);
    return literal;
  });

  const limpo = apagou ? limparPontuacaoOrfa(texto) : texto;
  // A renderização com instante é a FINAL (envio e envio de teste): só aqui a
  // blindagem sai. Sem instante (preparação), ela fica no corpo congelado e
  // protege o valor da segunda passada que o envio faz — ver `blindar`.
  const final = quando ? limpo.replaceAll(CHAVE_BLINDADA, "{") : limpo;
  return { texto: final, faltando: [...faltando], desconhecidas: [...desconhecidas] };
}

/**
 * Valor do cadastro entra no texto como DADO, nunca como template (oficial).
 *
 * O corpo é renderizado DUAS vezes: na preparação (nome e campos, congelados em
 * `rendered_body`) e no envio (`rodada.ts`, pela saudação). Um campo com
 * `{{saudacao}} {{nome}}` dentro seria lido na segunda passada como token. O
 * WORD JOINER depois de cada `{` faz o token não casar, é invisível, e a
 * renderização final o tira.
 */
const CHAVE_BLINDADA = "{\u2060";

function blindar(valor: string): string {
  return valor.replaceAll("{", CHAVE_BLINDADA);
}

function semAspas(texto: string): string {
  const t = texto.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/** Nomes que um jsonb pode trazer gravados e que NÃO são campo nenhum. */
const CHAVES_DE_PROTOTIPO = new Set(["__proto__", "constructor", "prototype"]);

/** `lead.gancho` → `lead`; `{{lead}}` (sem campo) → `null`. */
function raizDeCampo(bruto: string): (typeof RAIZES_DE_CAMPO)[number] | null {
  const ponto = bruto.indexOf(".");
  if (ponto <= 0) return null;
  const raiz = bruto.slice(0, ponto).toLowerCase();
  return (RAIZES_DE_CAMPO as readonly string[]).includes(raiz) ? (raiz as (typeof RAIZES_DE_CAMPO)[number]) : null;
}

/** `lead.custom_fields.gancho` e `lead.gancho` são o MESMO campo. */
function nomeDoCampo(bruto: string): string {
  const depois = bruto.slice(bruto.indexOf(".") + 1);
  return /^custom_fields\./i.test(depois) ? depois.slice("custom_fields.".length) : depois;
}

/** Só PROPRIEDADE PRÓPRIA do mapa; lista sai separada por vírgula; objeto vira falta. */
function lerCampo(mapa: CamposPersonalizados | null | undefined, campo: string): string | null {
  if (!mapa || typeof mapa !== "object") return null;
  if (campo === "" || CHAVES_DE_PROTOTIPO.has(campo)) return null;
  const chave = Object.hasOwn(mapa, campo)
    ? campo
    : Object.hasOwn(mapa, campo.toLowerCase())
      ? campo.toLowerCase()
      : null;
  if (chave === null) return null;
  const valor = (mapa as Record<string, unknown>)[chave];
  let texto = "";
  if (Array.isArray(valor)) {
    texto = valor
      .filter((v) => v !== null && v !== undefined && typeof v !== "object")
      .map((v) => String(v))
      .join(", ");
  } else if (valor !== null && valor !== undefined && typeof valor !== "object") {
    texto = String(valor);
  }
  return texto.trim() === "" ? null : texto;
}

/**
 * O corpo usa campo personalizado de cada raiz? (oficial) — a consulta de
 * audiência só puxa `custom_fields` quando o texto pede.
 */
export function camposUsadosNoTexto(template: string): { lead: boolean; contato: boolean } {
  let lead = false;
  let contato = false;
  for (const m of template.matchAll(TOKEN_DE_VARIAVEL)) {
    const raiz = raizDeCampo(partesDoToken(m).nome);
    if (raiz === "lead") lead = true;
    if (raiz === "contato") contato = true;
  }
  return { lead, contato };
}

/** As variáveis do SISTEMA que o texto usa (como escritas), sem repetir. */
export function variaveisUsadas(template: string): string[] {
  const achadas = new Set<string>();
  for (const m of template.matchAll(TOKEN_DE_VARIAVEL)) {
    const chave = partesDoToken(m).nome.toLowerCase();
    if (chaveCanonica(chave) || raizDeCampo(chave)) achadas.add(chave);
  }
  return [...achadas];
}

export function saudacaoDaHora(agora: Date, fuso: string): string {
  const hora = horaNoFuso(agora, fuso);
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}
