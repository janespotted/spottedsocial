begin;
-- Private read positions drive unread badges even when sharing is disabled.
-- Peers receive receipts only for an exact direct thread, with mutual opt-in.
create function spotted_private.receipt_visible(viewer uuid,owner_id uuid,thread uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select viewer is not null
 and exists(select 1 from public.dm_thread_members where thread_id=thread and user_id=viewer)
 and exists(select 1 from public.dm_thread_members where thread_id=thread and user_id=owner_id)
 and (viewer=owner_id or (
 not spotted_private.blocked(viewer,owner_id)
 and exists(select 1 from public.dm_threads where id=thread and is_group is false)
 and (select count(*) from public.dm_thread_members where thread_id=thread)=2
 and exists(select 1 from public.profiles where id=viewer and show_read_receipts is true)
 and exists(select 1 from public.profiles where id=owner_id and show_read_receipts is true)))
$$;
create function public.can_read_receipt(p_owner uuid,p_thread uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select spotted_private.receipt_visible(auth.uid(),p_owner,p_thread)
$$;
do $$ declare p record;begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='dm_read_receipts'
 loop execute format('drop policy %I on public.dm_read_receipts',p.policyname);end loop;
end $$;
create policy v1_receipt_read on public.dm_read_receipts for select to authenticated
 using(public.can_read_receipt(user_id,thread_id));
create policy v1_receipt_insert on public.dm_read_receipts for insert to authenticated
 with check(user_id=auth.uid() and public.user_is_thread_member(thread_id));
create policy v1_receipt_update on public.dm_read_receipts for update to authenticated
 using(user_id=auth.uid() and public.user_is_thread_member(thread_id))
 with check(user_id=auth.uid() and public.user_is_thread_member(thread_id));
create policy v1_receipt_delete on public.dm_read_receipts for delete to authenticated using(user_id=auth.uid());
revoke all on function spotted_private.receipt_visible(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.can_read_receipt(uuid,uuid) from public,anon;
grant execute on function public.can_read_receipt(uuid,uuid) to authenticated;
commit;
