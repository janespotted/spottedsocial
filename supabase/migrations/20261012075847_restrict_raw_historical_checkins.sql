-- Cross-user historical reads go only through the snapshot-checked venue RPC.
-- Existing active check-in consumers keep access to a currently shared venue.
create policy historical_checkins_private on public.checkins as restrictive
 for select to authenticated using (
 user_id=(select auth.uid()) or (
  ended_at is null and venue_id is not null and exists(
   select 1 from public.night_statuses s where s.user_id=checkins.user_id
   and s.venue_id=checkins.venue_id and s.status='out' and s.expires_at>now()
   and not coalesce(s.is_private_party,false)
  )
 )
);
-- A deliberate owner deletion also withdraws its venue memory. Scheduled raw
-- check-in cleanup is not a user deletion and leaves the 90-day memory intact.
create function spotted_private.forget_deleted_venue_visit() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if auth.role()='authenticated' and auth.uid()=old.user_id then
  delete from spotted_private.venue_visits where id=old.id;
 end if;
 return null;
end $$;
revoke all on function spotted_private.forget_deleted_venue_visit() from public,anon,authenticated;
create trigger forget_deleted_venue_visit after delete on public.checkins for each row execute function spotted_private.forget_deleted_venue_visit();
