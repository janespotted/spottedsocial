const test=require('node:test'),assert=require('node:assert/strict');
const {load,extract}=require('./product-test-runtime.cjs');
test('entry links are navigation only and reject untrusted origins and credentials',()=>{
 const api=load('lib/launch-entry-link.ts',{'react-native-url-polyfill':{URL}});
 for(const url of ['spotted://join','spotted://app/join','https://spottedsocial.vercel.app/join','https://spottedsocial-git-codex-nyc-onboarding-waves-spottedsocial.vercel.app/join.html'])assert.equal(api.isLaunchEntryLink(url),true,url);
 for(const url of ['https://evil.test/join','https://spottedsocial.vercel.app.evil.test/join','https://evil@spottedsocial.vercel.app/join','https://spottedsocial.vercel.app:444/join','http://spottedsocial.vercel.app/join','spotted://join/whoops'])assert.equal(api.isLaunchEntryLink(url),false,url);
});
test('drafts resume after restart, stay per-account and cannot reappear after a successful profile save',async()=>{
 const memory=new Map(),mock={'@react-native-async-storage/async-storage':{getItem:async key=>memory.get(key)||null,setItem:async(k,v)=>memory.set(k,v),removeItem:async k=>memory.delete(k)}};
 let api=load('lib/launch-draft.ts',mock);
 await api.saveLaunchDraft('a',{name:'Alex',username:'alex_sample',terms:true});
 api=load('lib/launch-draft.ts',mock);
 assert.equal((await api.readLaunchDraft('a')).name,'Alex');assert.equal(await api.readLaunchDraft('b'),null);
 const queued=api.saveLaunchDraft('a',{name:'Older queued write',username:'alex_sample',terms:true});
 await api.clearLaunchDraft('a');await queued;assert.equal(await api.readLaunchDraft('a'),null);
});
test('OTP verification and resend resist rapid duplicate taps and recover after network failure',async()=>{
 let resolveRequest,calls=0;const pending={current:false},errors=[];
 const scope={phone:'+12125550123',pending,setBusy:()=>{},setError:v=>errors.push(v),supabase:{auth:{verifyOtp:()=>{calls++;return new Promise(r=>resolveRequest=r);}}}};
 const verify=extract('app/auth/otp.tsx','verifyCode',scope);
 const first=verify('123456');await verify('123456');assert.equal(calls,1);
 resolveRequest({error:new Error('network failed')});await first;assert.equal(pending.current,false);assert.match(errors.at(-1),/connection/);
 const second=verify('654321');resolveRequest({error:null});await second;assert.equal(calls,2);
 let cooldown=0;scope.cooldown=0;scope.RESEND_COOLDOWN_S=60;scope.setCooldown=n=>cooldown=n;scope.supabase.auth.signInWithOtp=()=>{calls++;return new Promise(r=>resolveRequest=r);};
 const resend=extract('app/auth/otp.tsx','resend',scope);const request=resend();await resend();assert.equal(calls,3);resolveRequest({error:null});await request;assert.equal(cooldown,60);
});
