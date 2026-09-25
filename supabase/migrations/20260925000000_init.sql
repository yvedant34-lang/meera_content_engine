-- meera_content_engine: initial schema (notes, drafts, voice_skill)
-- RLS on every table, no policies, no anon/authenticated grants.
-- Only the server (service/secret key) can read or write.

create extension if not exists pgcrypto;

create table public.notes (
  id                  uuid primary key default gen_random_uuid(),
  telegram_update_id  bigint not null unique,          -- dedupe Telegram retries (constraint 5)
  telegram_message_id bigint,
  chat_id             bigint not null,
  text                text,
  score               int check (score between 0 and 10),
  score_reason        text,
  status              text not null default 'received'
                      check (status in ('received','rejected_low_score','drafted','error')),
  created_at          timestamptz not null default now()
);

create table public.drafts (
  id                   uuid primary key default gen_random_uuid(),
  note_id              uuid not null references public.notes(id) on delete restrict,
  telegram_message_ids bigint[] not null default '{}',  -- every chunk of a split draft (constraint 7)
  body                 text not null,
  model                text not null,
  news_headline        text,
  news_source          text,
  news_date            text,
  news_url             text,
  status               text not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  decided_at           timestamptz,
  created_at           timestamptz not null default now()
);
create index drafts_note_id_idx on public.drafts (note_id);
create index drafts_msg_ids_idx on public.drafts using gin (telegram_message_ids);  -- APPROVE/REJECT reply lookup

create table public.voice_skill (
  id         uuid primary key default gen_random_uuid(),
  version    int not null unique,
  content    text not null,
  active     boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index voice_skill_one_active on public.voice_skill (active) where active;  -- at most one active row

alter table public.notes       enable row level security;
alter table public.drafts      enable row level security;
alter table public.voice_skill enable row level security;

revoke all on public.notes, public.drafts, public.voice_skill from anon, authenticated;
