-- ═════════════════════════════════════════════════════════════════════
-- Atomic Yap voting (addendum v3 §8.5).
--
-- The client used to write the yap_votes row and then call
-- increment_yap_score() as a second request whose error was discarded. A
-- dropped connection between the two left the vote saved with the count
-- unchanged, permanently — nothing recomputed score from the votes table.
-- vote_on_yap() does both in one transaction and returns the new score;
-- comments_count is now maintained by a trigger for the same reason.
-- increment_yap_score() stays for the web client.
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.vote_on_yap(p_yap_id uuid, p_vote_type text)
returns table (score int, user_vote text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing text;
  v_delta int := 0;
  v_vote text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_vote_type not in ('up', 'down') then
    raise exception 'invalid vote type %', p_vote_type;
  end if;

  -- Serialise concurrent taps on the same yap from the same user.
  perform 1 from yap_messages where id = p_yap_id for update;
  if not found then
    raise exception 'yap not found' using errcode = 'P0002';
  end if;

  select vote_type into v_existing
    from yap_votes where yap_id = p_yap_id and user_id = v_user;

  if v_existing = p_vote_type then
    -- toggle off
    delete from yap_votes where yap_id = p_yap_id and user_id = v_user;
    v_delta := case when p_vote_type = 'up' then -1 else 1 end;
    v_vote := null;
  elsif v_existing is not null then
    -- switch
    update yap_votes set vote_type = p_vote_type
     where yap_id = p_yap_id and user_id = v_user;
    v_delta := case when p_vote_type = 'up' then 2 else -2 end;
    v_vote := p_vote_type;
  else
    insert into yap_votes (yap_id, user_id, vote_type) values (p_yap_id, v_user, p_vote_type);
    v_delta := case when p_vote_type = 'up' then 1 else -1 end;
    v_vote := p_vote_type;
  end if;

  update yap_messages m set score = coalesce(m.score, 0) + v_delta where m.id = p_yap_id;

  return query
    select m.score, v_vote from yap_messages m where m.id = p_yap_id;
end;
$$;

grant execute on function public.vote_on_yap(uuid, text) to authenticated;

-- ── comments_count kept by trigger, not by a client read-modify-write ──
create or replace function public.sync_yap_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update yap_messages set comments_count = coalesce(comments_count, 0) + 1 where id = new.yap_id;
    return new;
  elsif tg_op = 'DELETE' then
    update yap_messages set comments_count = greatest(coalesce(comments_count, 0) - 1, 0) where id = old.yap_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists yap_comments_sync_count on public.yap_comments;
create trigger yap_comments_sync_count
  after insert or delete on public.yap_comments
  for each row execute function public.sync_yap_comments_count();

-- One-off reconciliation so existing rows match their votes and comments.
update yap_messages m
   set score = coalesce((
         select sum(case when v.vote_type = 'up' then 1 else -1 end)
           from yap_votes v where v.yap_id = m.id), 0),
       comments_count = (select count(*) from yap_comments c where c.yap_id = m.id);
