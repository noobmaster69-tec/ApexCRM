/**
 * ESCOPOS DAS CONEXÕES MCP (migration 9923) — lista fechada, `recurso:ação`.
 *
 * O banco fecha a mesma lista no CHECK `mcp_connections_escopos_validos`; aqui
 * mora o que o banco não sabe: o papel mínimo de cada escopo (a MESMA régua da
 * tela e da API REST para aquele recurso), os perfis prontos e o resumo em
 * linguagem simples que o assistente mostra.
 *
 * PERMISSÃO EFETIVA = escopos da conexão ∩ papel ATUAL de quem a criou,
 * recalculada a cada chamada (`escoposEfetivos`). Nada é decidido pelo que
 * valia quando a conexão foi criada.
 */
import { ROLE_RANK, type Role } from "@/lib/auth/types";

export const ESCOPOS = [
  "contacts:read",
  "contacts:pii",
  "contacts:write",
  "leads:read",
  "leads:write",
  "pipelines:read",
  "tags:read",
  "tags:write",
  "flows:read",
  "flows:write",
  "campaigns:read",
  "conversations:read",
] as const;
export type Escopo = (typeof ESCOPOS)[number];

export function ehEscopo(valor: string): valor is Escopo {
  return (ESCOPOS as readonly string[]).includes(valor);
}

/**
 * O papel mínimo de cada escopo, espelho de quem pode fazer o mesmo pela tela:
 * contatos, negócios, funis, etiquetas e conversas são de atendimento (agent);
 * editar fluxo e ler campanha são de gestão (manager), como nas rotas REST
 * `followup-flows` e `campaigns`; ler fluxo é de qualquer pessoa da org.
 */
export const PAPEL_MINIMO: Record<Escopo, Role> = {
  "contacts:read": "agent",
  "contacts:pii": "agent",
  "contacts:write": "agent",
  "leads:read": "agent",
  "leads:write": "agent",
  "pipelines:read": "agent",
  "tags:read": "agent",
  "tags:write": "agent",
  "flows:read": "viewer",
  "flows:write": "manager",
  "campaigns:read": "manager",
  "conversations:read": "agent",
};

export const FERRAMENTAS_DE_DESTINO = ["claude_code", "claude_desktop", "cursor", "outra"] as const;
export type FerramentaDeDestino = (typeof FERRAMENTAS_DE_DESTINO)[number];

export const PERFIS = ["somente_leitura", "operacao_crm", "construtor_fluxos", "personalizado"] as const;
export type Perfil = (typeof PERFIS)[number];

const SOMENTE_LEITURA: readonly Escopo[] = [
  "contacts:read",
  "leads:read",
  "pipelines:read",
  "flows:read",
  "tags:read",
  "campaigns:read",
];

/**
 * Os perfis prontos. `conversations:read` (mensagens dos clientes) e
 * `contacts:pii` (telefone e e-mail) NÃO estão em nenhum: o primeiro só no
 * Personalizado, com aviso de LGPD; o segundo só com o interruptor de dados
 * pessoais ligado.
 */
export const ESCOPOS_DO_PERFIL: Record<Exclude<Perfil, "personalizado">, readonly Escopo[]> = {
  somente_leitura: SOMENTE_LEITURA,
  operacao_crm: [...SOMENTE_LEITURA, "leads:write", "tags:write"],
  construtor_fluxos: ["flows:read", "flows:write"],
};

export const VALIDADES_EM_DIAS = [30, 90, 180, 365] as const;
export type ValidadeEmDias = (typeof VALIDADES_EM_DIAS)[number];
export const VALIDADE_PADRAO: ValidadeEmDias = 90;

/**
 * Os escopos que a conexão GUARDA, a partir do que o assistente escolheu.
 * `contacts:pii` só entra com o interruptor de dados pessoais ligado E com
 * `contacts:read` junto — sozinho ele não significa nada.
 */
export function escoposDaConexao(perfil: Perfil, personalizados: readonly string[], mostrarDadosPessoais: boolean): Escopo[] {
  const base = perfil === "personalizado" ? personalizados.filter(ehEscopo) : [...ESCOPOS_DO_PERFIL[perfil]];
  const sem = base.filter((e) => e !== "contacts:pii");
  const comPii = mostrarDadosPessoais && sem.includes("contacts:read");
  return [...new Set<Escopo>(comPii ? [...sem, "contacts:pii"] : sem)].sort();
}

/** O que vale NESTA chamada: os escopos da conexão que o papel atual de quem a criou alcança. */
export function escoposEfetivos(
  escoposGuardados: readonly string[],
  papelAtual: Role,
  mostrarDadosPessoais: boolean,
): Set<Escopo> {
  const efetivos = new Set<Escopo>();
  for (const e of escoposGuardados) {
    if (!ehEscopo(e)) continue;
    if (ROLE_RANK[papelAtual] < ROLE_RANK[PAPEL_MINIMO[e]]) continue;
    efetivos.add(e);
  }
  if (!mostrarDadosPessoais || !efetivos.has("contacts:read")) efetivos.delete("contacts:pii");
  return efetivos;
}

/** O que nenhuma conexão faz, com qualquer escopo — a lista de bloqueio em palavras de gente. */
export const PROIBICOES_FIXAS = [
  "excluir",
  "publicar",
  "campanhas",
  "enviar",
  "em_massa",
  "segredos",
  "administracao",
  "outras_conexoes",
] as const;
export type ProibicaoFixa = (typeof PROIBICOES_FIXAS)[number];

export type ItemDoResumo = Escopo | ProibicaoFixa;

/**
 * A frase de cada item do resumo, num LITERAL só. A tela traduz por
 * `t(FRASE_DO_RESUMO[item])`: o resumo devolve CHAVES, nunca frases montadas,
 * para a tradução partir de um texto escrito no código (a catraca
 * `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` lê esta tabela).
 */
export const FRASE_DO_RESUMO: Record<ItemDoResumo, string> = {
  "contacts:read": "ler contatos",
  "contacts:pii": "ver telefone e e-mail dos contatos",
  "contacts:write": "criar e editar contatos",
  "leads:read": "ler negócios",
  "leads:write": "criar e editar negócios e mover de etapa",
  "pipelines:read": "ler funis e etapas",
  "tags:read": "ler etiquetas",
  "tags:write": "adicionar e remover etiquetas",
  "flows:read": "ler fluxos",
  "flows:write": "editar fluxos em rascunho",
  "campaigns:read": "ler campanhas e métricas",
  "conversations:read": "ler mensagens das conversas",
  excluir: "excluir contatos, negócios, fluxos ou etiquetas",
  publicar: "publicar fluxos",
  campanhas: "iniciar ou pausar campanhas",
  enviar: "enviar mensagens aos clientes",
  em_massa: "importar ou exportar contatos, ou alterar em lote",
  segredos: "ver credenciais, chaves de API, segredos ou webhooks",
  administracao: "ver usuários, convites, papéis, faturamento ou configurações de segurança",
  outras_conexoes: "criar, ver ou alterar outras conexões MCP",
};

export function resumoDosEscopos(escopos: readonly Escopo[]): { pode: Escopo[]; naoPode: ItemDoResumo[] } {
  const tem = new Set(escopos);
  return {
    pode: ESCOPOS.filter((e) => tem.has(e)),
    naoPode: [...ESCOPOS.filter((e) => !tem.has(e)), ...PROIBICOES_FIXAS],
  };
}

export function descricaoDoEscopo(e: Escopo): string {
  return FRASE_DO_RESUMO[e];
}
