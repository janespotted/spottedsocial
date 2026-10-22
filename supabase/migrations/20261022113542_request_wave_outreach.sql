-- Website forms accept readable US numbers; other countries require an explicit +.
-- Keep auth's existing phone normalizer unchanged.
create function spotted_private.request_phone(raw text) returns text language sql immutable set search_path='' as $$
 with cleaned as(select regexp_replace(raw,'[^0-9]','','g') d)
 select case when raw ~ '[^0-9[:space:]()+.\-]' then null
 when btrim(raw) like '+%' then spotted_private.launch_phone('+'||d)
 when length(d)=10 then spotted_private.launch_phone('+1'||d)
 when length(d)=11 and d like '1%' then spotted_private.launch_phone('+'||d) end from cleaned
$$;
revoke all on function spotted_private.request_phone(text) from public,anon,authenticated;
-- Link private website requests to the existing guest list. Never grant access here.
alter table spotted_private.invite_requests add column guest_id uuid references spotted_private.launch_guests(id) on delete set null;
create index invite_requests_guest_idx on spotted_private.invite_requests(guest_id) where guest_id is not null;
alter function public.requested_invites(text,jsonb) set schema spotted_private;
alter function spotted_private.requested_invites(text,jsonb) rename to requested_invites_v1;
revoke all on function spotted_private.requested_invites_v1(text,jsonb) from public,anon,authenticated;

create function spotted_private.requested_invites(p_action text default 'list',p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare result jsonb; r spotted_private.invite_requests; g spotted_private.launch_guests; w spotted_private.launch_waves; phone_number text; target uuid;
begin
 perform spotted_private.require_launch_admin();
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request';end if;
 if p_action='list' then
  result:=spotted_private.requested_invites_v1(p_action,p_data);
  return result || jsonb_build_object(
   'waves',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'status',w.status,'capacity',w.capacity,'selected',(select count(*) from spotted_private.launch_guests x where x.wave_id=w.id)) order by w.created_at,w.id) from spotted_private.launch_waves w),'[]'::jsonb),
   'rows',coalesce((select jsonb_agg(item || jsonb_build_object('guest_id',g.id,'wave_id',g.wave_id,'wave_name',w.name,'assigned_phone',g.phone,'locked',g.activated_at is not null or g.claimed_by is not null or g.revoked_at is not null or g.suppressed_at is not null) order by position)
    from jsonb_array_elements(result->'rows') with ordinality a(item,position)
    join spotted_private.invite_requests r on r.id=item->>'id'
    left join spotted_private.launch_guests g on g.id=r.guest_id or (r.guest_id is null and g.phone=spotted_private.request_phone(r.phone))
    left join spotted_private.launch_waves w on w.id=g.wave_id),'[]'::jsonb));
 elsif p_action<>'assign' then return spotted_private.requested_invites_v1(p_action,p_data);end if;
 -- Same lock used by imports, nominations, assignments and wave opening.
 perform 1 from spotted_private.launch_settings where singleton for update;
 select * into r from spotted_private.invite_requests where id=p_data->>'id' for update;
 if r.id is null then raise exception 'Request not found. Refresh the list.';end if;
 target:=(p_data->>'wave')::uuid;
 select * into w from spotted_private.launch_waves where id=target for update;
 if w.id is null or w.status<>'draft' then raise exception 'Choose a wave that is still preparing.';end if;
 phone_number:=spotted_private.request_phone(coalesce(nullif(p_data->>'phone',''),r.phone));
 if r.guest_id is not null then select * into g from spotted_private.launch_guests where id=r.guest_id for update;phone_number:=g.phone;end if;
 if phone_number is null then raise exception 'Add a valid phone number, including the country code outside the US.';end if;
 if exists(select 1 from auth.users u join spotted_private.launch_members m on m.user_id=u.id and m.completed_at is not null where spotted_private.launch_phone(u.phone)=phone_number) then raise exception 'This person has already joined Spotted.';end if;
 perform spotted_private.sync_launch_guests();
 select * into g from spotted_private.launch_guests where phone=phone_number for update;
 if g.id is null and exists(select 1 from spotted_private.launch_nominations where phone=phone_number) then raise exception 'This number has an unfinished nomination. Review it before selecting a wave.';end if;
 if g.id is null then
  insert into spotted_private.launch_guests(phone,name,source) values(phone_number,left(r.first_name||' '||r.last_name,80),'seed') returning * into g;
 end if;
 if g.activated_at is not null or g.claimed_by is not null or g.revoked_at is not null or g.suppressed_at is not null then raise exception 'This invitation is already active or unavailable. Review it in its wave.';end if;
 if g.wave_id is distinct from target then
  if g.wave_id is distinct from nullif(p_data->>'fromWave','')::uuid then raise exception 'Their wave changed. Refresh before moving them.';end if;
  if g.wave_id is not null then perform spotted_private.launch_admin('remove',jsonb_build_object('guests',jsonb_build_array(g.id)));end if;
  perform spotted_private.launch_admin('assign',jsonb_build_object('id',target,'guests',jsonb_build_array(g.id)));
 end if;
 update spotted_private.invite_requests set guest_id=g.id,reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,auth.uid()) where id=r.id;
 insert into spotted_private.launch_audit(actor,action,target,details) values(auth.uid(),'request_assign',g.id,jsonb_build_object('request',r.id,'wave',target));
 return jsonb_build_object('ok',true,'guest_id',g.id,'wave_name',w.name);
end $$;
create function public.requested_invites(p_action text default 'list',p_data jsonb default '{}') returns jsonb language sql set search_path='' as $$select spotted_private.requested_invites(p_action,p_data)$$;
revoke all on function public.requested_invites(text,jsonb),spotted_private.requested_invites(text,jsonb) from public,anon;
grant execute on function public.requested_invites(text,jsonb),spotted_private.requested_invites(text,jsonb) to authenticated;

-- Durable receipt for each reviewed batch. Message uniqueness remains per guest,
-- shared with individual sending, so retries cannot enqueue a second invitation.
create table spotted_private.launch_outreach_batches (
 id uuid primary key, wave_id uuid not null references spotted_private.launch_waves(id),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 review_token text not null, recipient_count integer not null check(recipient_count between 1 and 500)
);
alter table spotted_private.launch_outreach_batches enable row level security;
revoke all on spotted_private.launch_outreach_batches from public,anon,authenticated;
alter table spotted_private.launch_messages add column batch_id uuid references spotted_private.launch_outreach_batches(id);
create index launch_messages_batch_idx on spotted_private.launch_messages(batch_id) where batch_id is not null;

create function spotted_private.launch_outreach(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare w spotted_private.launch_waves; s spotted_private.launch_settings; receipt spotted_private.launch_outreach_batches;
 rows jsonb; result jsonb; message text; token text; n integer; batch uuid; blockers jsonb:='[]';
begin
 perform spotted_private.require_launch_admin();
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request';end if;
 if p_action not in('review','queue') then raise exception 'Unknown outreach action';end if;
 if p_action='queue' then
  perform 1 from spotted_private.launch_settings where singleton for update;
  batch:=(p_data->>'requestId')::uuid;
  if batch is null then raise exception 'Review the recipients first.';end if;
  select * into receipt from spotted_private.launch_outreach_batches where id=batch;
  if receipt.id is not null then
   if receipt.wave_id is distinct from (p_data->>'wave')::uuid or receipt.review_token is distinct from p_data->>'token' then raise exception 'This send request belongs to another review.';end if;
   return jsonb_build_object('batchId',receipt.id,'queued',receipt.recipient_count,'replayed',true);
  end if;
 end if;
 select * into w from spotted_private.launch_waves where id=(p_data->>'wave')::uuid;
 if w.id is null then raise exception 'Wave not found.';end if;
 select * into s from spotted_private.launch_settings where singleton;
 message:='Spotted: your New York invitation is open. Join with the phone number receiving this text: '||coalesce(s.install_url,'[Add the app download link]')||' Reply STOP to opt out.';
 select coalesce(jsonb_agg(to_jsonb(t) order by t.name,t.id),'[]') into rows from (
  select g.id,g.name,g.phone,msg.status as delivery,
   case when g.suppressed_at is not null then 'Opted out'
    when g.revoked_at is not null then 'Revoked'
    when g.claimed_by is not null or exists(select 1 from auth.users u join spotted_private.launch_members m on m.user_id=u.id and m.completed_at is not null where spotted_private.launch_phone(u.phone)=g.phone) then 'Already joining or joined'
    when msg.status='failed' then 'Failed — review individually'
    when msg.status='unknown' or msg.status='sending' and msg.updated_at<now()-interval '5 minutes' then 'Delivery uncertain — review individually'
    when msg.id is not null then 'Already queued or sent'
    when g.invited_at is not null then 'Already invited'
    when g.consent_at is null then 'Needs SMS permission'
    else 'Ready' end as readiness
  from spotted_private.launch_guests g left join spotted_private.launch_messages msg on msg.guest_id=g.id where g.wave_id=w.id
 )t;
 select count(*) into n from jsonb_array_elements(rows) x where x->>'readiness'='Ready';
 if w.status<>'open' then blockers:=blockers||jsonb_build_array('Review and open this wave.');end if;
 if not s.wave_gate or not s.require_phone then blockers:=blockers||jsonb_build_array('Enable phone-based invitations in Launch settings.');end if;
 if s.install_url is null then blockers:=blockers||jsonb_build_array('Save a working TestFlight or App Store link in Launch settings.');end if;
 if not s.sms_enabled then blockers:=blockers||jsonb_build_array('Configure and verify the invitation SMS sender.');end if;
 if n=0 then blockers:=blockers||jsonb_build_array('No new recipients are ready to text.');end if;
 token:=md5(jsonb_build_object('wave',to_jsonb(w),'settings',to_jsonb(s),'rows',rows,'message',message)::text);
 result:=jsonb_build_object('wave',to_jsonb(w),'rows',rows,'message',message,'token',token,'ready',n,'total',jsonb_array_length(rows),'blockers',blockers);
 if p_action='review' then return result;end if;
 if p_data->>'token' is distinct from token then raise exception 'The guest list or setup changed. Review it again before sending.';end if;
 if jsonb_array_length(blockers)>0 then raise exception 'Finish the launch checklist before sending.';end if;
 insert into spotted_private.launch_outreach_batches(id,wave_id,created_by,review_token,recipient_count) values(batch,w.id,auth.uid(),token,n);
 insert into spotted_private.launch_messages(guest_id,body,batch_id)
 select (x->>'id')::uuid,message,batch from jsonb_array_elements(rows) x where x->>'readiness'='Ready';
 insert into spotted_private.launch_audit(actor,action,target,details) values(auth.uid(),'queue_wave_sms',w.id,jsonb_build_object('batch',batch,'count',n));
 return jsonb_build_object('batchId',batch,'queued',n,'replayed',false);
end $$;
create function public.launch_outreach(p_action text,p_data jsonb default '{}') returns jsonb language sql set search_path='' as $$select spotted_private.launch_outreach(p_action,p_data)$$;
revoke all on function public.launch_outreach(text,jsonb),spotted_private.launch_outreach(text,jsonb) from public,anon;
grant execute on function public.launch_outreach(text,jsonb),spotted_private.launch_outreach(text,jsonb) to authenticated;

-- A sender run is scoped to the reviewed batch/wave (or one guest). Old clients
-- retain the original queue behavior. Every claim rechecks current eligibility.
alter function spotted_private.launch_message_job(text,jsonb) rename to launch_message_job_v1;
revoke all on function spotted_private.launch_message_job_v1(text,jsonb) from public,anon,authenticated,service_role;
create function spotted_private.launch_message_job(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare job spotted_private.launch_messages;
begin
 if p_action<>'claim' then return spotted_private.launch_message_job_v1(p_action,p_data);end if;
 if not(select sms_enabled and wave_gate and require_phone from spotted_private.launch_settings where singleton) then return null;end if;
 update spotted_private.launch_messages set status='unknown',updated_at=now() where status='sending' and updated_at<now()-interval '5 minutes';
 select m.* into job from spotted_private.launch_messages m join spotted_private.launch_guests g on g.id=m.guest_id join spotted_private.launch_waves w on w.id=g.wave_id
 where m.status='queued' and g.consent_at is not null and g.suppressed_at is null and g.revoked_at is null and g.claimed_by is null and g.invited_at is null and g.activated_at is not null and w.status='open'
 and not exists(select 1 from auth.users u join spotted_private.launch_members lm on lm.user_id=u.id and lm.completed_at is not null where spotted_private.launch_phone(u.phone)=g.phone)
 and (nullif(p_data->>'waveId','') is null or g.wave_id=(p_data->>'waveId')::uuid)
 and (nullif(p_data->>'batchId','') is null or m.batch_id=(p_data->>'batchId')::uuid)
 and (nullif(p_data->>'guestId','') is null or g.id=(p_data->>'guestId')::uuid)
 order by m.created_at,m.id for update of m skip locked limit 1;
 if job.id is null then return null;end if;
 update spotted_private.launch_messages set status='sending',updated_at=now() where id=job.id;
 return jsonb_build_object('id',job.id,'to',(select phone from spotted_private.launch_guests where id=job.guest_id),'body',job.body);
end $$;
create or replace function public.launch_message_job(p_action text,p_data jsonb default '{}') returns jsonb language sql set search_path='' as $$select spotted_private.launch_message_job(p_action,p_data)$$;
revoke all on function spotted_private.launch_message_job(text,jsonb),public.launch_message_job(text,jsonb) from public,anon,authenticated;
grant execute on function spotted_private.launch_message_job(text,jsonb),public.launch_message_job(text,jsonb) to service_role;
notify pgrst,'reload schema';
