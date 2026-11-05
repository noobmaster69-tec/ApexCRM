-- ---- idioma da campanha (migration 9919) ----
-- (Era a 9019: renumerada para a faixa 99xx no merge da 1.99, que passou a usar 90xx.)
-- 9919 (fork jhoow, campos do contato e idioma): `campaigns.language`, o idioma
-- em que a campanha fala (ex.: pt-PT, es, en). No envio ele INICIA
-- `idioma_prospeccao` e `idioma_conversa` — em `contacts.custom_fields` e em
-- `conversations.metadata` — só onde ainda não há valor: a conversa já
-- estabelecida noutro idioma continua nele (lib/campanhas/idioma.ts). Nulo =
-- sem idioma próprio (o do perfil do contato, como antes).
-- Aditiva e reaplicável.

alter table public.campaigns add column if not exists language text;

alter table public.campaigns drop constraint if exists campaigns_language_check;
alter table public.campaigns add constraint campaigns_language_check check (
  language is null or language ~ '^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$'
);

comment on column public.campaigns.language is
  'Idioma da campanha (9919, ex.: pt-PT). Inicia idioma_prospeccao/idioma_conversa do contato e da conversa quando vazios.';

notify pgrst, 'reload schema';
