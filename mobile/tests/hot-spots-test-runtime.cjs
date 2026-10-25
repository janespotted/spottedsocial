const {load}=require('./product-test-runtime.cjs');
const editorial=load('lib/hot-spots-editorial.ts',{'./hot-spots-editorial.json':require('../src/lib/hot-spots-editorial.json'),'./venue-picks.json':require('../src/lib/venue-picks.json')});
const ranking=load('lib/leaderboard-ranking.ts');
const presence=load('lib/venue-presence.ts',{'./supabase':{},'./demo-mode':{}});
const board=load('lib/hot-spots-board.ts',{'./hot-spots-editorial':editorial,'./leaderboard-ranking':ranking,'./venue-presence':presence,'./venue-hours':{isVenueOpen:()=>true}});
function hook(client,demo=false){
 const mode={isDemoMode:()=>demo};
 const live=load('lib/venue-presence.ts',{'./supabase':{supabase:client},'./demo-mode':mode});
 const profiles=load('lib/profiles.ts',{'./supabase':{supabase:client},'./demo-mode':mode});
 return load('hooks/use-leaderboard.ts',{'./use-private-query':{},'./use-own-night-status':{},'@/lib/live-preview':{},react:{},'@tanstack/react-query':{},'@/lib/resilient-channel':{},'@/lib/supabase':{supabase:client},'@/lib/demo-mode':mode,'@/lib/profiles':profiles,'@/lib/venue-presence':live,'@/lib/hot-spots-board':board,'@/lib/hot-spots-editorial.json':require('../src/lib/hot-spots-editorial.json'),'./use-friend-ids':{},'./use-session':{}});
}
const venue=(id,rank=1,extra={})=>({id,name:id,city:'nyc',neighborhood:'N',popularity_rank:rank,google_place_id:null,leaderboard_eligible:true,is_demo:false,is_leaderboard_promoted:false,leaderboard_promo_order:null,opened_at:null,operating_hours:null,...extra});
const status=(user,venue,extra={})=>({user_id:user,venue_id:venue,status:'out',updated_at:'2026-10-16T01:00:00Z',expires_at:'2026-10-16T09:00:00Z',is_demo:false,is_private_party:false,...extra});
module.exports={...editorial,...ranking,...presence,...board,hook,venue,status};
