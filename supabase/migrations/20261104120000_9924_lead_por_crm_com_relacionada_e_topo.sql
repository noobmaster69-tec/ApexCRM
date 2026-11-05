-- manifest: Funde as duas linhas de `fn_nascer_lead_da_conversa` que se cruzaram no merge da 1.99 — a do fork (9909: só o lead aberto do MESMO CRM do funil de destino conta) com a do upstream (9045: pessoa relacionada de negócio aberto não abre outro card; 9058: o card nasce no TOPO da etapa). Mesma assinatura, mesma trava, mesmos grants; nenhuma coluna nova, nenhum backfill.
--
-- ---- lead por CRM, pessoa relacionada e topo da etapa (migration 9924) ----
-- 9924 (fork jhoow, merge da 1.99). A 9909 e as 9045/9058 do upstream
-- reescrevem a MESMA função a partir da versão antiga: aplicada por último,
-- cada uma apagaria a regra da outra. Esta é a soma das três:
--   1. o lead aberto do contato só conta se for do MESMO CRM do funil de
--      destino (9909) — um número leva a um CRM, e o contato da Apex que
--      escreve para a PA ganha card na PA;
--   2. a pessoa relacionada (`crm_lead_links`, related) de um negócio aberto
--      DESSE CRM também já tem a sua demanda (9045);
--   3. o card nasce acima do primeiro da etapa, `1000` na etapa vazia (9058).
--
-- Reaplicável: `create or replace`, grants reafirmados.

create or replace function public.fn_nascer_lead_da_conversa(
  p_org uuid,
  p_contact uuid,
  p_pipeline uuid,
  p_stage uuid,
  p_title text,
  p_source text,
  p_source_metadata jsonb default '{}'::jsonb,
  p_tags text[] default '{}'::text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_crm uuid;
begin
  -- Serializa por (organização, contato). Transaction-scoped: liberado no
  -- commit, sem risco de lock vazado.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_contact::text, 0));

  -- O CRM do funil de destino. Funil sem CRM não existe desde a 9904 (NOT
  -- NULL), mas o `is not distinct from` mantém a regra antiga caso exista.
  select d.crm_id into v_crm from public.crm_pipelines d where d.id = p_pipeline;

  select l.id into v_id
    from public.crm_leads l
    join public.crm_pipelines p on p.id = l.pipeline_id
   where l.organization_id = p_org
     and l.contact_id = p_contact
     and l.status = 'open'
     and p.crm_id is not distinct from v_crm
   limit 1;

  -- O contato também pode ser uma PESSOA RELACIONADA de um negócio aberto do
  -- mesmo CRM (#3083) — o comprador, o gerente, o fixo da loja. Esse negócio
  -- já é a demanda dele. Segunda consulta, e não um OR na primeira: o caso
  -- comum (principal) segue no índice de sempre.
  if v_id is null then
    select l.id into v_id
      from public.crm_lead_links k
      join public.crm_leads l on l.id = k.lead_id
      join public.crm_pipelines p on p.id = l.pipeline_id
     where k.organization_id = p_org
       and k.target_kind = 'contact'
       and k.link_kind = 'related'
       and k.target_id = p_contact
       and l.organization_id = p_org
       and l.status = 'open'
       and p.crm_id is not distinct from v_crm
     limit 1;
  end if;

  -- NULL significa "já existe", e quem chama traduz isso para `ja_existe`. Não é
  -- erro: é o desfecho correto da segunda mensagem.
  if v_id is not null then
    return null;
  end if;

  -- A moeda é a da organização (sem ela o negócio pegava o 'BRL' da coluna em
  -- qualquer organização), e o card nasce no TOPO da etapa (#3461).
  insert into public.crm_leads
    (organization_id, pipeline_id, stage_id, contact_id, title, source, source_metadata, tags, currency, position_in_stage)
  values
    (p_org, p_pipeline, p_stage, p_contact, p_title, p_source, coalesce(p_source_metadata, '{}'::jsonb), coalesce(p_tags, '{}'::text[]),
     coalesce((select o.currency from public.organizations o where o.id = p_org), 'BRL'),
     coalesce((select min(l.position_in_stage) - 1000
                 from public.crm_leads l
                where l.organization_id = p_org
                  and l.stage_id = p_stage), 1000))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.fn_nascer_lead_da_conversa(uuid, uuid, uuid, uuid, text, text, jsonb, text[]) from public, anon;
grant  execute on function public.fn_nascer_lead_da_conversa(uuid, uuid, uuid, uuid, text, text, jsonb, text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
