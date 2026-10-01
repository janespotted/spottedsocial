-- Fast private media + instant revocation (replaces the byte gateway).
--
-- 1. private_media_targets: one authorization call per feed page. The
--    private-media Edge Function turns the allowed items into short-lived
--    Storage signed URLs / Mux signed tokens; bytes load from the CDNs.
-- 2. relationship_events: when a relationship narrows (unfriend, decline,
--    block, close-friend removal) BOTH people get a row, delivered over
--    Realtime postgres_changes (RLS-filtered INSERTs), so the app drops the
--    other person's content immediately instead of polling.
begin;

create function public.private_media_targets(p_paths text[] default '{}', p_playback_ids text[] default '{}')
returns table(kind text, media_key text, expires_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare item text; target jsonb;
begin
 if auth.uid() is null then return; end if;
 if cardinality(coalesce(p_paths,'{}')) + cardinality(coalesce(p_playback_ids,'{}')) > 60
 then raise exception 'Too many media items' using errcode='22023'; end if;
 foreach item in array coalesce(p_paths,'{}') loop
   target := public.private_media_target(item, null);
   if target is not null then
     kind := 'path'; media_key := target->>'path'; expires_at := null; return next;
   end if;
 end loop;
 foreach item in array coalesce(p_playback_ids,'{}') loop
   target := public.private_media_target(null, item);
   if target is not null then
     kind := 'playback'; media_key := target->>'playback_id'; expires_at := (target->>'expires_at')::timestamptz; return next;
   end if;
 end loop;
end $$;
revoke all on function public.private_media_targets(text[],text[]) from public,anon;
grant execute on function public.private_media_targets(text[],text[]) to authenticated;

create table public.relationship_events(
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 other_user_id uuid not null,
 kind text not null check (kind in ('unfriended','blocked','close_friend_removed')),
 created_at timestamptz not null default now()
);
create index relationship_events_user on public.relationship_events(user_id, created_at);
alter table public.relationship_events enable row level security;
revoke all on public.relationship_events from public,anon,authenticated;
grant select on public.relationship_events to authenticated;
grant all on public.relationship_events to service_role;
create policy own_relationship_events on public.relationship_events for select to authenticated using (user_id = auth.uid());

create function spotted_private.emit_relationship_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare a uuid; b uuid; event_kind text;
begin
 if tg_table_name = 'friendships' then a := old.user_id; b := old.friend_id; event_kind := 'unfriended';
 elsif tg_table_name = 'blocked_users' then a := new.blocker_id; b := new.blocked_id; event_kind := 'blocked';
 else a := old.user_id; b := old.close_friend_id; event_kind := 'close_friend_removed';
 end if;
 -- Rows are signals, not history: keep each inbox to the last hour.
 delete from public.relationship_events where user_id in (a, b) and created_at < now() - interval '1 hour';
 insert into public.relationship_events(user_id, other_user_id, kind)
 select x.u, x.o, event_kind from (values (a, b), (b, a)) as x(u, o)
 where exists (select 1 from public.profiles where id = x.u);
 return null;
end $$;
revoke all on function spotted_private.emit_relationship_event() from public,anon,authenticated;

create trigger v1_relationship_event_unfriend after delete on public.friendships
 for each row execute function spotted_private.emit_relationship_event();
create trigger v1_relationship_event_block after insert on public.blocked_users
 for each row execute function spotted_private.emit_relationship_event();
create trigger v1_relationship_event_close after delete on public.close_friends
 for each row execute function spotted_private.emit_relationship_event();

-- Hosted projects always have the publication; synthetic test databases may not.
do $$ begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
   alter publication supabase_realtime add table public.relationship_events;
 end if;
end $$;
commit;
