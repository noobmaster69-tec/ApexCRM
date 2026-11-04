-- manifest: As tabelas do fork (9902–9923) entram nas duas réguas que o 1.99 trouxe — privilégio explícito por tabela e papel (9037: a Supabase deixa de conceder pelo default ACL) e escrita do admin da plataforma só pela função `_full` (0508/0533: `support_readonly` não escreve). Nenhuma linha muda; reaplicável.
--
-- ---- tabelas do fork: grants explícitos e escrita do admin pela função _full (migration 9925) ----
-- 9925 (fork jhoow, merge da 1.99).
--
-- 1. GRANTS. Cada tabela recebe o que a RLS pressupõe: `authenticated` com os
--    quatro comandos onde há policy permissiva para eles; as do OAuth do MCP
--    (códigos, tokens, clientes) não têm policy nenhuma e ficam só com o
--    `service_role`, como sempre estiveram de fato.
-- 2. ESCRITA DO ADMIN DA PLATAFORMA. Toda policy de escrita que aceitava
--    `fn_is_platform_admin()` passa a aceitar `fn_is_platform_admin_full()`:
--    o suporte em modo somente leitura lê, não escreve. A policy `for all`
--    ganha um par de leitura com a função pura, para a leitura do suporte
--    continuar a mesma.

do $grants_9925$
begin
  revoke all on table public.crm_crms from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.crm_crms to authenticated, service_role;
  revoke all on table public.fluxo_pastas from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.fluxo_pastas to authenticated, service_role;
  revoke all on table public.crm_waha_session_bindings from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.crm_waha_session_bindings to authenticated, service_role;
  revoke all on table public.crm_fluxo_triggers from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.crm_fluxo_triggers to authenticated, service_role;
  revoke all on table public.crm_fluxo_global_triggers from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.crm_fluxo_global_triggers to authenticated, service_role;
  revoke all on table public.contact_custom_fields from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.contact_custom_fields to authenticated, service_role;
  revoke all on table public.campaign_audience_sources from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.campaign_audience_sources to authenticated, service_role;
  revoke all on table public.mcp_connections from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.mcp_connections to authenticated, service_role;
  revoke all on table public.mcp_call_log from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.mcp_call_log to authenticated, service_role;
  -- Sem policy nenhuma: só o servidor.
  revoke all on table public.mcp_oauth_clients from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.mcp_oauth_clients to service_role;
  revoke all on table public.mcp_oauth_codes from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.mcp_oauth_codes to service_role;
  revoke all on table public.mcp_oauth_tokens from anon, authenticated, service_role;
  grant select, insert, update, delete on table public.mcp_oauth_tokens to service_role;
end
$grants_9925$;

do $escrita_9925$
declare
  p record;
  v_using text;
  v_check text;
  v_leitura text;
begin
  for p in
    select tablename, policyname, cmd, qual, with_check, roles
      from pg_policies
     where schemaname = 'public'
       and cmd <> 'SELECT'
       and (qual like '%fn_is_platform_admin(%' or with_check like '%fn_is_platform_admin(%')
  loop
    -- `for all` cobre a leitura: o par de leitura guarda a função pura.
    if p.cmd = 'ALL' and p.qual is not null then
      v_leitura := left(p.policyname, 57) || '_leitura';
      if not exists (
        select 1 from pg_policies
         where schemaname = 'public' and tablename = p.tablename and policyname = v_leitura
      ) then
        execute format('create policy %I on public.%I for select using (%s)', v_leitura, p.tablename, p.qual);
      end if;
    end if;
    v_using := replace(p.qual, 'fn_is_platform_admin()', 'fn_is_platform_admin_full()');
    v_check := replace(p.with_check, 'fn_is_platform_admin()', 'fn_is_platform_admin_full()');
    if v_using is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename, v_using, v_check);
    elsif v_using is not null then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, v_using);
    elsif v_check is not null then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, v_check);
    end if;
  end loop;
end
$escrita_9925$;

notify pgrst, 'reload schema';
