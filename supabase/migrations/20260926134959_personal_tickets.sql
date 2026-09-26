-- Isolated from all existing bnaimitzvah applications.
create schema if not exists tickets_private;
revoke all on schema tickets_private from public;
grant usage on schema tickets_private to authenticated;

-- Password time comes from Supabase's signed AMR claim, never local storage.
create function tickets_private.recent_password() returns boolean
language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a
    where a->>'method' = 'password'
      and to_timestamp((a->>'timestamp')::double precision) > now() - interval '90 days'
      and to_timestamp((a->>'timestamp')::double precision) <= now() + interval '1 minute'
  );
$$;
revoke all on function tickets_private.recent_password() from public, anon;
grant execute on function tickets_private.recent_password() to authenticated;

create table public.personal_tickets (
  id bigint generated always as identity (start with 1001 increment by 1) primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id uuid not null unique,
  title text not null check (length(btrim(title)) between 1 and 500),
  description text not null default '',
  due_date date default current_date,
  priority text default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status text default 'Open' check (status in ('Open', 'In progress', 'Waiting', 'Done', 'Cancelled')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index personal_tickets_owner_archive on public.personal_tickets(user_id, archived, id desc);
create table public.personal_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id bigint not null,
  user_id uuid not null default auth.uid(),
  body text not null check (length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (ticket_id, user_id) references public.personal_tickets(id, user_id) on delete cascade
);
create index personal_ticket_comments_ticket on public.personal_ticket_comments(ticket_id, user_id);
create index personal_ticket_comments_owner on public.personal_ticket_comments(user_id);
create table public.personal_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id bigint not null,
  user_id uuid not null default auth.uid(),
  name text not null,
  path text not null unique,
  size bigint not null check (size between 0 and 26214400),
  created_at timestamptz not null default now(),
  foreign key (ticket_id, user_id) references public.personal_tickets(id, user_id) on delete cascade,
  check (split_part(path, '/', 1) = user_id::text and split_part(path, '/', 2) = ticket_id::text)
);
create index personal_ticket_attachments_ticket on public.personal_ticket_attachments(ticket_id, user_id);
create index personal_ticket_attachments_owner on public.personal_ticket_attachments(user_id);

create function tickets_private.touch_updated() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function tickets_private.touch_updated() from public, anon;
create trigger personal_tickets_updated before update on public.personal_tickets for each row execute function tickets_private.touch_updated();
create trigger personal_ticket_comments_updated before update on public.personal_ticket_comments for each row execute function tickets_private.touch_updated();

alter table public.personal_tickets enable row level security;
alter table public.personal_ticket_comments enable row level security;
alter table public.personal_ticket_attachments enable row level security;
revoke all on public.personal_tickets, public.personal_ticket_comments, public.personal_ticket_attachments from anon, authenticated;
grant select, delete on public.personal_tickets, public.personal_ticket_comments, public.personal_ticket_attachments to authenticated;
grant insert (request_id,title,description,due_date,priority,status,archived) on public.personal_tickets to authenticated;
grant update (title,description,due_date,priority,status,archived) on public.personal_tickets to authenticated;
grant insert (ticket_id,body) on public.personal_ticket_comments to authenticated;
grant update (body) on public.personal_ticket_comments to authenticated;
grant insert (ticket_id,name,path,size) on public.personal_ticket_attachments to authenticated;
grant usage on sequence public.personal_tickets_id_seq to authenticated;
create policy personal_tickets_owner on public.personal_tickets for all to authenticated
using (user_id = (select auth.uid()) and (select tickets_private.recent_password()))
with check (user_id = (select auth.uid()) and (select tickets_private.recent_password()));
create policy personal_ticket_comments_owner on public.personal_ticket_comments for all to authenticated
using (user_id = (select auth.uid()) and (select tickets_private.recent_password()))
with check (user_id = (select auth.uid()) and (select tickets_private.recent_password()));
create policy personal_ticket_attachments_owner on public.personal_ticket_attachments for all to authenticated
using (user_id = (select auth.uid()) and (select tickets_private.recent_password()))
with check (user_id = (select auth.uid()) and (select tickets_private.recent_password()));

insert into storage.buckets (id, name, public, file_size_limit) values ('personal-ticket-files', 'personal-ticket-files', false, 26214400);
-- A restrictive bucket policy also prevents existing broad policies from opening these files.
create policy personal_ticket_files_anon_boundary on storage.objects as restrictive for all to anon
using (bucket_id <> 'personal-ticket-files') with check (bucket_id <> 'personal-ticket-files');
create policy personal_ticket_files_boundary on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'personal-ticket-files' or (
  (select auth.uid()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.personal_tickets t where t.id::text = (storage.foldername(name))[2] and t.user_id = (select auth.uid()))
))
with check (bucket_id <> 'personal-ticket-files' or (
  (select auth.uid()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.personal_tickets t where t.id::text = (storage.foldername(name))[2] and t.user_id = (select auth.uid()))
));
create policy personal_ticket_files_owner on storage.objects for all to authenticated
using (bucket_id = 'personal-ticket-files' and (storage.foldername(name))[1] = (select auth.uid())::text and (select tickets_private.recent_password()))
with check (bucket_id = 'personal-ticket-files' and (storage.foldername(name))[1] = (select auth.uid())::text and (select tickets_private.recent_password()));
