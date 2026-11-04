# CLAUDE.md — contexto do projeto Jhoow (DeskcommCRM self-hosted)

Este arquivo é o briefing que o Claude Code da VPS lê no primeiro turno pra entender onde estamos. Mantido pelo próprio Claude a cada sessão.

## Quem é o dono

- **Jhoow (Jonatas)** — brasileiro, fundador do GalleryJhoow (galleryjhoow.online) e NorteX Digital. Comunica em português. Técnico, constrói as próprias automações.
- Core business: vende retratos de IA via WhatsApp, hoje operando no Leona.

## O que estamos construindo

Transformar o **DeskcommCRM** (fork `noobmaster69-tec/DeskcommCRM`, branch `jhoow/main`) numa versão própria com:
1. CRM de conversas (Inbox + funil de cards estilo Kommo)
2. Construtor visual de fluxos sem IA (estilo Leona)

Objetivo final: substituir o Leona pelo CRM próprio.

## Infra atual

### VPS Hostinger `srv1725904`
- IP: `2.25.163.122`, Ubuntu 24.04, 1 vCPU, 3.8 GB RAM, swap 4 GB
- Docker 29 / Compose v5
- UFW: 22/80/443 abertos
- **ATENÇÃO**: tem OUTROS serviços rodando em produção — nunca derrubar nada que não seja do `-staging`:
  - `crm.jhoowapexdesign101921.com` → `/opt/deskcommcrm/` (DeskcommCRM produção, imagem oficial 1.66.1, Supabase "CRM Completo")
  - `evo.jhoow...` → Evolution API :8080
  - `n8n.jhoow...` → n8n :5678
  - `bot.jhoow...`, `chat.jhoow...` → Typebot :3001/:3002
  - `admin` raiz → `/var/www/admin`

### Instalações separadas
- `/opt/deskcommcrm/` → PRODUÇÃO, **NÃO MEXER**
- `/opt/deskcommcrm-staging/` → nossa instância de staging (branch `jhoow/main`, imagem oficial 1.69.0, Supabase separado)

### Staging — já no ar
- URL: `https://crm-staging.jhoowapexdesign101921.com`
- Porta loopback: `127.0.0.1:3100` (produção em 3000)
- Compose: `/opt/deskcommcrm-staging/`, project name `deskcommcrm-staging`
- Nginx: `/etc/nginx/sites-available/crm-staging` → cert Let's Encrypt via certbot
- Supabase: projeto `oatbtozsaygxtjzttaas` em conta separada do Jhoow (free tier, 2ª vaga preservada em produção)
- 191 tabelas aplicadas via baseline.sql, com extensões: vector, citext, hstore, pgcrypto, uuid-ossp, pg_trgm, btree_gin, btree_gist, unaccent, intarray, ltree, tablefunc, fuzzystrmatch
- WAHA conectado via container `deskcommcrm-staging-waha-1`, sem número vinculado ainda

### Usuário bootstrap do staging
- Email: `jonataspereirajonatas73@gmail.com`
- Senha: **COMPROMETIDA** no chat durante setup — JHOOW DEVE TROCAR assim que entrar
- Org: `Apex Company` (slug `apex-company`)
- Role: `admin`, também `platform_admin`
- 2FA: factor TOTP foi criado e depois limpo para re-enrollment; Jhoow precisa configurar de novo via tela

### Rede do staging
- `deskcommcrm-staging_proxy` (external) → Nginx-bridge compartilha com app
- `deskcommcrm-staging_default` → serviços internos

## Repositório

- Fork: `https://github.com/noobmaster69-tec/DeskcommCRM`
- Upstream: `https://github.com/melgarafael/DeskcommCRM`
- Branch default: `jhoow/main`
- Clone local do Mac do Jhoow: `/Users/jonataspereira/Documents/CRM - Claude Code/fork` (NÃO acessível na VPS)
- Branch `main` do fork espelha upstream, nunca editar
- Todas as nossas modificações vão sob `jhoow/` pra evitar colisão em merges futuros do upstream

### Workflow de CI do upstream
- `.github/workflows/publish-image.yml` já publica 4 imagens (deskcommcrm, deskcomm-worker, deskcomm-scheduler, deskcomm-voice-agent) em `ghcr.io/${github.repository_owner}/*`
- Usa `secrets.GITHUB_TOKEN` padrão — funciona no fork sem GitHub App
- Trigger: push em tag `v*`, push em `main`, workflow_dispatch
- Para o fork gerar imagem: push em `jhoow/main` NÃO dispara automaticamente — adicionar `jhoow/main` ao trigger OU usar `workflow_dispatch` manual na aba Actions

## Convenções do repo (CLAUDE.md original do upstream)

- Multi-tenant com `organization_id` + RLS via `fn_user_org_ids()` em toda tabela
- Idempotência: `unique (organization_id, external_id)` + 23505
- Snake_case JSON, UUID v4, ISO-8601 UTC, dinheiro em `_cents`
- Wrapper: `{ data, meta? }` ou `{ error }`
- Bearer no header (nunca query string), hash SHA256 no DB
- `getUser()` server-side (nunca `getSession()`)
- Audit log em `api_audit_log` para toda mutação
- WAHA Plus engine NOWEB, HMAC SHA512, throttle 1 msg/1.2s
- Toda mudança de schema: migration + apêndice idempotente em `baseline.sql` + linha em `MANIFEST.md`
- `supabase/migrations/` versionadas, nunca editadas após aplicação
- Testes: `pnpm test:unit`, `pnpm test:db` (Postgres efêmero + 364 invariantes), `pnpm test:e2e` (Playwright)
- Service role bypassa RLS — sempre filtrar `organization_id` manualmente

## Feature em andamento (próxima)

Transformar o quadro de funil em algo **estilo Kommo CRM** (print que Jhoow enviou). Já existe metade:
- `POST /api/v1/webhooks/waha/[token]` → cria card no funil "de entrada" quando chega msg de contato desconhecido (feito)
- `lib/automation/actions/create-or-move-lead.ts` → implementação
- Teste E2E: `tests/e2e/conversa-vira-lead.spec.ts`
- Quadro em `/app/pipelines/[id]` existe mas simplificado

**Falta implementar (3 dias)**:
1. Criar card também quando OUTBOUND (Jhoow manda primeiro) — 2–3h
2. Enriquecer cards com foto do perfil WhatsApp, última mensagem, timestamp — 1 dia
3. Popup/drawer de chat rápido ao clicar no card — 1,5 dias
4. Botão "abrir chat completo" leva para `/app/inbox/[conversation_id]` — 30 min

Arquivos-chave:
- `app/app/pipelines/[id]/page.tsx` + `_client.tsx` — quadro
- `app/app/inbox/[id]/page.tsx` — chat completo
- `lib/followup/engine.ts`, `atendimento.ts` — motor de fluxo (sem IA)
- `lib/waha/media-send.ts`, `client.ts` — envio WAHA (texto, imagem, vídeo, áudio OGG/OPUS, doc)
- `lib/agent-engine/agent/inbound-turn.ts` — turno de entrada (contém `decidirSeEnfileiraOperador`, `turnoVaiFalarComOLead`); desacoplar inbound → fluxo sem agente é a Etapa 2 do master plan

## Como trabalhar

### Comandos úteis
```bash
# Staging up/down (JAMAIS down -v → apaga volumes WAHA)
cd /opt/deskcommcrm-staging
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml -f jhoow/staging/docker-compose.staging-overrides.yml --env-file .env ps

# Logs do app
docker logs deskcommcrm-staging-app-1 --tail 100 -f

# Reaplicar código do fork (depois de pull)
cd /opt/deskcommcrm-staging && git pull origin jhoow/main && docker compose ... up -d --force-recreate app worker scheduler

# Query no Supabase staging
DB_URL=$(awk -F= '/^SUPABASE_DB_URL=/{sub(/^SUPABASE_DB_URL=/,""); print}' /opt/deskcommcrm-staging/.env)
docker run -i --rm postgres:17-alpine psql "$DB_URL" -c "SELECT ..."

# Checar saúde das outras produções (NUNCA derrubar)
for h in crm evo n8n bot chat; do curl -sI https://$h.jhoowapexdesign101921.com | head -1; done
```

### Regras inegociáveis
- NUNCA mexer em `/opt/deskcommcrm/` (produção)
- NUNCA `docker compose down -v`
- Backup antes de editar `.env`, Nginx, fstab, crontab (em `/root/backups/`)
- `nginx -t` antes de `systemctl reload nginx`, nunca `restart`
- Nunca digitar nem exibir segredos — usar `read -rsp`
- Dois sistemas no mesmo número WhatsApp respondem em dobro — número de TESTE pro staging
- Toda mudança de schema: migration + baseline + MANIFEST (ver convenções)

### Pendências antigas (lembretes)
- Revogar tokens do Supabase criados no dia da instalação original
- Agendar `bash hostgator-setup-kit/backup.sh` em cron (produção)
- Decidir se arquiva o funil "Pedidos" na produção

## Histórico de decisões recentes

- **1 out 2026**: Fork criado. Staging configurado em `/opt/deskcommcrm-staging` com Supabase separado. Bootstrap do dono via SQL (não bootstrap-owner.ts porque script não está no container). MFA cleanup feito uma vez.
- **1 out 2026**: Decidido NÃO rodar segunda cópia completa do oficial na VPS (RAM limitada). Comparação com upstream vai ser via GitHub (`main` espelha upstream, `jhoow/main` nossas mudanças).
- **1 out 2026**: Push do commit local do Mac para o fork ainda PENDENTE (precisa `gh auth login` ou PAT).

