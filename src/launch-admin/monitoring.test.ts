import {describe,it,expect} from 'vitest';
import {jobHealth,monitoringError,nightCoverage} from './monitoring-types';
describe('monitoring states',()=>{
 const now='2026-10-21T22:00:00Z';
 const job={name:'spotted-push-delivery',enabled:true,last_run:'2026-10-21T21:59:00Z',last_finished:now,status:'succeeded'};
 it('does not treat missing or stale job evidence as healthy',()=>{
  expect(jobHealth(job,now)).toBe('Completed');
  expect(jobHealth({...job,last_run:null},now)).toBe('No run evidence');
  expect(jobHealth({...job,last_run:'2026-10-20T20:00:00Z'},now)).toBe('Stale');
  expect(jobHealth({...job,enabled:false},now)).toBe('Disabled');
  expect(jobHealth({...job,status:'failed'},now)).toBe('Failed');
 });
 it('distinguishes denied access, missing deployment, and refresh errors',()=>{
  expect(monitoringError({code:'42501'})).toContain('Founder');
  expect(monitoringError({code:'PGRST202'})).toContain('deployment');
  expect(monitoringError({code:'timeout'})).toContain('could not refresh');
 });
});

it('marks uninstrumented nights and assigns pre-5am / DST events to the prior night',()=>{
 expect(nightCoverage('2026-10-20','nyc','2026-10-21T21:27:00Z')).toBe('unavailable');
 expect(nightCoverage('2026-10-21','nyc','2026-10-21T21:27:00Z')).toBe('partial');
 expect(nightCoverage('2026-10-22','nyc','2026-10-21T21:27:00Z')).toBe('available');
 expect(nightCoverage('2026-10-31','nyc','2026-11-01T09:59:00Z')).toBe('partial');
 expect(nightCoverage('2026-10-31','la','2026-11-01T12:59:00Z')).toBe('partial');
});
