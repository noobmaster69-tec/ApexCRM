# Conexões MCP seguras

> Migration 9023. Tela: **Configurações › Conexões MCP** (`/app/settings/integracoes/mcp`), só admin.
> Código: `lib/mcp/v1/`. Endpoint: `/api/mcp` (o mesmo servidor MCP de antes, endurecido).

## O que é

Uma conexão MCP deixa uma ferramenta de IA (Claude Code, Claude Desktop/claude.ai,
Cursor, outra) ler e, quando liberado, editar partes do CRM — sempre em nome de quem
criou a conexão e nunca além do papel atual dessa pessoa.

## Duas credenciais, um servidor

| Credencial | Quem usa | Regras |
|---|---|---|
| `apx_mcp_…` (token) / `apx_oat_…` (OAuth) | as conexões desta tela | tudo deste documento |
| `dsk_…` (Tokens de API) | integrações de servidor e o harness dos agentes | o caminho de antes, **sem mudança** |

Os tokens `dsk_` não foram cortados porque integrações e specs e2e dependem deles
(regra "não remover funcionalidade"). Recomendação: migrar o uso de IA para conexões
MCP e, numa fase seguinte, restringir o `dsk_` em `/api/mcp`.

## Autenticação

- Só `Authorization: Bearer`. Credencial em query string → 400. `Origin` de navegador
  diferente do `NEXT_PUBLIC_APP_URL` → 403.
- Token: `apx_mcp_` + 32 bytes aleatórios (base64url). No banco, só o SHA-256 (índice
  único), conferido em tempo constante. Mostrado uma vez.
- OAuth 2.1 (Claude Desktop/claude.ai): `/.well-known/oauth-protected-resource` e
  `/.well-known/oauth-authorization-server` (também com o sufixo `/api/mcp`), registro
  dinâmico em `POST /api/mcp/oauth/register`, aprovação na tela
  `/app/settings/integracoes/mcp/autorizar` (admin logado escolhe o perfil), token em
  `POST /api/mcp/oauth/token`. Só authorization code com PKCE S256. Código de uso único
  (10 min). Access token de 1 h; refresh com rotação. Reapresentar código ou refresh
  já usado revoga a conexão.

## Revalidado a cada chamada (`lib/mcp/v1/conexao.ts`)

1. o segredo existe → senão 401 (com `WWW-Authenticate: Bearer resource_metadata=…`);
2. não revogada e não vencida → senão 401;
3. "Permitir conexões MCP" ligado na organização → senão 403 `mcp_disabled`;
4. não suspensa → senão 403;
5. IP na lista (quando há lista) → senão 403;
6. o dono ainda é da organização → senão 403; os escopos valem recortados pelo papel atual.

A organização vem sempre da conexão; nenhuma ferramenta aceita `organization_id`.

## Escopos e ferramentas

| Escopo | Papel mínimo | Ferramentas |
|---|---|---|
| `contacts:read` | agent | `list_contacts`, `get_contact` |
| `contacts:pii` | agent | (mostra telefone/e-mail; só com `contacts:read` e o interruptor de dados pessoais) |
| `contacts:write` | agent | `create_contact`, `update_contact` |
| `leads:read` | agent | `list_leads`, `get_lead` |
| `leads:write` | agent | `create_lead`, `update_lead`, `move_lead_stage` |
| `pipelines:read` | agent | `list_pipelines` |
| `tags:read` | agent | `list_tags` |
| `tags:write` | agent | `add_tag_to_contact`, `remove_tag_from_contact`, `create_tag` |
| `flows:read` | viewer | `list_flows`, `get_flow` |
| `flows:write` | manager | `update_flow_draft` (só rascunho; mesma validação do construtor) |
| `campaigns:read` | manager | `list_campaigns`, `get_campaign` |
| `conversations:read` | agent | `list_conversation_messages` (só no perfil Personalizado) |

Perfis prontos: **Somente leitura** (contatos, negócios, funis, fluxos, etiquetas,
campanhas), **Operação de CRM** (o anterior + `leads:write`, `tags:write`),
**Construtor de fluxos** (`flows:read`, `flows:write`), **Personalizado**.

## Lista de bloqueio (`lib/mcp/v1/bloqueio.ts`)

Nunca exposto: credenciais e segredos, outras organizações, faturamento e admin,
usuários/convites/papéis, segurança, os próprios tokens MCP, auditoria e logs, SQL e
storage livres, prompts dos agentes. Fora do catálogo: excluir, publicar fluxo,
iniciar/pausar campanha, enviar mensagem, importar/exportar, alterar em lote — ficam
para uma fase com confirmação humana. O teste `tests/unit/mcp-v1-regras.test.ts`
varre todo o catálogo e o código de `lib/mcp/v1/`.

## Minimização

Projeção fixa por ferramenta; telefone e e-mail mascarados sem `contacts:pii`; no
máximo 50 itens por chamada com cursor opaco; texto escrito por cliente sai como
`{ "untrusted_content": "…" }`, e a descrição da ferramenta avisa o modelo.

## Limites e freio

60 chamadas/min e 5.000/dia por conexão (429 + `Retry-After`); 300 escritas/dia.
20 recusas de permissão em 10 minutos suspendem a conexão e avisam os admins na Central.

## Registro

Toda chamada: `mcp_call_log` (organização, conexão, dono, ferramenta, resultado, nº de
registros, duração, IP, `request_id`, só as CHAVES dos argumentos). Retenção de 90 dias
no cron `data-retention`, que também manda o aviso de vencimento em 7 dias. Mutações
entram no audit log normal com "conexão MCP <nome> (de <pessoa>)" e na linha do tempo
do negócio como "via MCP: <nome>". `last_used` grava no máximo uma vez por minuto.

## Variáveis de ambiente

Nenhuma nova. Os endereços saem de `NEXT_PUBLIC_APP_URL`.

## Aplicar em produção

Migration `20261103120000_9023_mcp_conexoes_seguras.sql` (aditiva, reaplicável). O
`baseline.sql` tem o mesmo bloco no apêndice, então o `update.sh` do kit já aplica.
Num banco gerenciado à mão: snapshot, depois `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261103120000_9023_mcp_conexoes_seguras.sql`.
