-- Invitation recipients must never land on a Vercel-protected preview.
-- Only the public download destination changes; queue/admission safeguards stay intact.
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
 message:='Spotted: your New York invitation is open. Join with the phone number receiving this text: '||case when s.install_url is null then '[Add the app download link]' else 'https://spottedsocial.vercel.app/join' end||' Reply STOP to opt out.';
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
