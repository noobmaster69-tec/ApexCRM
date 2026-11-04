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
    -- (migration 0109, issue #129) Mensagem outbound nasce `sending` e, quando o
    -- envio nunca acontece, fica `sending` para sempre — o self-hoster vê uma
    -- mensagem eternamente "enviando", sinal de progresso para algo que não vai
    -- acontecer. O cron `recover-stuck-messages` marca `failed` e usa este kind
    -- para o defeito APARECER na Central de avisos.
    --
    -- Entra NESTA lista, e não num bloco novo no fim do arquivo: o #159 do @jmpo
    -- mostrou que reconstruir a mesma constraint em N blocos quebra o
    -- `update.sh` de todo clone que já tenha uma linha de vocabulário posterior
    -- — os blocos antigos rodam antes e falham em cadeia. Um bloco por
    -- constraint, vigiado por tests/unit/baseline-constraint-reconstruida.test.ts.
    'message_send_stuck',
    -- (migration 0129) O cliente manda foto/áudio e o agente age como se nada
    -- tivesse chegado. Acontece quando o modelo configurado não enxerga imagem,
    -- ou quando falta a chave de transcrição — e antes disto a derivação
    -- devolvia string vazia EM SILÊNCIO: nenhum erro, nenhum log, e o operador
    -- concluindo que o agente ignorou o cliente de propósito.
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    -- (migration 0111, spec 16 §3.2) O papel Operador declara promessa em aberto:
    -- o assistente prometeu algo ao cliente e o cumprimento não foi registrado.
    -- A invariante sagrada da spec é "nenhuma promessa deixa de ser cumprida", e
    -- uma promessa sem dono precisa aparecer onde o humano olha — não no log do
    -- worker. Entra NESTA lista pela mesma razão que a de cima.
    'promise_unfulfilled',
    -- (migration 0124, spec 17 §4b) Dado que o assistente ouviu na conversa e
    -- ninguém confirmou até o prazo. `info`, não `warn`: nada quebrou — uma
    -- informação não foi aproveitada, e tratar isso como falha ensinaria a
    -- ignorar os avisos que são falha de verdade. Entra NESTA lista pela mesma
    -- razão das de cima (bloco único por constraint, #159).
    'contact_proposal_expired',
    -- (migration 0159) O gasto passou do aviso que a pessoa definiu e a IA
    -- CONTINUA respondendo — `warn`, nunca `critical`, e um kind SEPARADO de
    -- `budget_exceeded`: colapsar os dois faria o alerta de "parou" perder o
    -- significado. É este kind que torna possível a condição do gate "ninguém é
    -- bloqueado sem ter sido avisado no mês" — sem ele, o salto de 79% para 101%
    -- entre duas chamadas calaria a IA sem nenhum sinal anterior.
    --
    -- Entra NESTA lista, e AQUI no fim, por duas razões distintas: bloco único
    -- por constraint (#159), e porque `tests/unit/midia-nao-lida.test.ts` procura
    -- `'midia_nao_lida'` nos primeiros 2000 caracteres a partir do `add
    -- constraint` — um valor comentado inserido ACIMA dele empurra-o para fora da
    -- janela e reprova um teste que não tem nada a ver com o kind novo (medido:
    -- offset 1532 -> 2275). Kind novo entra no fim da lista.
    'budget_warning',
    -- (migration 0181) O material que a pessoa enviou não entrou na base: falta
    -- chave de embedding, a extração do arquivo falhou, ou nenhum trecho foi
    -- gravado. Antes disto o worker devolvia `skipped` para o próprio log, o drain
    -- tratava `skipped` como sucesso, e a linha da fonte seguia dizendo `ready`.
    -- Irmão direto de `midia_nao_lida`: mesma chave, mesmo silêncio.
    'conhecimento_nao_indexado',
    -- (migration 0206, spec 18) Chamada de voz WhatsApp (WaCalls) recebida que
    -- nunca teve answered_at — o "chamou e ninguém atendeu" precisa de dono,
    -- mesma razão de midia_nao_lida/conhecimento_nao_indexado. Entra NESTA
    -- lista, não em bloco novo (#159, bloco único por constraint).
    'voice_call_missed',
    'case_stale',
    -- (migration 0292) O aviso de caso não chegou ao WhatsApp da equipe,
    -- em definitivo. Nasce com `ref_kind='agent_case'` para levar AO CASO —
    -- que continua esperando — e não a uma tela genérica. A fonte da verdade
    -- sobre "o aviso saiu?" continua sendo `entregas_de_aviso_de_caso`:
    -- qualquer membro apaga um item da Central pelo PostgREST hoje.
    'aviso_de_caso_nao_entregue',
    -- (migration 0312) O fluxo de follow-up publicado que NUNCA vai disparar:
    -- gatilho automático (silêncio, etapa, caso, falta) só cria inscrição se
    -- algum agente publicado arma o ponteiro, e sem esse vínculo os produtores
    -- saem por `pointers_armados = 0` em silêncio — `active` na tela, morto no
    -- motor. Entra NESTA lista e no FIM dela, pelas duas razões de sempre
    -- (bloco único por constraint, #159; e a janela de 2000 caracteres que
    -- `tests/unit/midia-nao-lida.test.ts` varre a partir do `add constraint`).
    'followup_sem_agente',
    -- (migration 0339, doc 11 decisão B) O canal de WhatsApp em modo de teste
    -- SEM número autorizado não responde a ninguém — e o esquecimento é o
    -- defeito: as mensagens chegam no Inbox e a IA nunca fala, então quem
    -- instalou conclui que o produto está quebrado. O cron canal-mudo-watcher
    -- abre este aviso depois de 3 dias e o FECHA quando deixa de valer.
    --
    -- Entra NESTA lista, e não num bloco novo no fim do arquivo: reconstruir a
    -- mesma constraint em N blocos quebra o `update.sh` de todo clone com
    -- vocabulário posterior (lição do #159).
    'canal_mudo_sem_numero',
    -- (migration 0464) a proposta comercial: vencimento sem decisão, queda da taxa
    -- de aceite e promessa de proposta que não virou proposta.
    'proposal_expired_notice', 'proposal_acceptance_rate_drop', 'proposal_promised_not_created',
    -- (migration 0466, D3) proposta presa em 'enviando' há mais de 5min — o
    -- mesmo padrão do 'message_send_stuck', cron próprio (proposta-travada).
    'proposta_travada',
    -- (migration 0475) a IA rascunhou uma proposta e falta confirmar o modelo
    -- sugerido (plano N1) ou falta preço de catálogo — a Central acompanha
    -- até as duas pendências sumirem, ou até a proposta ser enviada/descartada.
    'proposta_pronta_para_revisao',
    -- (migration 0501) a organização voltou de uma suspensão e há conversas que
    -- receberam mensagem enquanto ela estava parada: a IA não respondeu nem vai
    -- responder sozinha. Um item por reativação, aberto por fn_reativar_organizacao.
    'org_reativada',
    -- (migration 0500) O Jev percebeu, numa mensagem em que a regra de hoje não
    -- viu nada, um pedido para falar com uma pessoa ou para parar de receber
    -- mensagens, e a empresa escolheu "Avisar a equipe". Um kind por pedido, e
    -- não `other`: a Central dá rótulo e destino por kind, e o `other` não leva
    -- a uma conversa (lib/ai/inbox-destino.ts); e o aviso é um por CONVERSA e
    -- pedido. O Jev só abre o aviso — quem passa a conversa é a regra de hoje
    -- ou uma pessoa, e quem bloqueia é só o STOP do próprio cliente. NESTA
    -- lista pelas razões de sempre (#159; a janela do `midia-nao-lida.test.ts`).
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    -- (migration 0589, issue #2389) A pausa de uma conexão era silenciosa para
    -- todo mundo menos para quem clicou. O audit registrava `channel.disabled`
    -- / `channel.enabled`, mas audit é histórico para quem procura, não
    -- comunicação — a Central é onde a operação inteira olha. O item nasce na
    -- pausa e se resolve sozinho na retomada ou no arquivamento, com o motivo
    -- no corpo (laço do canal-mudo-watcher, só que instantâneo).
    'canal_pausado',
    -- (migration 0601) a cobrança do revendedor fala com a empresa: os avisos
    -- da régua (teste acabando, venceu, suspende em breve, suspensa) nascem sem
    -- referência, e o de 80% do teto de IA do plano nasce com ref_kind plano. Os
    -- dois abrem Configurações › Plano e cobrança, só para quem administra.
    'cobranca',
    -- (migration 0614) o admin da plataforma trocou o e-mail de login de uma
    -- pessoa da equipe (PATCH .../members/[userId]/email): a empresa fica
    -- sabendo pela Central — com o nome e a data, nunca o endereço.
    'email_de_login_trocado',
    -- (migration 0655, issue #2529) A tarefa vencida só aparecia em vermelho
    -- para quem ABRIA a lista de tarefas: quem não abria perdia o prazo em
    -- silêncio. O cron `task-reminder` varre `crm_tasks` com prazo na janela e
    -- nasce com estes DOIS kinds — um por momento, e não um genérico: a
    -- Central dá rótulo e destino por kind, e "tarefa perto do vencimento" e
    -- "tarefa venceu sem conclusão" pedem leituras diferentes de quem abre.
    -- Nascem com `ref_kind='task'`, levando à lista de tarefas. Entra NESTA
    -- lista pelas razões de sempre (bloco único por constraint, #159).
    'task_due',
    'task_overdue',
    -- (Spec 32) A volta de uma queda do número recupera sozinha as conversas do
    -- período, só de quem tem ficha. `recuperacao_da_queda` é o resumo para o
    -- administrador (ref_kind='channel_session', um aberto por conexão);
    -- `cliente_sem_resposta_na_queda` aponta a conversa cuja última mensagem
    -- recuperada é do cliente sem resposta (ref_kind='conversation', um aberto
    -- por conversa). Cada um com índice único parcial próprio, no apêndice da
    -- migration 9033. Entram NESTA lista (bloco único por constraint, #159).
    'recuperacao_da_queda',
    'cliente_sem_resposta_na_queda',
    -- (migration 9027, issue #3371) A conta da assinatura do ChatGPT morreu em
    -- silêncio no cliente Obralivre: `401 · Provided authentication token is
    -- expired` em 107 turnos, ~26 h sem a IA responder. Entra NESTA lista pelas
    -- razões de sempre (#159, bloco único por constraint) e o item nasce SEM
    -- referência: o destino é a tela de Credenciais, para quem administra.
    'assinatura_desconectada',
    -- (migration 9923, fork jhoow) As conexões MCP avisam todos os admins na
    -- Central: conexão criada, perto de expirar (7 dias) e suspensa depois de
    -- muitas recusas de permissão seguidas.
    'mcp_conexao_criada',
    'mcp_conexao_expirando',
    'mcp_conexao_suspensa',
    'other'
  ));

notify pgrst, 'reload schema';
