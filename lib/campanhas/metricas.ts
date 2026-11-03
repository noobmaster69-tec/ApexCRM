/**
 * O DESEMPENHO da campanha — a régua que diz se a lista presta.
 *
 * ═══ Por que o funil é contado por CARIMBO, e não por status ═══
 *
 * `status` é um valor só, e o destinatário que respondeu vale `replied` — mas
 * ele também foi entregue e lido. Contar por status faria a taxa de entrega cair
 * quando a campanha vai BEM, porque quem respondeu sairia da conta de entregues.
 * Os carimbos (`sent_at`, `delivered_at`, `read_at`, `replied_at`) são
 * cumulativos e não se apagam: é deles que o funil sai.
 *
 * ═══ Por que não existe "taxa de sucesso" ═══
 *
 * Cada degrau tem uma causa diferente, e misturá-los apaga exatamente a
 * distinção que diz o que consertar:
 *
 *   caiu de enviada para entregue → número inválido: a LISTA está suja;
 *   caiu de entregue para lida    → a primeira linha não interessou: a COPY;
 *   caiu de lida para respondida  → leu e ignorou: a OFERTA, ou o público.
 *
 * ═══ Por que o excluído fica fora do denominador ═══
 *
 * Quem foi pulado nunca entrou na corrida. Somá-lo faria uma lista cheia de
 * bloqueados parecer campanha de baixa entrega — dois problemas diferentes num
 * número só.
 */

export interface ContagemDaCampanha {
  /** Linhas do snapshot, elegíveis ou não. */
  total: number;
  elegiveis: number;
  excluidos: number;

  /** Ainda por despachar. */
  pendentes: number;
  naFila: number;
  enviando: number;

  /** Cumulativos, por carimbo. */
  enviados: number;
  entregues: number;
  lidos: number;
  responderam: number;

  falharam: number;
  cancelados: number;
  optOut: number;
}

export interface TaxasDaCampanha {
  entrega: number | null;
  leitura: number | null;
  resposta: number | null;
  falha: number | null;
  optOut: number | null;
}

/** Divisão que não mente: sem denominador, a taxa é `null`, nunca 0. */
function taxa(numerador: number, denominador: number): number | null {
  if (denominador <= 0) return null;
  return numerador / denominador;
}

/**
 * Os denominadores, declarados — a Spec 12 §19.2 exige que sejam visíveis:
 *
 *   entrega  = entregues / enviados        (dos que saíram, quantos chegaram)
 *   leitura  = lidos     / entregues       (dos que chegaram, quantos abriram)
 *   resposta = responderam / enviados      (do esforço total, quantos falaram)
 *   falha    = falharam  / tentados        (tentado = saiu OU falhou)
 *   optOut   = optOut    / enviados
 */
export function taxasDaCampanha(c: ContagemDaCampanha): TaxasDaCampanha {
  const tentados = c.enviados + c.falharam;
  return {
    entrega: taxa(c.entregues, c.enviados),
    leitura: taxa(c.lidos, c.entregues),
    resposta: taxa(c.responderam, c.enviados),
    falha: taxa(c.falharam, tentados),
    optOut: taxa(c.optOut, c.enviados),
  };
}

/**
 * Quanto da fila já andou, de 0 a 1.
 *
 * Denominador é o ELEGÍVEL, não o total: quem foi excluído na preparação nunca
 * vai andar, e deixá-lo no denominador travaria a barra num teto que a campanha
 * jamais alcança — a leitura errada seria "está travada", quando está pronta.
 */
export function progresso(c: ContagemDaCampanha): number {
  // Lista ainda não montada é 0%, nunca 100%. Medido na tela: o rascunho recém
  // criado mostrava "Progresso 100%" antes de existir um destinatário sequer —
  // a leitura errada é "já acabou", justamente em quem nunca começou.
  if (c.total <= 0) return 0;
  // Preparada e com ninguém elegível: não há o que andar, e a barra cheia é a
  // leitura certa — a campanha terminou antes de começar.
  if (c.elegiveis <= 0) return 1;
  // CANCELADO conta como restante, e não como andado. Medido na tela: uma
  // campanha cancelada sem ter enviado nada mostrava "100%", que se lê como
  // "terminou de enviar" — o oposto do que aconteceu. Quem foi cancelado não
  // andou a fila, saiu dela.
  const restantes = c.pendentes + c.naFila + c.enviando + c.cancelados;
  return Math.min(1, Math.max(0, (c.elegiveis - restantes) / c.elegiveis));
}

/** A linha de destinatário com o que a contagem lê (seis carimbos, sem PII). */
export interface LinhaDaContagem {
  status: string;
  eligibility_status: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  opted_out_at: string | null;
}

export const COLUNAS_DA_CONTAGEM =
  "status, eligibility_status, sent_at, delivered_at, read_at, replied_at, opted_out_at";

/**
 * O funil contado por CARIMBO, e não por `status` (ver o cabeçalho de
 * `app/api/v1/campaigns/[id]/metrics/route.ts`). Num lugar só para a rota e
 * para a ferramenta MCP `get_campaign`.
 */
export function contagemDasLinhas(linhas: readonly LinhaDaContagem[]): ContagemDaCampanha {
  return {
    total: linhas.length,
    elegiveis: linhas.filter((l) => l.eligibility_status === "eligible").length,
    excluidos: linhas.filter((l) => l.eligibility_status === "excluded").length,
    pendentes: linhas.filter((l) => l.status === "pending").length,
    naFila: linhas.filter((l) => l.status === "queued").length,
    enviando: linhas.filter((l) => l.status === "sending").length,
    enviados: linhas.filter((l) => l.sent_at !== null).length,
    entregues: linhas.filter((l) => l.delivered_at !== null).length,
    lidos: linhas.filter((l) => l.read_at !== null).length,
    responderam: linhas.filter((l) => l.replied_at !== null).length,
    falharam: linhas.filter((l) => l.status === "failed").length,
    cancelados: linhas.filter((l) => l.status === "cancelled").length,
    optOut: linhas.filter((l) => l.opted_out_at !== null).length,
  };
}
