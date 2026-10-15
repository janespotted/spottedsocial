const test=require('node:test'),assert=require('node:assert/strict');
const {load,extract,source}=require('./product-test-runtime.cjs');
const {leaderboardWeights,rankNightlife}=load('lib/leaderboard-ranking.ts');
test('ranking starts 70/30; real activity overtakes seed and is capped at 90%',()=>{
 for(const n of [0,1,20]){assert.equal(leaderboardWeights(n).live,.3);assert.equal(leaderboardWeights(n).curated,.7)}
 assert(leaderboardWeights(100).live>.5);assert(Math.abs(leaderboardWeights(200).live-.9)<1e-9);assert.equal(leaderboardWeights(200).live,leaderboardWeights(1000).live);
 const rows=[{venue_id:'favorite',venue_name:'Seed',popularity_rank:1,count:0},{venue_id:'organic',venue_name:'Organic',popularity_rank:15,count:20}];
 assert.equal(rankNightlife(rows,20)[0].venue_id,'favorite');assert.equal(rankNightlife(rows,200)[0].venue_id,'organic');assert.equal(rows[0].venue_id,'favorite');
 assert.equal(rankNightlife(rows.map(r=>({...r,count:0})),0)[0].venue_id,'favorite');
});
test('expired, malformed, duplicate and self venue badges are dropped',()=>{
 const {collectVenueVisits}=load('lib/venue-visits.ts');const now=Date.now(),v={venue_id:'v',user_id:'f',display_name:'Friend',avatar_url:null,expires_at:new Date(now+86400000).toISOString()};
 assert.equal(collectVenueVisits([v,v,{...v,user_id:'me'},{...v,user_id:'old',expires_at:new Date(now).toISOString()},null,{}],'me',now).length,1);
 assert.equal(collectVenueVisits({},'me',now).length,0);
});
test('person presses stop the enclosing chat, venue or selection and open the same Friend ID route',()=>{
 const pushed=[],api=load('lib/friend-card.ts',{'expo-router':{router:{push:p=>pushed.push(p)}}});let stopped=0;
 api.friendCardPress('friend','me')({stopPropagation:()=>stopped++});assert.equal(stopped,1);assert.equal(pushed[0].pathname,'/friend-card');assert.equal(pushed[0].params.userId,'friend');
 api.friendCardPress(null)({stopPropagation:()=>{}});api.friendCardPress('me','me')({stopPropagation:()=>{}});assert.equal(pushed.length,1);
});
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
function nodes(n,out=[]){if(Array.isArray(n))n.forEach(x=>nodes(x,out));else if(n&&typeof n==='object'){out.push(n);nodes(n.props?.children,out)}return out}
test('no history renders no row; authorized history shows exact label and tappable photos',()=>{
 let visits=[],opened=[];
 const render=extract('components/venue-shared-visits.tsx','VenueSharedVisits',{require:()=>jsx,useVenueVisits:()=>visits,View:'View',Text:'Text',Pressable:'Pressable',Avatar:'Avatar',openFriendCard:id=>opened.push(id)});
 assert.equal(render({venueId:'v'}),null);visits=[{user_id:'f',display_name:'Alex',avatar_url:'photo'}];const list=nodes(render({venueId:'v',compact:true}));assert(list.some(n=>n.props?.children==='Friends who visited recently'));list.find(n=>n.type==='Pressable').props.onPress({stopPropagation:()=>{}});assert.deepEqual(opened,['f']);
});
test('night Home keeps its yellow bottom-left Post action independently of feed emptiness',()=>{
 const s=source('app/(tabs)/(home)/index.tsx'),fab=s.slice(s.indexOf('{/* Compose FAB'));
 assert.match(fab,/\{keyboardOpen \? null :/);assert.match(fab,/<PostFab/);const control=source('components/post-fab.tsx');assert.match(control,/left-4/);assert.match(control,/backgroundColor: NEON/);assert.doesNotMatch(fab+control,/feed\.posts|hasPosts|friendCount/);
 const venue=source('app/venue.tsx');assert.match(venue,/\[moreInfoOpen, setMoreInfoOpen\] = useState\(false\)/);assert.match(venue,/setMoreInfoOpen\(false\).*\[venueId\]/s);
});
test('DM inbox name opens Friend ID while the conversation row still opens chat',()=>{
 let cards=[],chats=0;const render=extract('app/(tabs)/(messages)/messages.tsx','ThreadRow',{require:()=>jsx,View:'View',Text:'Text',Pressable:'Pressable',Avatar:'Avatar',GroupAvatar:'GroupAvatar',threadTitle:()=> 'Alex',formatWhen:()=>'',previewText:()=>'',NEON:'lime',friendCardPress:id=>e=>{e.stopPropagation();cards.push(id)}});
 const tree=render({thread:{id:'dm',is_group:false,members:[{user_id:'friend',avatar_url:null}],last_message:null},userId:'me',onPress:()=>chats++});let stopped=false;
 nodes(tree).find(n=>n.type==='Text'&&n.props.children==='Alex').props.onPress({stopPropagation:()=>stopped=true});assert(stopped);assert.deepEqual(cards,['friend']);assert.equal(chats,0);tree.props.onPress();assert.equal(chats,1);
});
