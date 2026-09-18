-- Pager Phase 2: database schema, anonymous identities, and row-level security.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
revoke all on schema public from public;
grant usage on schema public to anon, authenticated, service_role;

-- New objects should not become reachable through the Data API by accident.
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null unique
    check (char_length(display_name) between 8 and 40)
    check (display_name ~ '^[A-Za-z]+-[0-9]{6}$'),
  created_at timestamptz not null default now()
);

create table public.pages (
  id bigint generated always as identity primary key,
  canonical_url text not null unique
    check (char_length(canonical_url) between 1 and 2048),
  domain text not null
    check (char_length(domain) between 1 and 253),
  title text not null default ''
    check (char_length(title) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  score bigint not null default 0,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table public.comments (
  id bigint generated always as identity primary key,
  page_id bigint not null references public.pages (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  parent_id bigint references public.comments (id) on delete set null,
  body text not null
    check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'visible'
    check (status in ('visible', 'deleted', 'removed')),
  score bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.page_votes (
  page_id bigint not null references public.pages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (page_id, user_id)
);

create table public.comment_votes (
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  comment_id bigint not null references public.comments (id) on delete cascade,
  reason text not null
    check (reason in ('spam', 'harassment', 'hate', 'misinformation', 'other')),
  details text not null default ''
    check (char_length(details) <= 1000),
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_id, comment_id)
);

create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Index foreign keys and the filters used by the extension and RLS policies.
create index pages_created_by_idx on public.pages (created_by);
create index pages_domain_activity_idx on public.pages (domain, last_activity_at desc);
create index comments_page_visible_created_idx on public.comments (page_id, created_at desc)
  where status = 'visible';
create index comments_author_id_idx on public.comments (author_id);
create index comments_parent_id_idx on public.comments (parent_id);
create index page_votes_user_id_idx on public.page_votes (user_id);
create index comment_votes_user_id_idx on public.comment_votes (user_id);
create index reports_comment_id_idx on public.reports (comment_id);
create index reports_status_created_idx on public.reports (status, created_at desc);
create index blocks_blocked_id_idx on public.blocks (blocked_id);

-- Stable pseudonyms are assigned once when an Auth user is created.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  adjectives constant text[] := array[
    'Amber', 'Brisk', 'Calm', 'Copper', 'Clever', 'Gentle', 'Jolly', 'Kind',
    'Lucky', 'Mellow', 'Nimble', 'Quiet', 'Silver', 'Sunny', 'Swift', 'Wise'
  ];
  animals constant text[] := array[
    'Badger', 'Falcon', 'Fox', 'Heron', 'Koala', 'Lynx', 'Otter', 'Panda',
    'Raven', 'Robin', 'Seal', 'Tiger', 'Turtle', 'Whale', 'Wolf', 'Wren'
  ];
  attempt integer;
  digest text;
  candidate text;
begin
  for attempt in 0..15 loop
    digest := pg_catalog.md5(new.id::text || ':' || attempt::text);
    candidate :=
      adjectives[(pg_catalog.get_byte(pg_catalog.decode(digest, 'hex'), 0) % array_length(adjectives, 1)) + 1]
      || animals[(pg_catalog.get_byte(pg_catalog.decode(digest, 'hex'), 1) % array_length(animals, 1)) + 1]
      || '-'
      || pg_catalog.lpad((((('x' || pg_catalog.substr(digest, 1, 8))::bit(32)::bigint) % 1000000)::text), 6, '0');

    insert into public.profiles (id, display_name)
    values (new.id, candidate)
    on conflict (display_name) do nothing;

    if found then
      return new;
    end if;
  end loop;

  raise exception 'Unable to allocate a Pager display name';
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function private.set_updated_at();
create trigger page_votes_set_updated_at
  before update on public.page_votes
  for each row execute function private.set_updated_at();
create trigger comment_votes_set_updated_at
  before update on public.comment_votes
  for each row execute function private.set_updated_at();
create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function private.set_updated_at();

create or replace function private.validate_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.comments parent
    where parent.id = new.parent_id
      and parent.page_id = new.page_id
      and parent.status = 'visible'
  ) then
    raise exception 'Parent comment must be visible and belong to the same page';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_comment_parent() from public, anon, authenticated;

create trigger comments_validate_parent
  before insert or update of parent_id, page_id on public.comments
  for each row execute function private.validate_comment_parent();

create or replace function private.apply_page_vote_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_page_id bigint := coalesce(new.page_id, old.page_id);
  delta integer := case tg_op
    when 'INSERT' then new.value
    when 'UPDATE' then new.value - old.value
    when 'DELETE' then -old.value
  end;
begin
  update public.pages
  set score = score + delta,
      last_activity_at = now()
  where id = target_page_id;
  return coalesce(new, old);
end;
$$;

revoke all on function private.apply_page_vote_score() from public, anon, authenticated;

create trigger page_votes_apply_score
  after insert or update of value or delete on public.page_votes
  for each row execute function private.apply_page_vote_score();

create or replace function private.apply_comment_vote_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_comment_id bigint := coalesce(new.comment_id, old.comment_id);
  target_page_id bigint;
  delta integer := case tg_op
    when 'INSERT' then new.value
    when 'UPDATE' then new.value - old.value
    when 'DELETE' then -old.value
  end;
begin
  update public.comments
  set score = score + delta
  where id = target_comment_id
  returning page_id into target_page_id;

  update public.pages
  set last_activity_at = now()
  where id = target_page_id;

  return coalesce(new, old);
end;
$$;

revoke all on function private.apply_comment_vote_score() from public, anon, authenticated;

create trigger comment_votes_apply_score
  after insert or update of value or delete on public.comment_votes
  for each row execute function private.apply_comment_vote_score();

create or replace function private.touch_page_from_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pages
  set last_activity_at = now()
  where id = coalesce(new.page_id, old.page_id);
  return coalesce(new, old);
end;
$$;

revoke all on function private.touch_page_from_comment() from public, anon, authenticated;

create trigger comments_touch_page
  after insert or update of body, status on public.comments
  for each row execute function private.touch_page_from_comment();

alter table public.profiles enable row level security;
alter table public.pages enable row level security;
alter table public.comments enable row level security;
alter table public.page_votes enable row level security;
alter table public.comment_votes enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

create policy profiles_read on public.profiles
  for select to anon, authenticated using (true);

create policy pages_read on public.pages
  for select to anon, authenticated using (true);
create policy pages_insert_own on public.pages
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy comments_read_public on public.comments
  for select to anon using (status = 'visible');
create policy comments_read_authenticated on public.comments
  for select to authenticated
  using (status = 'visible' or author_id = (select auth.uid()));
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'visible');
create policy comments_update_own on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and status in ('visible', 'deleted')
  );

create policy page_votes_read_own on public.page_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy page_votes_insert_own on public.page_votes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy page_votes_update_own on public.page_votes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy page_votes_delete_own on public.page_votes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy comment_votes_read_own on public.comment_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy comment_votes_insert_own on public.comment_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comments
      where comments.id = comment_votes.comment_id
        and comments.status = 'visible'
    )
  );
create policy comment_votes_update_own on public.comment_votes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comments
      where comments.id = comment_votes.comment_id
        and comments.status = 'visible'
    )
  );
create policy comment_votes_delete_own on public.comment_votes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy reports_read_own on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));
create policy reports_insert_own on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));

create policy blocks_read_own on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- Explicit API privileges: RLS decides which rows each user may access.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.pages, public.comments to anon, authenticated;
grant insert on public.pages to authenticated;
grant insert on public.comments to authenticated;
grant update (body, status) on public.comments to authenticated;
grant select, insert, delete on public.page_votes, public.comment_votes to authenticated;
grant update (value) on public.page_votes, public.comment_votes to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert, delete on public.blocks to authenticated;

grant usage, select on sequence public.pages_id_seq to authenticated;
grant usage, select on sequence public.comments_id_seq to authenticated;
grant usage, select on sequence public.reports_id_seq to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
