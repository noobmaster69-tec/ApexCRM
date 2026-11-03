/**
 * A LISTA DE BLOQUEIO das conexões MCP v1 — o que NUNCA sai por `/api/mcp`,
 * qualquer que seja o perfil, o escopo ou o papel de quem criou a conexão.
 *
 * Ela não é configuração: é fixa no código, e um teste
 * (`tests/unit/mcp-v1-bloqueio.test.ts`) confere o catálogo inteiro contra ela
 * — os recursos que cada ferramenta declara, o nome de cada ferramenta e o
 * texto dos arquivos de `lib/mcp/v1/`. Ferramenta nova que tocar qualquer coisa
 * daqui reprova o CI antes de chegar a um cliente.
 *
 * Duas famílias:
 *   1. DADOS que não saem: segredos, outras organizações, cobrança, gente e
 *      papéis, segurança, os próprios tokens MCP, auditoria e logs, SQL livre,
 *      storage livre e os prompts dos agentes.
 *   2. AÇÕES irreversíveis ou em massa: apagar, publicar fluxo, disparar ou
 *      pausar campanha, enviar mensagem, importar, exportar, editar em lote.
 *      Ficam para uma fase seguinte, com confirmação humana na tela.
 */

/** Tabelas e áreas que nenhuma ferramenta pode declarar nem citar. */
export const RECURSOS_BLOQUEADOS: readonly string[] = [
  // credenciais e segredos
  "api_tokens",
  "webhook_sources",
  "webhook_endpoints",
  "channel_sessions",
  "ai_provider_keys",
  "integration_credentials",
  "secrets",
  // cobrança e administração da instalação
  "billing",
  "subscriptions",
  "platform_admins",
  "platform_branding",
  // gente, convites e papéis
  "user_organizations",
  "organization_invites",
  "invites",
  "auth.users",
  "profiles",
  // segurança
  "organizations.settings.security",
  "mfa",
  // os próprios tokens MCP
  "mcp_connections",
  "mcp_oauth_clients",
  "mcp_oauth_codes",
  "mcp_oauth_tokens",
  "mcp_call_log",
  // auditoria e logs do sistema
  "api_audit_log",
  "event_log",
  "ai_agent_runs",
  // SQL e storage livres
  "rpc",
  "sql",
  "storage",
  // prompts dos agentes
  "ai_agents",
  "ai_agent_prompts",
];

/**
 * Verbos de ação que o catálogo não tem: irreversível ou em massa. Conferidos
 * contra o NOME de cada ferramenta.
 */
export const ACOES_BLOQUEADAS: readonly string[] = [
  "delete",
  "remove_contact",
  "archive",
  "publish",
  "send",
  "start",
  "pause",
  "resume",
  "cancel",
  "import",
  "export",
  "bulk",
  "batch",
  "merge",
  "anonymize",
  "sql",
  "query",
];

/**
 * Nomes de tabela que não podem nem APARECER no código de `lib/mcp/v1/`
 * (fora deste arquivo e das peças de infraestrutura que guardam a própria
 * conexão). É a defesa contra uma ferramenta que declara um recurso e lê outro.
 */
export const TABELAS_PROIBIDAS_NO_CODIGO: readonly string[] = [
  "api_tokens",
  "webhook_sources",
  "channel_sessions",
  "user_organizations",
  "organization_invites",
  "api_audit_log",
  "event_log",
  "ai_agents",
  "platform_admins",
  "storage.from",
  ".rpc(",
];

/** Arquivos de `lib/mcp/v1/` que cuidam da conexão — eles podem citar as próprias tabelas. */
export const ARQUIVOS_DE_INFRAESTRUTURA: readonly string[] = [
  "bloqueio.ts",
  "conexao.ts",
  "registro.ts",
  "avisos.ts",
  "oauth.ts",
  "conexoes.ts",
];

export interface ViolacaoDoBloqueio {
  ferramenta: string;
  motivo: string;
}

/** Confere um catálogo contra a lista. Vazio = nenhuma violação. */
export function violacoesDoCatalogo(
  catalogo: ReadonlyArray<{ nome: string; escopo: unknown; recursos: readonly string[] }>,
): ViolacaoDoBloqueio[] {
  const violacoes: ViolacaoDoBloqueio[] = [];
  const nomes = new Set<string>();
  for (const f of catalogo) {
    if (nomes.has(f.nome)) violacoes.push({ ferramenta: f.nome, motivo: "nome repetido" });
    nomes.add(f.nome);
    if (typeof f.escopo !== "string" || f.escopo.length === 0) {
      violacoes.push({ ferramenta: f.nome, motivo: "sem escopo único" });
    }
    if (f.recursos.length === 0) violacoes.push({ ferramenta: f.nome, motivo: "não declara recursos" });
    for (const r of f.recursos) {
      const bloqueado = RECURSOS_BLOQUEADOS.find((b) => r === b || r.startsWith(`${b}.`));
      if (bloqueado) violacoes.push({ ferramenta: f.nome, motivo: `recurso bloqueado: ${bloqueado}` });
    }
    const partes = f.nome.toLowerCase().split("_");
    for (const acao of ACOES_BLOQUEADAS) {
      const pedacos = acao.split("_");
      const casa = partes.some((_, i) => pedacos.every((p, j) => partes[i + j] === p));
      if (casa) violacoes.push({ ferramenta: f.nome, motivo: `ação bloqueada: ${acao}` });
    }
  }
  return violacoes;
}
