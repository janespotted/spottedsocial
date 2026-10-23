-- Extend the existing private Requested invites inbox; no admission or sending settings change.
alter table spotted_private.invite_requests
 add column source_kind text not null default 'website' check(source_kind in('website','app')),
 add column requested_by uuid references auth.users(id) on delete cascade,
 add column invitation_texts_at timestamptz,
 alter column form_id drop not null;
alter table spotted_private.invite_requests drop constraint invite_requests_last_name_check;
alter table spotted_private.invite_requests drop constraint invite_requests_email_check;
alter table spotted_private.invite_requests add constraint invite_request_contact_shape check(
 (source_kind='website' and form_id is not null and form_id='6aa44b3bf24f7a00081682c2' and length(last_name) between 1 and 80 and length(email) between 3 and 254)
 or (source_kind='app' and form_id is null and requested_by is not null and last_name='' and email=''));
create unique index invite_requests_member_idx on spotted_private.invite_requests(requested_by) where requested_by is not null;
create index invite_requests_phone_idx on spotted_private.invite_requests(spotted_private.request_phone(phone));

create or replace function spotted_private.launch_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); own_phone text; settings spotted_private.launch_settings; m spotted_private.launch_members; g spotted_private.launch_guests; admitted boolean:=false; needs_phone boolean;
begin
 if u is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into settings from spotted_private.launch_settings where singleton;
 select spotted_private.launch_phone(phone) into own_phone from auth.users where id=u and phone_confirmed_at is not null;
 select * into m from spotted_private.launch_members where user_id=u;
 needs_phone:=(settings.require_phone or settings.wave_gate) and m.completed_at is null;
 -- Previously completed accounts retain access. Incomplete accounts admitted
 -- while access was open do not bypass a subsequently enabled invitation gate.
 if m.completed_at is not null then admitted:=true;
 elsif not settings.wave_gate and (not needs_phone or own_phone is not null) then admitted:=true;
 elsif own_phone is not null then
   select x.* into g from spotted_private.launch_guests x join spotted_private.launch_waves w on w.id=x.wave_id
   where x.phone=own_phone and x.activated_at is not null and x.revoked_at is null
   and (x.claimed_by=u or (x.claimed_by is null and w.status='open')) for update of x;
   if g.id is not null then
     admitted:=true;
     update spotted_private.launch_guests set claimed_by=u,claimed_at=coalesce(claimed_at,now()) where id=g.id;
     update spotted_private.launch_nominations set claimed_by=u where id=g.nomination_id and claimed_by is null;
   end if;
 end if;
 if admitted then insert into spotted_private.launch_members(user_id) values(u) on conflict do nothing; end if;
 select * into m from spotted_private.launch_members where user_id=u;
 return jsonb_build_object('admitted',admitted,'profileSaved',m.profile_saved_at is not null,'complete',m.completed_at is not null,
 'hasPhone',own_phone is not null,'phoneRequired',needs_phone,
 'accessRequested',own_phone is not null and (exists(select 1 from spotted_private.invite_requests where spotted_private.request_phone(phone)=own_phone) or exists(select 1 from spotted_private.launch_guests where phone=own_phone)),
 'profile',(select jsonb_build_object('name',display_name,'username',username) from public.profiles where id=u),
 'cityTester',coalesce((select city_tester from spotted_private.launch_operators where user_id=u),false),
 'waveAdmin',coalesce((select wave_admin from spotted_private.launch_operators where user_id=u),false),
 'nominations',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'phone',phone,'activated',wave_id is not null) order by slot) from spotted_private.launch_nominations where nominated_by=u),'[]'::jsonb));
end $$;


-- Phone comes only from confirmed Auth data, never a caller parameter. Requesting access
-- records intent, not membership, a wave choice, or a message send. Retries reuse the inbox row.
create function spotted_private.request_launch_access(p_name text,p_invitation_texts boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); own_phone text; s jsonb; r spotted_private.invite_requests;
begin
 if u is null then raise exception 'Sign in first' using errcode='42501';end if;
 select spotted_private.launch_phone(phone) into own_phone from auth.users where id=u and phone_confirmed_at is not null;
 if own_phone is null then raise exception 'Verify your phone number first' using errcode='42501';end if;
 perform 1 from spotted_private.launch_settings where singleton for update;
 s:=spotted_private.launch_state();
 if (s->>'admitted')::boolean then return s;end if;
 if length(btrim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Add your name to request access';end if;
 if exists(select 1 from spotted_private.invite_requests where requested_by=u and spotted_private.request_phone(phone)<>own_phone) then
  raise exception 'Your request uses another number. Sign in with that number or contact Spotted.';end if;
 select * into r from spotted_private.invite_requests where spotted_private.request_phone(phone)=own_phone order by submitted_at,id limit 1 for update;
 if r.id is null then
  insert into spotted_private.invite_requests(id,form_id,first_name,last_name,email,phone,submitted_at,source_kind,requested_by,invitation_texts_at)
  values(substr(md5('app:'||u::text),1,24),null,btrim(p_name),'','',own_phone,now(),'app',u,case when p_invitation_texts then now() end);
 else
  -- Preserve the original website submission. A verified owner may explicitly opt in.
  update spotted_private.invite_requests set requested_by=coalesce(requested_by,u),
   invitation_texts_at=case when p_invitation_texts then coalesce(invitation_texts_at,now()) else invitation_texts_at end where id=r.id;
 end if;
 return spotted_private.launch_state();
end $$;
create function public.request_launch_access(p_name text,p_invitation_texts boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select spotted_private.request_launch_access(p_name,p_invitation_texts)$$;
revoke all on function spotted_private.request_launch_access(text,boolean),public.request_launch_access(text,boolean) from public,anon;
grant execute on function spotted_private.request_launch_access(text,boolean),public.request_launch_access(text,boolean) to authenticated;

-- Reuse the existing assignment/capacity checks, adding only provenance and explicit
-- permission given by the verified recipient. Nominations never imply this permission.
alter function spotted_private.requested_invites(text,jsonb) rename to requested_invites_before_app;
revoke all on function spotted_private.requested_invites_before_app(text,jsonb) from public,anon,authenticated;
create function spotted_private.requested_invites(p_action text default 'list',p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; r spotted_private.invite_requests;
begin
 perform spotted_private.require_launch_admin();
 result:=spotted_private.requested_invites_before_app(p_action,p_data);
 if p_action='list' then
  return result||jsonb_build_object('rows',coalesce((select jsonb_agg(item||jsonb_build_object('source_kind',request_row.source_kind,'invitation_texts_at',request_row.invitation_texts_at) order by pos)
   from jsonb_array_elements(result->'rows') with ordinality a(item,pos) join spotted_private.invite_requests request_row on request_row.id=item->>'id'),'[]'::jsonb));
 elsif p_action='assign' then
  select * into r from spotted_private.invite_requests where id=p_data->>'id';
  if r.invitation_texts_at is not null and r.requested_by is not null then
   update spotted_private.launch_guests set consent_at=coalesce(consent_at,r.invitation_texts_at),
    consent_note=coalesce(consent_note,'Verified recipient explicitly requested one invitation text in the Spotted app.')
   where id=r.guest_id and phone=spotted_private.request_phone(r.phone) and suppressed_at is null;
  end if;
 end if;
 return result;
end $$;
create or replace function public.requested_invites(p_action text default 'list',p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select spotted_private.requested_invites(p_action,p_data)$$;
revoke all on function spotted_private.requested_invites(text,jsonb),public.requested_invites(text,jsonb) from public,anon;
grant execute on function spotted_private.requested_invites(text,jsonb),public.requested_invites(text,jsonb) to authenticated;

-- Public installation metadata only. Never expose guests, gate state, or contact data.
create function spotted_private.launch_installation() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('installUrl',case when install_url ~ '^https://(apps\.apple\.com/|testflight\.apple\.com/)' then install_url end)
 from spotted_private.launch_settings where singleton
$$;
-- Deliberately public, argument-free projection. The wrapper avoids giving anonymous callers schema usage.
create function public.get_launch_installation() returns jsonb language sql stable security definer set search_path='' as $$select spotted_private.launch_installation()$$;
revoke all on function spotted_private.launch_installation(),public.get_launch_installation() from public;
revoke all on function spotted_private.launch_installation() from anon,authenticated;
grant execute on function public.get_launch_installation() to anon,authenticated;
notify pgrst,'reload schema';

-- Admission remains enforced on every other API endpoint, including legacy clients.
create or replace function public.check_launch_request() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text:=current_setting('request.path',true);
begin
 if auth.role()='authenticated' and not spotted_private.launch_access() and coalesce(endpoint,'') not in (
 '/rpc/get_launch_state','/rpc/save_launch_profile','/rpc/save_launch_nomination','/rpc/complete_launch_onboarding',
 '/rpc/request_launch_access','/rpc/get_launch_installation') then
 raise exception 'Finish onboarding to enter Spotted' using errcode='42501'; end if;
end $$;

-- Batch invitations use the verified installation landing page; admission remains phone-bound.
create or replace function spotted_private.launch_outreach(p_action text,p_data jsonb default '{}') returns jsonb
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
 message:='Spotted: your New York invitation is open. Join with the phone number receiving this text: '||case when s.install_url is null then '[Add the app download link]' else 'https://spottedsocial-git-codex-nyc-onboarding-waves-spottedsocial.vercel.app/join' end||' Reply STOP to opt out.';
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
