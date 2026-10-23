-- Explicit wave-scoped removal for the admin UI. Retain the existing internal
-- remove action used by transactional moves between draft waves.
create function spotted_private.remove_from_wave(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; ids uuid[]; removing uuid[]; w spotted_private.launch_waves;
begin
 perform spotted_private.require_launch_admin();
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid removal request'; end if;
 target:=nullif(p_data->>'wave','')::uuid;
 if target is null or jsonb_typeof(p_data->'guests') is distinct from 'array' then raise exception 'Choose a wave and 1–500 people'; end if;
 if jsonb_array_length(p_data->'guests') not between 1 and 500 then raise exception 'Choose a wave and 1–500 people'; end if;
 select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_data->'guests');
 if array_position(ids,null) is not null then raise exception 'Refresh the guest list before removing people'; end if;
 -- Same lock as assignments/opening/outreach, followed by guest row locks so
 -- a concurrent invitation claim cannot race the protected-member check.
 perform 1 from spotted_private.launch_settings where singleton for update;
 select * into w from spotted_private.launch_waves where id=target for update;
 if w.id is null or w.status<>'draft' then raise exception 'Opened waves keep their membership history. Review unused invitations in guest details.'; end if;
 perform 1 from spotted_private.launch_guests where id=any(ids) order by id for update;
 if (select count(*) from spotted_private.launch_guests where id=any(ids))<>cardinality(ids) then raise exception 'The guest list changed. Refresh before removing people.'; end if;
 if exists(select 1 from spotted_private.launch_guests where id=any(ids) and wave_id is not null and wave_id<>target) then raise exception 'Someone moved to another wave. Refresh before removing them.'; end if;
 if exists(select 1 from spotted_private.launch_guests where id=any(ids) and
   (activated_at is not null or invited_at is not null or claimed_by is not null or claimed_at is not null or revoked_at is not null)) then
   raise exception 'Someone already has an active invitation or has started joining. Review their guest details; no people were removed.';
 end if;
 select array_agg(id order by id) into removing from spotted_private.launch_guests where id=any(ids) and wave_id=target;
 -- A retry after an uncertain response is a harmless no-op. It does not
 -- create a second audit event or report people as removed twice.
 if removing is null then return jsonb_build_object('ok',true,'removed',0); end if;
 update spotted_private.launch_guests set wave_id=null where id=any(removing);
 insert into spotted_private.launch_audit(actor,action,target,details)
 values(auth.uid(),'remove',target,jsonb_build_object('count',cardinality(removing)));
 return jsonb_build_object('ok',true,'removed',cardinality(removing));
end $$;
revoke all on function spotted_private.remove_from_wave(jsonb) from public,anon,authenticated;
grant execute on function spotted_private.remove_from_wave(jsonb) to authenticated;

create or replace function public.launch_admin(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$
 select case when p_action='remove_from_wave' then spotted_private.remove_from_wave(p_data)
 else spotted_private.launch_admin(p_action,p_data) end
$$;
revoke all on function public.launch_admin(text,jsonb) from public,anon;
grant execute on function public.launch_admin(text,jsonb) to authenticated;
