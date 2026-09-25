-- Feedback loop: Meera replies to a draft with feedback, the bot posts a revised version.
-- Old versions are kept (status 'revised'), never deleted.
alter table public.drafts
  add column if not exists parent_draft_id uuid references public.drafts(id) on delete restrict,
  add column if not exists feedback text,
  add column if not exists version int not null default 1;

alter table public.drafts drop constraint if exists drafts_status_check;
alter table public.drafts add constraint drafts_status_check
  check (status in ('pending', 'approved', 'rejected', 'revised'));

create index if not exists drafts_parent_idx on public.drafts (parent_draft_id);
