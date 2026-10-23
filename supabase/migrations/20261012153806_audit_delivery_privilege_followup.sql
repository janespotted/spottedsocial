-- These APIs require an authenticated viewer. Keep the unbound helper private.
revoke all on function public.can_see_location(uuid,uuid) from public,anon;
revoke all on function public.can_see_planning(uuid,uuid,text) from public,anon;
grant execute on function public.can_see_location(uuid,uuid) to authenticated,service_role;
grant execute on function public.can_see_planning(uuid,uuid,text) to authenticated,service_role;
revoke all on function public._can_see_location_unchecked(uuid,uuid) from public,anon,authenticated;
grant execute on function public._can_see_location_unchecked(uuid,uuid) to service_role;
