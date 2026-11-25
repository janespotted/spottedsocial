import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedVenueId,sharedVenueAppLink,getSharedVenue} from '../public/invitation-assets/shared-venue.js';
const id='11111111-1111-4111-8111-111111111111';
test('the shared venue opens the native route and preserves only a valid referral',()=>{
 assert.equal(sharedVenueAppLink('?venueId='+id+'&ref=abcdefgh'),'spotted://venue-link?venueId='+id+'&ref=ABCDEFGH');
 assert.equal(sharedVenueAppLink('?venueId='+id+'&ref=https://evil.test'),'spotted://venue-link?venueId='+id);
 assert.equal(sharedVenueAppLink('?venueId=bad'),null);
});
test('public links only accept UUID venue IDs and never use them as destinations',()=>{
 assert.equal(sharedVenueId('?venueId='+id),id);
 for(const value of ['','javascript:alert(1)','https://evil.test','<script>','abc'])assert.equal(sharedVenueId('?venueId='+encodeURIComponent(value)),null);
});
test('public response projection drops identities, guest lists and location data',async()=>{
 let calls=0;
 const result=await getSharedVenue(id,async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).p_venue_id,id);assert.equal(options.headers.Authorization,undefined);return {ok:true,json:async()=>({id,name:'A public spot',city:'nyc',neighborhood:'SoHo',type:'Bar',friends:['private'],lat:1,lng:2,photos:['private']})}});
 assert.deepEqual(Object.keys(result).sort(),['city','id','name','neighborhood','type']);assert.equal(calls,1);
 assert.equal(await getSharedVenue('bad',async()=>{throw Error('Should not fetch')}),null);
});
test('unavailable and failed venue loads remain distinct from success',async()=>{
 assert.equal(await getSharedVenue(id,async()=>({ok:true,json:async()=>null})),null);
 assert.equal(await getSharedVenue(id,async()=>({ok:true,json:async()=>({id:'another',name:'Wrong venue'})})),null);
 await assert.rejects(getSharedVenue(id,async()=>({ok:false})),/Couldn’t load/);
});
