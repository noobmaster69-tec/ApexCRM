-- ---- conexões MCP seguras (migration 9923) ----
-- (Era a 9023: renumerada para a faixa 99xx no merge da 1.99, que passou a usar 90xx.)
-- 9923 (fork jhoow, Configurações › Integrações › MCP): a organização conecta o
-- Claude (Code, Desktop, claude.ai), o Cursor ou outra ferramenta MCP ao CRM, e
-- quem conecta alcança SÓ o que a conexão liberou (escopos `recurso:ação`).
--
-- Quatro tabelas, todas aditivas e reaplicáveis:
--  1. `mcp_connections`: a conexão (nome, ferramenta, perfil, escopos, validade,
--     IPs, dados pessoais). O token NUNCA fica em texto: só o SHA-256, com
--     índice único. Pertence a uma organização e a quem a criou.
--  2. `mcp_oauth_clients`: clientes do registro dinâmico (OAuth 2.1). São da
--     INSTALAÇÃO, não de uma organização — o registro acontece antes de alguém
--     logar, e só vira acesso quando um admin aprova na tela de consentimento
--     (que cria uma conexão da organização dele). Sem política: só o servidor.
--  3. `mcp_oauth_codes` e `mcp_oauth_tokens`: código de autorização (PKCE S256,
--     10 minutos, uso único) e pares access (1h) / refresh (com rotação),
--     também só em hash.
--  4. `mcp_call_log`: uma linha por chamada (ferramenta, resultado, quantos
--     registros, duração, IP, request_id, as CHAVES dos argumentos — nunca os
--     valores). Retenção de 90 dias pelo cron `data-retention`.
--
-- RLS: só o admin da organização lê e escreve pela sessão; o servidor MCP usa o
-- service role e filtra organization_id em toda consulta. O interruptor geral
-- ("Permitir conexões MCP") mora em organizations.settings.mcp.enabled, como a
-- política de MFA mora em settings.security — desligado por padrão.

-- 1. conexões
create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  tool text not null check (tool in ('claude_code', 'claude_desktop', 'cursor', 'outra')),
  profile text not null check (profile in ('somente_leitura', 'operacao_crm', 'construtor_fluxos', 'personalizado')),
  scopes text[] not null default '{}',
  show_pii boolean not null default false,
  allowed_ips text[] not null default '{}',
  auth_kind text not null default 'token' check (auth_kind in ('token', 'oauth')),
  token_hash bytea,
  token_hint text,
  oauth_client_id uuid,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  suspended_at timestamptz,
  suspended_reason text,
  last_used_at timestamptz,
  last_used_ip text,
  expiry_notified_at timestamptz,
  constraint mcp_connections_org_id_key unique (organization_id, id),
  constraint mcp_connections_escopos_validos check (
    scopes <@ array[
      'contacts:read', 'contacts:pii', 'contacts:write', 'leads:read', 'leads:write',
      'pipelines:read', 'tags:read', 'tags:write', 'flows:read', 'flows:write',
      'campaigns:read', 'conversations:read'
    ]::text[]
  ),
  constraint mcp_connections_token_ou_oauth check (
    (auth_kind = 'token' and token_hash is not null) or auth_kind = 'oauth'
  )
);

create unique index if not exists mcp_connections_token_hash_key
  on public.mcp_connections (token_hash) where token_hash is not null;
create index if not exists mcp_connections_org_idx
  on public.mcp_connections (organization_id, created_at desc);

comment on table public.mcp_connections is
  'Conexões MCP da organização (9923). Token só em SHA-256; escopos recurso:ação; permissão efetiva = escopos ∩ papel atual de quem criou.';

-- 2. clientes OAuth (registro dinâmico) — da instalação
create table if not exists public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_name text not null check (length(btrim(client_name)) between 1 and 120),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at timestamptz not null default now()
);

comment on table public.mcp_oauth_clients is
  'Clientes OAuth 2.1 do MCP (registro dinâmico, 9923). Da instalação: só viram acesso quando um admin aprova (cria uma mcp_connections da organização dele).';

alter table public.mcp_connections
  drop constraint if exists mcp_connections_oauth_client_fkey;
alter table public.mcp_connections
  add constraint mcp_connections_oauth_client_fkey
  foreign key (oauth_client_id) references public.mcp_oauth_clients(id) on delete set null;

-- 3. códigos e tokens OAuth
create table if not exists public.mcp_oauth_codes (
  code_hash bytea primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  client_id uuid not null references public.mcp_oauth_clients(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mcp_oauth_codes_connection_fkey
    foreign key (organization_id, connection_id)
    references public.mcp_connections (organization_id, id) on delete cascade
);

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  access_hash bytea not null,
  access_expires_at timestamptz not null,
  refresh_hash bytea not null,
  refresh_expires_at timestamptz not null,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mcp_oauth_tokens_connection_fkey
    foreign key (organization_id, connection_id)
    references public.mcp_connections (organization_id, id) on delete cascade
);

create unique index if not exists mcp_oauth_tokens_access_key on public.mcp_oauth_tokens (access_hash);
create unique index if not exists mcp_oauth_tokens_refresh_key on public.mcp_oauth_tokens (refresh_hash);
create index if not exists mcp_oauth_tokens_connection_idx on public.mcp_oauth_tokens (connection_id);

-- 4. registro de chamadas
create table if not exists public.mcp_call_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  owner_user_id uuid,
  tool text not null,
  result text not null check (result in ('ok', 'negado', 'erro')),
  reason text,
  records integer not null default 0,
  duration_ms integer not null default 0,
  ip text,
  request_id uuid,
  arg_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint mcp_call_log_connection_fkey
    foreign key (organization_id, connection_id)
    references public.mcp_connections (organization_id, id) on delete cascade
);

create index if not exists mcp_call_log_connection_idx
  on public.mcp_call_log (connection_id, created_at desc);
create index if not exists mcp_call_log_created_idx
  on public.mcp_call_log (created_at);

comment on table public.mcp_call_log is
  'Uma linha por chamada MCP (9923): ferramenta, resultado, contagem, duração, IP, request_id e só as CHAVES dos argumentos. Retenção 90 dias (cron data-retention).';

-- RLS: admin da organização pela sessão; o resto só pelo service role.
alter table public.mcp_connections enable row level security;
drop policy if exists tenant_isolation_mcp_connections_all on public.mcp_connections;
create policy tenant_isolation_mcp_connections_all on public.mcp_connections
  for all
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
  )
  with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
  );

alter table public.mcp_call_log enable row level security;
drop policy if exists tenant_isolation_mcp_call_log_all on public.mcp_call_log;
create policy tenant_isolation_mcp_call_log_all on public.mcp_call_log
  for all
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
  )
  with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
  );

-- Códigos, tokens e clientes OAuth: RLS ligada e NENHUMA política — nem o admin
-- lê hash de token pela sessão. Só o servidor (service role).
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
alter table public.mcp_oauth_clients enable row level security;

revoke all on public.mcp_connections from anon;
revoke all on public.mcp_call_log from anon;
revoke all on public.mcp_oauth_codes from anon, authenticated;
revoke all on public.mcp_oauth_tokens from anon, authenticated;
revoke all on public.mcp_oauth_clients from anon, authenticated;

-- 5. os avisos da Central (mesma lista do bloco único do baseline, + 3 kinds)
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'proposal_expired_notice',
    'proposal_acceptance_rate_drop',
    'proposal_promised_not_created',
    'proposta_travada',
    'proposta_pronta_para_revisao',
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    'mcp_conexao_criada',
    'mcp_conexao_expirando',
    'mcp_conexao_suspensa',
    'other'
  ));

notify pgrst, 'reload schema';
