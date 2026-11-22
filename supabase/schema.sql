-- TheAppleBook 3.0 — Supabase SQL
-- Run this entire file once in Supabase Dashboard → SQL Editor.
-- Roles are stored in the database, never in editable user metadata.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 32),
  bio text not null default '' check (char_length(bio) <= 240),
  status text check (status is null or status in ('Интересуюсь','Свободен/свободна','В отношениях')),
  role text not null default 'member' check (role in ('owner','ceo','deputy_ceo','admin','moderator','member')),
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique(requester_id, recipient_id),
  check (requester_id <> recipient_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists friendships_recipient_status_idx on public.friendships(recipient_id,status);
create index if not exists friendships_requester_status_idx on public.friendships(requester_id,status);
create index if not exists posts_created_at_idx on public.posts(created_at desc);

-- Create a profile automatically when someone registers.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    'User-' || left(new.id::text, 8)
  );
  insert into public.profiles(id, username)
  values (new.id, chosen_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Role lookup helper. Not exposed through the browser API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

revoke all on function private.current_role() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;

-- Secure role assignment. OWNER cannot be assigned, removed, or changed through this RPC.
create or replace function public.admin_set_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  target_role text;
begin
  actor_role := private.current_role();

  if actor_role not in ('owner','ceo','deputy_ceo','admin') then
    raise exception 'Insufficient permissions';
  end if;

  if new_role not in ('ceo','deputy_ceo','admin','moderator','member') then
    raise exception 'Invalid role';
  end if;

  select role into target_role from public.profiles where id = target_user_id for update;
  if target_role is null then raise exception 'User not found'; end if;
  if target_role = 'owner' then raise exception 'OWNER is protected'; end if;

  if actor_role <> 'owner' then
    if new_role in ('ceo','deputy_ceo') or target_role in ('ceo','deputy_ceo') then
      raise exception 'Only OWNER can manage CEO and Deputy CEO';
    end if;
    if actor_role = 'admin' and new_role not in ('moderator','member') then
      raise exception 'Administrator can only assign Moderator or Member';
    end if;
  end if;

  update public.profiles set role = new_role where id = target_user_id;
end;
$$;

revoke all on function public.admin_set_role(uuid,text) from public, anon;
grant execute on function public.admin_set_role(uuid,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.posts enable row level security;

-- Remove broad default grants, then grant only what the app uses.
revoke all on public.profiles, public.friendships, public.posts from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username,bio,status) on public.profiles to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, delete on public.posts to authenticated;

-- Profiles: signed-in members can find one another; each user edits only safe profile fields.
drop policy if exists "signed in can view profiles" on public.profiles;
create policy "signed in can view profiles" on public.profiles
for select to authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Friend requests: only sender creates; only recipient can accept/reject.
drop policy if exists "users see own friendship rows" on public.friendships;
create policy "users see own friendship rows" on public.friendships
for select to authenticated
using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists "users send own friend requests" on public.friendships;
create policy "users send own friend requests" on public.friendships
for insert to authenticated
with check (requester_id = (select auth.uid()) and status = 'pending');

drop policy if exists "recipient answers request" on public.friendships;
create policy "recipient answers request" on public.friendships
for update to authenticated
using (recipient_id = (select auth.uid()) and status = 'pending')
with check (recipient_id = (select auth.uid()) and status in ('accepted','rejected'));

drop policy if exists "participants remove friendship" on public.friendships;
create policy "participants remove friendship" on public.friendships
for delete to authenticated
using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Posts: only signed-in users can read, create, and delete their own posts.
drop policy if exists "signed in read posts" on public.posts;
create policy "signed in read posts" on public.posts
for select to authenticated using (true);

drop policy if exists "users create own posts" on public.posts;
create policy "users create own posts" on public.posts
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users delete own posts" on public.posts;
create policy "users delete own posts" on public.posts
for delete to authenticated
using (user_id = (select auth.uid()));

-- IMPORTANT: after Viktor registers, run the OWNER bootstrap statement from README.
