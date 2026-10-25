import {describe,it,expect,vi} from 'vitest';
vi.mock('../integrations/supabase/client',()=>({supabase:{}}));
import {launchChecks} from './night-operations';
import {nightPreview} from './night-preview';
import {filterRoster,type RosterPerson} from './launch-roster';
describe('launch readiness is based on evidence',()=>{
 it('never treats native crashes or build coverage as connected',()=>{
  const checks=launchChecks(nightPreview('nyc'));
  for(const label of ['Native crash reporting','Independent outage alerts','App version / build coverage'])expect(checks.find(c=>c.label===label)?.state).toBe('unavailable');
 });
 it('rejects stale, missing or failed reset evidence and expired rows',()=>{
  const s=nightPreview('nyc');const state=()=>launchChecks(s).find(c=>c.label==='5 AM reset')?.state;
  expect(state()).toBe('ready');s.readiness.expired_statuses=1;expect(state()).toBe('attention');s.readiness.expired_statuses=0;
  s.readiness.reset_jobs[0].last_run='2020-01-01';expect(state()).toBe('attention');s.readiness.reset_jobs=[];expect(state()).toBe('attention');
 });
 it('requires an enabled sender, acceptance evidence and a fresh email worker',()=>{
  const s=nightPreview('nyc');const state=()=>launchChecks(s).find(c=>c.label==='Critical email alerts')?.state;
  expect(state()).toBe('attention');s.readiness.email_enabled=true;expect(state()).toBe('attention');
  s.readiness.email_last_accepted=s.generated_at;s.readiness.email_last_worker=s.generated_at;expect(state()).toBe('ready');
  s.readiness.email_last_worker='2020-01-01';expect(state()).toBe('attention');
 });
 it('requires all three native tracking signals',()=>{
  const s=nightPreview('nyc');const state=()=>launchChecks(s).find(c=>c.label==='iPhone tracking')?.state;
  expect(state()).toBe('ready');s.presence.reporting_24h=0;expect(state()).toBe('attention');s.presence.reporting_24h=1;s.readiness.last_screen_event=null;expect(state()).toBe('attention');
 });
});
it('filters launch people without changing wave membership',()=>{
 const rows=[{id:'1',name:'Alex',wave:'First',attention:'not_invited'},{id:'2',name:'Sam',wave:'Next',attention:'setup_incomplete'}] as RosterPerson[];
 expect(filterRoster(rows,'First','all',' ALEX ').map(p=>p.id)).toEqual(['1']);
 expect(filterRoster(rows,'','setup_incomplete','').map(p=>p.id)).toEqual(['2']);
 expect(filterRoster(rows,'First','all','Sam')).toHaveLength(0);expect(rows).toHaveLength(2);
});
