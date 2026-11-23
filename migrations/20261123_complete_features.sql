-- TheAppleBook: feature-completion migration
-- Run once in Supabase Dashboard -> SQL Editor.
-- Safe to re-run: objects are created conditionally and policies are replaced.

begin;

-- ---------------------------------------------------------------------------
-- Profiles: fields used by the current frontend
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists handle text,
  add column if not exists avatar_url text,
  add column if not exists avatar_emoji text,
  add column if not exists interest text,
  add column if not exists language text not null default 'ru',
  add column if not exists featured_achievement text,
  add column if not exists show_achievement boolean not null default false,
  add column if not exists reputation_level integer not null default 1,
  add column if not exists account_state text not null default 'active',
  add column if not exists profile_views_enabled boolean not null default true,
  add column if not exists username_normalized text generated always as
    (lower(regexp_replace(trim(username), '\s+', ' ', 'g'))) stored;

do $$
begin
  if exists (
    select 1 from public.profiles
    group by username_normalized
    having count(*) > 1
  ) then
    raise exception 'Duplicate usernames after normalization. Rename case/space variants in profiles.username, then rerun this migration.';
  end if;
end $$;
create unique index if not exists profiles_username_normalized_uidx
  on public.profiles(username_normalized);
create unique index if not exists profiles_handle_lower_uidx
  on public.profiles(lower(handle)) where handle is not null and handle <> '';

alter table public.profiles
  drop constraint if exists profiles_account_state_check;
alter table public.profiles
  add constraint profiles_account_state_check
  check (account_state in ('active','deactivated','suspended'));

grant update (username,bio,status,handle,avatar_url,avatar_emoji,interest,language,
              featured_achievement,show_achievement,profile_views_enabled)
on public.profiles to authenticated;

-- Posts can be edited by their owner.
grant update (content) on public.posts to authenticated;
drop policy if exists "users update own posts" on public.posts;
create policy "users update own posts" on public.posts
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private profile data and presence
-- ---------------------------------------------------------------------------
create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  phone_visible boolean not null default false,
  birth_date date,
  birth_date_visible boolean not null default false,
  presence_mode text not null default 'online'
    check (presence_mode in ('online','invisible','sleep')),
  updated_at timestamptz not null default now()
);

alter table public.profile_private enable row level security;
revoke all on public.profile_private from anon, authenticated;
grant select, insert, update, delete on public.profile_private to authenticated;

drop policy if exists "users manage own private profile" on public.profile_private;
create policy "users manage own private profile" on public.profile_private
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.visible_presence(target_user uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when target_user = (select auth.uid()) then coalesce(pp.presence_mode, 'online')
    when pp.presence_mode = 'invisible' then 'hidden'
    else coalesce(pp.presence_mode, 'online')
  end
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = target_user;
$$;

create or replace function public.visible_presence_many(target_users uuid[])
returns table(user_id uuid, presence_mode text)
language sql stable security definer
set search_path = ''
as $$
  select p.id,
    case
      when p.id = (select auth.uid()) then coalesce(pp.presence_mode, 'online')
      when pp.presence_mode = 'invisible' then 'hidden'
      else coalesce(pp.presence_mode, 'online')
    end
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = any(target_users);
$$;

create or replace function public.visible_profile_private(target_user uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'phone', case when pp.phone_visible then pp.phone else null end,
    'age', case
      when pp.birth_date_visible and pp.birth_date is not null
      then extract(year from age(current_date, pp.birth_date))::integer
      else null
    end
  )
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = target_user;
$$;

revoke all on function public.visible_presence(uuid) from public, anon;
revoke all on function public.visible_presence_many(uuid[]) from public, anon;
revoke all on function public.visible_profile_private(uuid) from public, anon;
grant execute on function public.visible_presence(uuid) to authenticated;
grant execute on function public.visible_presence_many(uuid[]) to authenticated;
grant execute on function public.visible_profile_private(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private notes
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id bigint generated by default as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_owner_updated_idx
  on public.notes(owner_id, updated_at desc);
alter table public.notes enable row level security;
revoke all on public.notes from anon, authenticated;
grant select, insert, update, delete on public.notes to authenticated;
drop policy if exists "owners manage their notes" on public.notes;
create policy "owners manage their notes" on public.notes
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Post comments
-- ---------------------------------------------------------------------------
create table if not exists public.post_comments (
  id bigint generated by default as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_created_idx
  on public.post_comments(post_id, created_at);
alter table public.post_comments enable row level security;
revoke all on public.post_comments from anon, authenticated;
grant select, insert, delete on public.post_comments to authenticated;
drop policy if exists "signed in read post comments" on public.post_comments;
create policy "signed in read post comments" on public.post_comments
for select to authenticated using (true);
drop policy if exists "users create own post comments" on public.post_comments;
create policy "users create own post comments" on public.post_comments
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "users delete own post comments" on public.post_comments;
create policy "users delete own post comments" on public.post_comments
for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Wallet, transactions, gifts and daily rewards
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_transactions (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  kind text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists token_transactions_user_created_idx
  on public.token_transactions(user_id, created_at desc);

create table if not exists public.gifts (
  id bigint generated by default as identity primary key,
  name text not null unique,
  rarity text not null,
  price bigint not null check (price > 0),
  emoji text not null
);

insert into public.gifts(name,rarity,price,emoji) values
 ('Яблоко','Обычный',25,'🍎'),
 ('Звезда','Обычный',35,'⭐'),
 ('Сердце','Обычный',40,'❤️'),
 ('Кофе','Обычный',50,'☕'),
 ('Цветок','Необычный',75,'🌷'),
 ('Луна','Необычный',90,'🌙'),
 ('Корона','Редкий',150,'👑'),
 ('Кристалл','Редкий',180,'💎'),
 ('Винил','Редкий',220,'💿'),
 ('Медведь','Эпический',350,'🧸'),
 ('Дракон','Эпический',450,'🐉'),
 ('Феникс','Эпический',500,'🔥'),
 ('Золотое яблоко','Легендарный',750,'🌟'),
 ('Сапфир','Легендарный',900,'🔷'),
 ('Реликвия','Легендарный',1100,'🏺'),
 ('Галактика','Мифический',1500,'🌌'),
 ('Комета','Мифический',1800,'☄️'),
 ('Королевский лев','Мифический',2200,'🦁'),
 ('Вечность','Мифический',3000,'♾️'),
 ('TheAppleBook','Мифический',5000,'🍏')
on conflict (name) do nothing;

create table if not exists public.daily_token_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  claim_date date not null default current_date,
  primary key(user_id, claim_date)
);
create table if not exists public.staff_token_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  claim_date date not null default current_date,
  primary key(user_id, claim_date)
);

create table if not exists public.sent_gifts (
  id bigint generated by default as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  gift_id bigint not null references public.gifts(id),
  message text not null default '',
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

alter table public.wallets enable row level security;
alter table public.token_transactions enable row level security;
alter table public.gifts enable row level security;
alter table public.daily_token_claims enable row level security;
alter table public.staff_token_claims enable row level security;
alter table public.sent_gifts enable row level security;

revoke all on public.wallets,public.token_transactions,public.gifts,
  public.daily_token_claims,public.staff_token_claims,public.sent_gifts
from anon,authenticated;
grant select on public.wallets,public.token_transactions,public.gifts,public.sent_gifts to authenticated;

drop policy if exists "users read own wallet" on public.wallets;
create policy "users read own wallet" on public.wallets
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "users read own token history" on public.token_transactions;
create policy "users read own token history" on public.token_transactions
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "signed in read gifts" on public.gifts;
create policy "signed in read gifts" on public.gifts
for select to authenticated using (true);
drop policy if exists "participants read sent gifts" on public.sent_gifts;
create policy "participants read sent gifts" on public.sent_gifts
for select to authenticated using (
  sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
);

create or replace function public.ensure_wallet_for_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.wallets(user_id) values(new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists create_wallet_for_profile on public.profiles;
create trigger create_wallet_for_profile after insert on public.profiles
for each row execute function public.ensure_wallet_for_profile();
insert into public.wallets(user_id)
select id from public.profiles on conflict(user_id) do nothing;

create or replace function public.claim_daily_tokens()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.daily_token_claims(user_id,claim_date)
  values(uid,current_date);
  insert into public.wallets(user_id,balance) values(uid,250)
  on conflict(user_id) do update
    set balance = public.wallets.balance + 250, updated_at = now();
  insert into public.token_transactions(user_id,amount,kind)
  values(uid,250,'daily_reward');
  return 250;
exception when unique_violation then
  raise exception 'Daily reward already claimed';
end;
$$;

create or replace function public.admin_grant_self_tokens()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); actor_role text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  actor_role := private.current_role();
  if actor_role not in ('owner','ceo','deputy_ceo','admin','moderator') then
    raise exception 'Only staff can claim this bonus';
  end if;
  insert into public.staff_token_claims(user_id,claim_date) values(uid,current_date);
  insert into public.wallets(user_id,balance) values(uid,2500)
  on conflict(user_id) do update
    set balance = public.wallets.balance + 2500, updated_at = now();
  insert into public.token_transactions(user_id,amount,kind)
  values(uid,2500,'staff_daily_bonus');
  return 2500;
exception when unique_violation then
  raise exception 'Staff bonus already claimed today';
end;
$$;

create or replace function public.send_gift(target_user_id uuid, selected_gift_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); cost bigint; gift_name text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_user_id = uid then raise exception 'You cannot send a gift to yourself'; end if;
  select price,name into cost,gift_name from public.gifts where id=selected_gift_id;
  if cost is null then raise exception 'Gift not found'; end if;
  insert into public.wallets(user_id) values(uid),(target_user_id)
  on conflict(user_id) do nothing;
  perform 1 from public.wallets where user_id=uid for update;
  update public.wallets set balance=balance-cost,updated_at=now()
    where user_id=uid and balance>=cost;
  if not found then raise exception 'Not enough tokens'; end if;
  update public.wallets set balance=balance+cost,updated_at=now()
    where user_id=target_user_id;
  insert into public.sent_gifts(sender_id,recipient_id,gift_id)
    values(uid,target_user_id,selected_gift_id);
  insert into public.token_transactions(user_id,amount,kind,details)
    values(uid,-cost,'gift_sent',jsonb_build_object('gift',gift_name,'recipient',target_user_id));
  insert into public.token_transactions(user_id,amount,kind,details)
    values(target_user_id,cost,'gift_received',jsonb_build_object('gift',gift_name,'sender',uid));
end;
$$;

revoke all on function public.claim_daily_tokens() from public,anon;
revoke all on function public.admin_grant_self_tokens() from public,anon;
revoke all on function public.send_gift(uuid,bigint) from public,anon;
grant execute on function public.claim_daily_tokens() to authenticated;
grant execute on function public.admin_grant_self_tokens() to authenticated;
grant execute on function public.send_gift(uuid,bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile views
-- ---------------------------------------------------------------------------
create table if not exists public.profile_views (
  id bigint generated by default as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  check (profile_id <> viewer_id)
);
create index if not exists profile_views_owner_time_idx
  on public.profile_views(profile_id, viewed_at desc);
alter table public.profile_views enable row level security;
revoke all on public.profile_views from anon,authenticated;
grant select on public.profile_views to authenticated;
drop policy if exists "profile owners read their views" on public.profile_views;
create policy "profile owners read their views" on public.profile_views
for select to authenticated using (profile_id=(select auth.uid()));

create or replace function public.record_profile_view(target_profile_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or target_profile_id = auth.uid() then return; end if;
  if exists(select 1 from public.profiles where id=target_profile_id and profile_views_enabled) then
    insert into public.profile_views(profile_id,viewer_id)
    values(target_profile_id,auth.uid());
  end if;
end;
$$;
revoke all on function public.record_profile_view(uuid) from public,anon;
grant execute on function public.record_profile_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Account state and sanctions used by the moderation panel
-- ---------------------------------------------------------------------------
create table if not exists public.account_sanctions (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  moderator_id uuid not null references public.profiles(id),
  reason text not null,
  sanction_type text not null check (sanction_type in ('temporary','permanent')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  revoke_reason text
);
alter table public.account_sanctions enable row level security;
revoke all on public.account_sanctions from anon,authenticated;
grant select on public.account_sanctions to authenticated;
drop policy if exists "users see own sanctions" on public.account_sanctions;
create policy "users see own sanctions" on public.account_sanctions
for select to authenticated using (
  user_id=(select auth.uid()) or private.current_role() in ('owner','ceo','deputy_ceo','admin','moderator')
);

create or replace function public.is_user_sanctioned(target_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=target_user and p.account_state <> 'active'
  ) or exists(
    select 1 from public.account_sanctions s
    where s.user_id=target_user and s.revoked_at is null
      and (s.sanction_type='permanent' or s.expires_at > now())
  );
$$;

create or replace function public.admin_issue_sanction(
  target_user_id uuid, sanction_reason text, duration_hours integer
) returns bigint language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); actor_role text; target_role text; new_id bigint;
begin
  actor_role := private.current_role();
  if actor_role not in ('owner','ceo','deputy_ceo','admin','moderator') then
    raise exception 'Insufficient permissions';
  end if;
  if target_user_id=actor then raise exception 'Cannot sanction yourself'; end if;
  if char_length(trim(sanction_reason)) < 3 then raise exception 'Reason is required'; end if;
  select role into target_role from public.profiles where id=target_user_id;
  if target_role is null then raise exception 'User not found'; end if;
  if target_role='owner' then raise exception 'OWNER is protected'; end if;
  if actor_role='moderator' and target_role in ('ceo','deputy_ceo','admin') then
    raise exception 'Moderator cannot sanction senior staff';
  end if;
  insert into public.account_sanctions(user_id,moderator_id,reason,sanction_type,expires_at)
  values(target_user_id,actor,trim(sanction_reason),
    case when duration_hours is null then 'permanent' else 'temporary' end,
    case when duration_hours is null then null else now()+make_interval(hours=>duration_hours) end)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.admin_revoke_sanction(
  target_sanction_id bigint, reason text
) returns void language plpgsql security definer set search_path = ''
as $$
declare actor_role text;
begin
  actor_role := private.current_role();
  if actor_role not in ('owner','ceo','deputy_ceo','admin','moderator') then
    raise exception 'Insufficient permissions';
  end if;
  if char_length(trim(reason)) < 3 then raise exception 'Reason is required'; end if;
  update public.account_sanctions
    set revoked_at=now(),revoked_by=auth.uid(),revoke_reason=trim(reason)
    where id=target_sanction_id and revoked_at is null;
  if not found then raise exception 'Sanction not found or already revoked'; end if;
end;
$$;

create or replace function public.set_account_deactivated(deactivate boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles
    set account_state=case when deactivate then 'deactivated' else 'active' end
    where id=auth.uid();
end;
$$;

revoke all on function public.is_user_sanctioned(uuid) from public,anon;
revoke all on function public.admin_issue_sanction(uuid,text,integer) from public,anon;
revoke all on function public.admin_revoke_sanction(bigint,text) from public,anon;
revoke all on function public.set_account_deactivated(boolean) from public,anon;
grant execute on function public.is_user_sanctioned(uuid) to authenticated;
grant execute on function public.admin_issue_sanction(uuid,text,integer) to authenticated;
grant execute on function public.admin_revoke_sanction(bigint,text) to authenticated;
grant execute on function public.set_account_deactivated(boolean) to authenticated;

-- Restrictive policies ensure existing permissive insert policies cannot bypass sanctions.
drop policy if exists "sanctioned users cannot create posts" on public.posts;
create policy "sanctioned users cannot create posts" on public.posts
as restrictive for insert to authenticated
with check (not public.is_user_sanctioned((select auth.uid())));
drop policy if exists "sanctioned users cannot comment" on public.post_comments;
create policy "sanctioned users cannot comment" on public.post_comments
as restrictive for insert to authenticated
with check (not public.is_user_sanctioned((select auth.uid())));
drop policy if exists "sanctioned users cannot send friend requests" on public.friendships;
create policy "sanctioned users cannot send friend requests" on public.friendships
as restrictive for insert to authenticated
with check (not public.is_user_sanctioned((select auth.uid())));

drop policy if exists "sanctioned users cannot send messages" on public.messages;
create policy "sanctioned users cannot send messages" on public.messages
as restrictive for insert to authenticated
with check (sender_id = (select auth.uid())
  and not public.is_user_sanctioned((select auth.uid())));

-- ---------------------------------------------------------------------------
-- Message attachments: metadata only; storage bucket is private.
-- ---------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id bigint generated by default as identity primary key,
  message_id uuid not null references public.messages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 10485760),
  created_at timestamptz not null default now()
);
alter table public.message_attachments enable row level security;
revoke all on public.message_attachments from anon,authenticated;
grant select,insert,delete on public.message_attachments to authenticated;
drop policy if exists "chat participants read attachment metadata" on public.message_attachments;
create policy "chat participants read attachment metadata" on public.message_attachments
for select to authenticated using (
  sender_id=(select auth.uid()) or exists(
    select 1 from public.messages m
    where m.id=message_id and m.receiver_id=(select auth.uid())
  )
);
drop policy if exists "sender creates attachment metadata" on public.message_attachments;
create policy "sender creates attachment metadata" on public.message_attachments
for insert to authenticated with check (
  sender_id=(select auth.uid()) and exists(
    select 1 from public.messages m
    where m.id=message_id and m.sender_id=(select auth.uid())
  )
);
drop policy if exists "sender deletes attachment metadata" on public.message_attachments;
create policy "sender deletes attachment metadata" on public.message_attachments
for delete to authenticated using (sender_id=(select auth.uid()));

-- Private storage bucket and object policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('message-files','message-files',false,10485760,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/mp4','application/pdf','text/plain'])
on conflict(id) do update set public=false,file_size_limit=10485760;

drop policy if exists "chat participants upload message files" on storage.objects;
create policy "chat participants upload message files" on storage.objects
for insert to authenticated with check (
  bucket_id='message-files' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "chat participants read message files" on storage.objects;
create policy "chat participants read message files" on storage.objects
for select to authenticated using (
  bucket_id='message-files' and (
    (storage.foldername(name))[1]=auth.uid()::text or exists(
      select 1 from public.message_attachments a
      join public.messages m on m.id=a.message_id
      where a.storage_path=name and m.receiver_id=auth.uid()
    )
  )
);
drop policy if exists "owners delete message files" on storage.objects;
create policy "owners delete message files" on storage.objects
for delete to authenticated using (
  bucket_id='message-files' and (storage.foldername(name))[1]=auth.uid()::text
);



-- Avatar bucket is public so profile photos render for other signed-in users.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=3145728,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "users upload own avatars" on storage.objects;
create policy "users upload own avatars" on storage.objects
for insert to authenticated with check (
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "users update own avatars" on storage.objects;
create policy "users update own avatars" on storage.objects
for update to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
) with check (
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "users delete own avatars" on storage.objects;
create policy "users delete own avatars" on storage.objects
for delete to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at before update on public.notes
for each row execute function public.touch_updated_at();

-- One-time QR login challenges. Secrets are stored only as SHA-256 hashes.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.qr_login_challenges (
  id uuid primary key,
  approval_verifier_hash text not null,
  poll_verifier_hash text not null,
  display_code text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','consumed','expired')),
  approved_user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.qr_login_challenges enable row level security;
revoke all on public.qr_login_challenges from anon,authenticated;

create or replace function public.approve_qr_login(challenge_id uuid, verifier text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  challenge public.qr_login_challenges%rowtype;
  supplied_hash text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if verifier is null or length(verifier) < 20 then raise exception 'Invalid QR verifier'; end if;
  supplied_hash := encode(extensions.digest(convert_to(verifier,'UTF8'),'sha256'),'hex');
  select * into challenge
    from public.qr_login_challenges
    where id=challenge_id
    for update;
  if not found or challenge.status <> 'pending' or challenge.expires_at <= now()
     or challenge.approval_verifier_hash <> supplied_hash then
    raise exception 'QR request is invalid or expired';
  end if;
  update public.qr_login_challenges
    set status='approved',approved_user_id=auth.uid()
    where id=challenge_id;
end;
$$;
revoke all on function public.approve_qr_login(uuid,text) from public,anon;
grant execute on function public.approve_qr_login(uuid,text) to authenticated;

commit;
