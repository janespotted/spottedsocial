import { createClient } from "npm:@supabase/supabase-js@2";

const NYC = [["Le Bain (Demo)",40.7408,-74.0051,"Meatpacking"],["House of Yes (Demo)",40.7067,-73.9237,"Bushwick"],["The Box (Demo)",40.7219,-73.9923,"LES"],["Elsewhere (Demo)",40.7094,-73.9232,"Bushwick"],["Double Chicken Please (Demo)",40.7196,-73.9905,"LES"],["Dante NYC (Demo)",40.7288,-74.0017,"West Village"],["PHD Rooftop (Demo)",40.7422,-74.0010,"Chelsea"],["Good Room (Demo)",40.7273,-73.9510,"Greenpoint"]];
const LA = [["Academy LA (Demo)",34.1026,-118.3267,"Hollywood"],["Sound Nightclub (Demo)",34.1005,-118.3358,"Hollywood"],["Tenants of the Trees (Demo)",34.0960,-118.2610,"Silver Lake"],["Akbar (Demo)",34.0956,-118.2843,"Silver Lake"],["Highland Park Bowl (Demo)",34.1094,-118.1936,"Highland Park"],["The Bungalow (Demo)",34.0099,-118.5050,"Santa Monica"],["The Dresden (Demo)",34.1026,-118.2918,"Los Feliz"],["EP & LP (Demo)",34.0821,-118.3768,"WeHo"]];
const PB = [["Cucina (Demo)",26.7187,-80.0400,"Royal Poinciana"],["Mary Lou's (Demo)",26.7035,-80.0437,"Southern Blvd"],["Respectable Street (Demo)",26.7152,-80.0533,"Clematis"],["Four (Demo)",26.7128,-80.0538,"Downtown WPB"],["ER Bradley's (Demo)",26.7148,-80.0510,"Clematis"]];

const DEMO_USERNAMES: Record<string, string[][]> = {
  nyc: [
    ["Alex","alex.soho"], ["Sam","sam_les"], ["Jordan","jordan_bk"],
    ["Taylor","taylor.ev"], ["Morgan","morgan_nyc"], ["Casey","casey.wv"],
    ["Riley","riley_chels"], ["Jamie","jamie.mpk"],
    ["Alex","alex_wburg"], ["Sam","sammy.bush"], ["Jordan","jord.midtown"],
    ["Taylor","tay_soho"], ["Drew","drew.nolita"], ["Avery","avery_bk"],
    ["Quinn","quinn.uws"], ["Reese","reese_les"], ["Blake","blake.hells"],
    ["Skyler","skyler_gp"], ["Charlie","charlie.wburg"], ["Finley","finley_ev"],
    ["Hayden","hayden.bk"], ["Emery","emery_soho"], ["Peyton","peyton.chels"],
    ["Dakota","dakota_mpk"]
  ],
  la: [
    ["Alex","alex.weho"], ["Sam","sam_dtla"], ["Jordan","jordan.hwood"],
    ["Taylor","taylor_sm"], ["Morgan","morgan.west"], ["Casey","casey_slake"],
    ["Riley","riley.venice"], ["Jamie","jamie_la"],
    ["Alex","alexx.hwood"], ["Sam","sammy.weho"], ["Jordan","jord_dtla"],
    ["Taylor","tay.venice"], ["Drew","drew.echo"], ["Avery","avery_hwood"],
    ["Quinn","quinn.sm"], ["Reese","reese_slake"], ["Blake","blake.dtla"],
    ["Skyler","skyler_weho"], ["Charlie","charlie.lf"], ["Finley","finley_hp"],
    ["Hayden","hayden.venice"], ["Emery","emery_hwood"], ["Peyton","peyton.weho"],
    ["Dakota","dakota_sm"]
  ],
  pb: [
    ["Alex","alex.wpb"], ["Sam","sam_pb"], ["Jordan","jordan.clem"],
    ["Taylor","taylor_rpb"], ["Morgan","morgan.pb"], ["Casey","casey_wpb"],
    ["Riley","riley.palm"], ["Jamie","jamie_pb"],
    ["Alex","alexx.wpb"], ["Sam","sammy.pb"], ["Jordan","jord_clem"],
    ["Taylor","tay.palm"], ["Drew","drew.wpb"], ["Avery","avery_pb"],
    ["Quinn","quinn.clem"], ["Reese","reese_rpb"], ["Blake","blake.palm"],
    ["Skyler","skyler_wpb"], ["Charlie","charlie.pb"], ["Finley","finley_clem"],
    ["Hayden","hayden.wpb"], ["Emery","emery_pb"], ["Peyton","peyton.clem"],
    ["Dakota","dakota_palm"]
  ]
};
const CAPTIONS = ["Amazing! 🔥","Best night 💯","Vibes ✨","So packed!","DJ killing it 🎵"];
const DM_CONVOS = [
  [["Are you coming out tonight? 👀","Yeah definitely! Where's everyone at?","We're at {venue}, come through!"],["Omw! Save me a spot 🙌"]],
  [["This DJ is insane rn 🔥","Who is it??","No idea but the vibes are unmatched"],["Send me the location!"]],
  [["Yo where'd you go? Lost you in the crowd 😂","I'm by the bar lol","Stay there I'm coming to find you"]],
  [["Best night out in a while 💯","Fr fr, we need to do this more often"],["Next weekend for sure 🤝"]],
];
const YAP_TEXTS = ["Pretty sure Justin Bieber just walked in...","This music is awesome who's the DJ right now","What's everyone's move after close?","Anyone here? Looking for my friends","This DJ set is unreal!!!","Line is crazy long outside","The energy is INSANE right now","Dance floor is PACKED","Where's the after party at?","Bartender hooked it up"];
const IMG = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=800&fit=crop";

const toV = (a: any[]) => a.map((v,i)=>({name:v[0],lat:v[1],lng:v[2],hood:v[3],rank:i+1}));
// Demo data expires 30 days from now so it persists across sessions
const exp = () => new Date(Date.now() + 30 * 24 * 3600000).toISOString();
const rec = (h=4) => new Date(Date.now()-Math.random()*h*3600000).toISOString();
const pick = <T>(a:T[],n:number):T[] => [...a].sort(()=>0.5-Math.random()).slice(0,n);
const wknd = () => { const t=new Date(),d=t.getDay(),f=d===0?-2:d===6?-1:d===5?0:5-d; return [0,1,2].map(i=>{const x=new Date(t);x.setDate(t.getDate()+f+i);return x.toISOString().split('T')[0];}); };

Deno.serve(async (req) => {
  const h = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
  if (req.method === 'OPTIONS') return new Response('ok', {headers:h});

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Require authentication for all actions
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...h, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...h, 'Content-Type': 'application/json' } }
      );
    }

    const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{autoRefreshToken:false,persistSession:false}});
    const {action, city='nyc', userId} = await req.json();

    // Admin check: required for 'clear', optional for 'seed' and 'health-check'
    const { data: hasAdmin } = await authClient.rpc('has_role', {
      user_id: user.id,
      role: 'admin',
    });
    const isAdmin = !!hasAdmin;

    if (action === 'clear' && !isAdmin) {
      console.error('Admin role required for clear action, user:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required for clearing demo data' }),
        { status: 403, headers: { ...h, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[v5] User ${user.id} (admin=${isAdmin}) triggering seed-demo-data action=${action}`);

    if (action === 'seed') {
      const V = toV(city==='la'?LA:city==='pb'?PB:NYC);
      
      // Cleanup
      await sb.from('events').delete().eq('is_demo',true);
      await sb.from('plans').delete().eq('is_demo',true);
      await sb.from('posts').delete().eq('is_demo',true);
      await sb.from('yap_messages').delete().eq('is_demo',true);
      await sb.from('night_statuses').delete().eq('is_demo',true);
      await sb.from('venues').delete().eq('is_demo',true);
      // Clean up friendships & DMs before deleting profiles (prevents silent FK failures)
      const {data:demoProfiles}=await sb.from('profiles').select('id').eq('is_demo',true);
      if(demoProfiles?.length){
        const demoIds=demoProfiles.map((x:any)=>x.id);
        const {data:dThreadMembers}=await sb.from('dm_thread_members').select('thread_id').in('user_id',demoIds);
        if(dThreadMembers?.length){
          const tids=[...new Set(dThreadMembers.map((t:any)=>t.thread_id))];
          await sb.from('dm_messages').delete().in('thread_id',tids);
          await sb.from('dm_thread_members').delete().in('thread_id',tids);
          await sb.from('dm_threads').delete().in('id',tids);
        }
        await sb.from('friendships').delete().in('user_id',demoIds);
        await sb.from('friendships').delete().in('friend_id',demoIds);
        await sb.from('close_friends').delete().in('close_friend_id',demoIds);
        await sb.from('checkins').delete().eq('is_demo',true);
        await sb.from('stories').delete().eq('is_demo',true);
      }
      await sb.from('profiles').delete().eq('is_demo',true);
      
      // Users
      const ts=Date.now(), uids:string[]=[];
      const userList = DEMO_USERNAMES[city] || DEMO_USERNAMES['nyc'];
      for(let i=0;i<24;i++){const u=userList[i];const id=crypto.randomUUID();uids.push(id);await sb.from('profiles').insert({id,display_name:u[0],username:u[1],avatar_url:null,is_demo:true});}
      
      // Ensure the calling user's profile exists (may have been deleted by a previous clear bug)
      const {data:callerProfile,error:callerErr}=await sb.from('profiles').select('id').eq('id',user.id).maybeSingle();
      console.log(`[Seed] Caller check: id=${user.id}, found=${!!callerProfile}, error=${callerErr?.message||'none'}`);
      console.log(`[Seed] User metadata:`, JSON.stringify(user.user_metadata||{}));
      console.log(`[Seed] User email: ${user.email}`);
      if(!callerProfile){
        const meta=user.user_metadata||{};
        const profileRow={
          id:user.id,
          display_name:meta.display_name||meta.full_name||user.email?.split('@')[0]||'User',
          username:meta.username||user.email?.split('@')[0]||'user',
          avatar_url:meta.avatar_url||null,
          is_demo:false,
          has_onboarded:true,
        };
        console.log(`[Seed] Inserting caller profile:`, JSON.stringify(profileRow));
        const {error:insertErr}=await sb.from('profiles').insert(profileRow);
        if(insertErr){
          console.error(`[Seed] PROFILE INSERT FAILED: ${insertErr.message} (code: ${insertErr.code}, details: ${insertErr.details})`);
        } else {
          console.log('[Seed] Caller profile recreated successfully');
        }
      } else {
        // Ensure is_demo is false
        if(callerProfile.is_demo){
          console.log('[Seed] Caller profile has is_demo=true, fixing...');
          await sb.from('profiles').update({is_demo:false}).eq('id',user.id);
        }
        console.log(`[Seed] Caller profile exists`);
      }

      // Friend structure:
      // - Users 0-15 (directFriends): directly friended to ALL real users
      // - Users 16-23 (mutualOnly): NOT direct friends, but friended to directFriends
      //   → These appear as friends-of-friends for mutual_friends visibility testing
      const directFriends = uids.slice(0, 16);
      const mutualOnly = uids.slice(16, 24);

      const {data:real,error:realErr}=await sb.from('profiles').select('id').eq('is_demo',false);
      console.log(`[Seed] Real profiles found: ${real?.length || 0}, error: ${realErr?.message || 'none'}`);

      // Direct friendships: real users ↔ first 16 demo users
      const directRows = (real||[]).flatMap((r:any) => directFriends.map(d => ({user_id:r.id, friend_id:d, status:'accepted'})));
      console.log(`[Seed] Direct friendship rows: ${directRows.length}`);
      for(let i=0; i<directRows.length; i+=50) {
        const {error:fErr} = await sb.from('friendships').insert(directRows.slice(i,i+50));
        if(fErr) console.error('[Seed] Direct friendship error:', fErr.message);
      }

      // Mutual-only friendships: mutualOnly users ↔ first 4 directFriends (creating the bridge)
      const mutualRows = mutualOnly.flatMap(m => directFriends.slice(0,4).map(d => ({user_id:d, friend_id:m, status:'accepted'})));
      console.log(`[Seed] Mutual bridge rows: ${mutualRows.length}`);
      for(let i=0; i<mutualRows.length; i+=50) {
        const {error:mErr} = await sb.from('friendships').insert(mutualRows.slice(i,i+50));
        if(mErr) console.error('[Seed] Mutual friendship error:', mErr.message);
      }

      console.log('[Seed] Friendships complete');

      // Close friends — first 8 direct friends are close friends of real users
      if (real?.length) {
        const closeFriendRows = real.flatMap((r:any) =>
          directFriends.slice(0, 8).map(d => ({ user_id: r.id, close_friend_id: d }))
        );
        for (let i = 0; i < closeFriendRows.length; i += 50) {
          const {error:cfErr}=await sb.from('close_friends').insert(closeFriendRows.slice(i, i+50));
          if(cfErr) console.error('[Seed] Close friend error:', cfErr.message);
        }
        console.log(`[Seed] Close friends inserted: ${closeFriendRows.length}`);
      }
      
      // Venues - insert with distinct "(Demo)" names; skip on conflict to never touch real venues
      const venueRows = V.map(v=>({name:v.name,lat:v.lat,lng:v.lng,neighborhood:v.hood,is_demo:true,popularity_rank:v.rank,city,type:'bar'}));
      console.log(`[Seed] Inserting ${venueRows.length} venues, first: ${venueRows[0]?.name}`);
      const {error:venueErr}=await sb.from('venues').insert(venueRows);
      if(venueErr) {
        console.error(`[Seed] Venue insert error: ${venueErr.message} (code: ${venueErr.code})`);
        // Try one by one on conflict
        for(const vr of venueRows){
          const {error:singleErr}=await sb.from('venues').insert(vr);
          if(singleErr) console.log(`[Seed] Venue ${vr.name}: ${singleErr.message}`);
          else console.log(`[Seed] Venue ${vr.name}: inserted`);
        }
      } else {
        console.log(`[Seed] All ${venueRows.length} venues inserted`);
      }
      const {data:vens,error:venFetchErr}=await sb.from('venues').select('id,name').in('name',V.map(v=>v.name));
      console.log(`[Seed] Venues fetched: ${vens?.length || 0}, error: ${venFetchErr?.message || 'none'}`);
      const vm=new Map((vens||[]).map((v:any)=>[v.name,v.id]));
      console.log(`[Seed] Venue ID map size: ${vm.size}`);
      
      // Night statuses - 16 users "out" at venues, clustered at top venues for leaderboard avatars
      // First 4 users at the #1 venue
      const outStatuses = [
        ...uids.slice(0,4).map(u=>{const v=V[0];return{user_id:u,status:'out',venue_id:vm.get(v.name),venue_name:v.name,lat:v.lat,lng:v.lng,expires_at:exp(),is_demo:true};}),
        // 3 users at the #2 venue
        ...uids.slice(4,7).map(u=>{const v=V[1];return{user_id:u,status:'out',venue_id:vm.get(v.name),venue_name:v.name,lat:v.lat,lng:v.lng,expires_at:exp(),is_demo:true};}),
        // 3 users at the #3 venue
        ...uids.slice(7,10).map(u=>{const v=V[2];return{user_id:u,status:'out',venue_id:vm.get(v.name),venue_name:v.name,lat:v.lat,lng:v.lng,expires_at:exp(),is_demo:true};}),
        // 2 users at #4 venue
        ...uids.slice(10,12).map(u=>{const v=V[3];return{user_id:u,status:'out',venue_id:vm.get(v.name),venue_name:v.name,lat:v.lat,lng:v.lng,expires_at:exp(),is_demo:true};}),
        // 2 users at #5 venue
        ...uids.slice(12,14).map(u=>{const v=V[4%V.length];return{user_id:u,status:'out',venue_id:vm.get(v.name),venue_name:v.name,lat:v.lat,lng:v.lng,expires_at:exp(),is_demo:true};}),
        // 1 user at #6 venue
        {user_id:uids[14],status:'out',venue_id:vm.get(V[5%V.length].name),venue_name:V[5%V.length].name,lat:V[5%V.length].lat,lng:V[5%V.length].lng,expires_at:exp(),is_demo:true},
        // 1 user at #7 venue
        {user_id:uids[15],status:'out',venue_id:vm.get(V[6%V.length].name),venue_name:V[6%V.length].name,lat:V[6%V.length].lat,lng:V[6%V.length].lng,expires_at:exp(),is_demo:true},
      ];
      await sb.from('night_statuses').insert(outStatuses);

      // Checkins for "out" users — needed for map pins and venue detection
      const checkinRows = outStatuses.map(s => ({
        user_id: s.user_id,
        venue_id: s.venue_id,
        venue_name: s.venue_name,
        lat: s.lat,
        lng: s.lng,
        started_at: rec(3),
        last_updated_at: new Date().toISOString(),
        is_demo: true,
      }));
      await sb.from('checkins').insert(checkinRows);

      // (a) Update calling user's profile with city coords so map centers correctly
      await sb.from('profiles').update({
        last_known_lat: V[0].lat,
        last_known_lng: V[0].lng,
        last_location_at: new Date().toISOString(),
      }).eq('id', user.id);

      // (b) Set is_out + last_known_lat/lng on demo profiles 0-15 (the "out" users)
      for (const s of outStatuses) {
        await sb.from('profiles').update({
          is_out: true,
          last_known_lat: s.lat,
          last_known_lng: s.lng,
          last_location_at: new Date().toISOString(),
        }).eq('id', s.user_id);
      }

      // (c) 5 direct-friend demo users in "planning" state for the TBD bucket
      const planUserList = DEMO_USERNAMES[city] || DEMO_USERNAMES['nyc'];
      const planningUids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const pu = planUserList[(i + 5) % planUserList.length];
        const id = crypto.randomUUID();
        planningUids.push(id);
        await sb.from('profiles').insert({
          id,
          display_name: pu[0],
          username: 'tbd_' + pu[1],
          avatar_url: null,
          is_demo: true,
        });
      }
      const planFriendRows = (real || []).flatMap((r: any) =>
        planningUids.map(d => ({ user_id: r.id, friend_id: d, status: 'accepted' }))
      );
      for (let i = 0; i < planFriendRows.length; i += 50) {
        await sb.from('friendships').insert(planFriendRows.slice(i, i + 50));
      }
      await sb.from('night_statuses').insert(planningUids.map((u, i) => ({
        user_id: u,
        status: 'planning',
        planning_neighborhood: V[i % V.length].hood,
        planning_visibility: i < 2 ? 'close_friends' : 'all_friends',
        expires_at: exp(),
        is_demo: true,
      })));

      // Users 16-19: mutual-only users who are "out" with mutual_friends visibility
      // These should appear on the map as mutual friend pins (🔗)
      const mutualOutStatuses = mutualOnly.slice(0,4).map((u,i) => {
        const v = V[(i+3) % V.length]; // different venues from direct friends
        return {user_id:u, status:'out', venue_id:vm.get(v.name), venue_name:v.name, lat:v.lat, lng:v.lng, expires_at:exp(), is_demo:true};
      });
      await sb.from('night_statuses').insert(mutualOutStatuses);
      // Set their location_sharing_level to mutual_friends
      await sb.from('profiles').update({location_sharing_level:'mutual_friends', is_out:true, last_known_lat:V[3].lat, last_known_lng:V[3].lng, last_location_at:new Date().toISOString()}).in('id', mutualOnly.slice(0,4));
      // Checkins for mutual-out users
      await sb.from('checkins').insert(mutualOutStatuses.map(s=>({user_id:s.user_id, venue_id:s.venue_id, venue_name:s.venue_name, lat:s.lat, lng:s.lng, started_at:rec(2), last_updated_at:new Date().toISOString(), is_demo:true})));

      // Users 20-23: mutual-only users who are "planning"
      await sb.from('night_statuses').insert(mutualOnly.slice(4).map((u,i)=>{
        const v=V[i%V.length];
        return {
          user_id:u, status:'planning',
          planning_neighborhood: v.hood,
          planning_visibility: 'all_friends',
          expires_at:exp(), is_demo:true
        };
      }));

      // Also add some mutual_friends visibility posts from mutual-only users
      await sb.from('posts').insert(mutualOnly.slice(0,3).map((u,i) => {
        const v = V[(i+2) % V.length];
        return {user_id:u, text:'Who else is out tonight? 🔥', venue_id:vm.get(v.name), venue_name:v.name, expires_at:exp(), created_at:rec(2), is_demo:true, visibility:'mutual_friends'};
      }));
      console.log('[Seed] Mutual friends scenario seeded');
      
      // Posts
      await sb.from('posts').insert(Array.from({length:15},()=>{const v=V[Math.floor(Math.random()*V.length)];return{user_id:uids[Math.floor(Math.random()*uids.length)],text:CAPTIONS[Math.floor(Math.random()*5)],venue_id:vm.get(v.name),venue_name:v.name,image_url:Math.random()>0.4?IMG:null,expires_at:exp(),created_at:rec(4),is_demo:true,visibility:'all_friends'};}));
      
      // Yap messages — mix of anonymous and named, some with images, spread across top venues
      const yapRows = YAP_TEXTS.map((text,i) => {
        const v = V[i % V.length];
        const isAnon = Math.random() > 0.4;
        const user = uids[i % uids.length];
        const userName = userList[i % userList.length];
        return {
          user_id: user,
          text,
          venue_name: v.name,
          is_anonymous: isAnon,
          author_handle: isAnon ? `User${Math.floor(100000+Math.random()*900000)}` : userName[1],
          score: Math.floor(Math.random() * 80) + 5,
          comments_count: Math.floor(Math.random() * 15),
          image_url: i % 4 === 0 ? IMG : null,
          expires_at: exp(),
          created_at: rec(3),
          is_demo: true,
        };
      });
      // Add extra yaps at the top 3 venues for density
      for (let vi = 0; vi < 3 && vi < V.length; vi++) {
        const extraTexts = ["Who else is here right now??", "The vibe is immaculate tonight", "Someone buy me a drink 😂", "This song slaps so hard"];
        for (const text of extraTexts) {
          const u = uids[Math.floor(Math.random() * uids.length)];
          yapRows.push({
            user_id: u,
            text,
            venue_name: V[vi].name,
            is_anonymous: true,
            author_handle: `User${Math.floor(100000+Math.random()*900000)}`,
            score: Math.floor(Math.random() * 50) + 1,
            comments_count: Math.floor(Math.random() * 5),
            image_url: null,
            expires_at: exp(),
            created_at: rec(2),
            is_demo: true,
          });
        }
      }
      await sb.from('yap_messages').insert(yapRows);
      
      // Plans — varied descriptions, more participants
      const wd=wknd();
      const planDescs = ["Who's down?", "Pregame at mine first 🍻", "Gonna be a movie tonight 🎬", "LFG!!! 🔥", "Table secured, need the squad", "Birthday celebration! 🎂", "Coming through for sure"];
      const planUsers = pick(uids, 7);
      const {data:pls}=await sb.from('plans').insert(planUsers.map((u,i)=>{
        const v=V[i%V.length], d=wd[i%3], ex=new Date(d+'T05:00:00');
        ex.setDate(ex.getDate()+1);
        const times = ['20:00','21:00','21:30','22:00','22:30','23:00'];
        return {
          user_id:u, venue_id:vm.get(v.name), venue_name:v.name,
          plan_date:d, plan_time:times[i%times.length],
          description: planDescs[i % planDescs.length],
          visibility: i < 3 ? 'close_friends' : 'all_friends',
          expires_at:ex.toISOString(), is_demo:true
        };
      })).select('id,user_id');
      const dws=(pls||[]).flatMap(p=>pick(uids.filter(x=>x!==p.user_id), 2+Math.floor(Math.random()*3)).map(x=>({plan_id:p.id,user_id:x})));
      if(dws.length) await sb.from('plan_downs').insert(dws);
      
      // Events
      const {data:evs}=await sb.from('events').insert([["Friday DJ","House",0],["Industry Night","Free entry",1],["Saturday Live","Guest DJ",2]].map((e,i)=>{const v=V[i%V.length],d=wd[i%3],ex=new Date(d+'T05:00:00');ex.setDate(ex.getDate()+1);return{venue_id:vm.get(v.name),venue_name:v.name,title:e[0],description:e[1],event_date:d,start_time:'22:00',city,neighborhood:v.hood,expires_at:ex.toISOString(),is_demo:true};})).select('id');
      const rs=(evs||[]).flatMap(ev=>pick(uids,3).map(u=>({event_id:ev.id,user_id:u,rsvp_type:'going'})));
      if(rs.length) await sb.from('event_rsvps').insert(rs);
      
      // DM threads & messages between real user and demo users
      if (userId) {
        const dmUsers = uids.slice(0, 4);
        for (let i = 0; i < dmUsers.length; i++) {
          const demoUid = dmUsers[i];
          const convo = DM_CONVOS[i];
          // Create thread (use real user as creator to avoid FK constraint on auth.users)
          const { data: thread, error: threadErr } = await sb.from('dm_threads').insert({ created_by: userId }).select('id').single();
          if (threadErr) { console.error(`[Seed] DM thread error: ${threadErr.message}`); continue; }
          if (!thread) continue;
          console.log(`[Seed] DM thread created: ${thread.id}`);
          // Add members
          await sb.from('dm_thread_members').insert([
            { thread_id: thread.id, user_id: userId },
            { thread_id: thread.id, user_id: demoUid },
          ]);
          // Insert messages - alternate senders, recent timestamps
          const msgs: any[] = [];
          let msgTime = Date.now() - (90 + Math.random() * 60) * 60000; // 1.5-2.5h ago
          for (const group of convo) {
            // First group = demo user messages, second group = real user replies
            const senderId = msgs.length === 0 ? demoUid : (convo.indexOf(group) % 2 === 0 ? demoUid : userId);
            for (const text of group) {
              const venueRef = text.includes('{venue}') ? text.replace('{venue}', V[i % V.length].name) : text;
              msgs.push({ thread_id: thread.id, sender_id: senderId, text: venueRef, created_at: new Date(msgTime).toISOString() });
              msgTime += (2 + Math.random() * 5) * 60000; // 2-7 min between msgs
            }
          }
          await sb.from('dm_messages').insert(msgs);
        }
      }
      
      return new Response(JSON.stringify({success:true,stats:{users:uids.length,venues:V.length,posts:15,plans:7,events:3,dms:4,yaps:yapRows.length,city,out:16,planning:8,close_friends:8,checkins:checkinRows.length}}),{headers:{...h,'Content-Type':'application/json'}});
    } else if (action === 'clear') {
      // Delete demo-flagged rows from tables with is_demo column
      await sb.from('events').delete().eq('is_demo',true);
      await sb.from('plans').delete().eq('is_demo',true);
      await sb.from('posts').delete().eq('is_demo',true);
      await sb.from('yap_messages').delete().eq('is_demo',true);
      await sb.from('night_statuses').delete().eq('is_demo',true);
      await sb.from('checkins').delete().eq('is_demo',true);
      await sb.from('stories').delete().eq('is_demo',true);

      // Get demo profile IDs for FK cleanup
      const {data:d}=await sb.from('profiles').select('id').eq('is_demo',true);
      if(d?.length){
        const dids=d.map((x:any)=>x.id);

        // Safeguard logging: count real data that will be preserved
        const {count:realFriendships}=await sb.from('friendships').select('id',{count:'exact',head:true}).not('user_id','in',`(${dids.join(',')})`).not('friend_id','in',`(${dids.join(',')})`);
        const {count:realVenues}=await sb.from('venues').select('id',{count:'exact',head:true}).eq('is_demo',false);
        console.log(`[Demo Clear] Preserving ${realFriendships} real friendships, ${realVenues} real venues`);

        // Clean up DM threads with demo users
        const {data:dThreadMembers}=await sb.from('dm_thread_members').select('thread_id').in('user_id',dids);
        if(dThreadMembers?.length){
          const tids=[...new Set(dThreadMembers.map((t:any)=>t.thread_id))];
          await sb.from('dm_messages').delete().in('thread_id',tids);
          await sb.from('dm_thread_members').delete().in('thread_id',tids);
          await sb.from('dm_threads').delete().in('id',tids);
        }

        // Clean up all FK references to demo profiles
        await sb.from('friendships').delete().in('user_id',dids);
        await sb.from('friendships').delete().in('friend_id',dids);
        await sb.from('close_friends').delete().in('user_id',dids);
        await sb.from('close_friends').delete().in('close_friend_id',dids);
        await sb.from('post_likes').delete().in('user_id',dids);
        await sb.from('post_comments').delete().in('user_id',dids);
        await sb.from('plan_votes').delete().in('user_id',dids);
        await sb.from('plan_downs').delete().in('user_id',dids);
        await sb.from('plan_participants').delete().in('user_id',dids);
        await sb.from('event_rsvps').delete().in('user_id',dids);
        await sb.from('yap_votes').delete().in('user_id',dids);
        await sb.from('yap_comments').delete().in('user_id',dids);
        await sb.from('story_views').delete().in('user_id',dids);
        await sb.from('notifications').delete().in('sender_id',dids);
        await sb.from('notifications').delete().in('receiver_id',dids);
        await sb.from('venue_buzz_messages').delete().in('user_id',dids);
        await sb.from('location_detection_logs').delete().in('user_id',dids);
        await sb.from('location_events').delete().in('user_id',dids);
        await sb.from('event_logs').delete().in('user_id',dids);
        await sb.from('wishlist_places').delete().in('user_id',dids);
        await sb.from('venue_location_reports').delete().in('user_id',dids);
      }

      // Now safe to delete demo venues and profiles
      await sb.from('venues').delete().eq('is_demo',true);
      // SAFETY: Only delete demo profiles that are NOT real auth users
      // A real user's profile should never have is_demo=true, but guard against it
      const {data:authUsers}=await sb.auth.admin.listUsers();
      const authIds=new Set((authUsers?.users||[]).map((u:any)=>u.id));
      const safeToDelete=dids.filter(id=>!authIds.has(id));
      console.log(`[Demo Clear] Deleting ${safeToDelete.length} demo profiles (skipping ${dids.length-safeToDelete.length} real auth users)`);
      if(safeToDelete.length>0) await sb.from('profiles').delete().in('id',safeToDelete);
      return new Response(JSON.stringify({success:true}),{headers:{...h,'Content-Type':'application/json'}});
    }
    if (action === 'health-check') {
      const {count:profiles}=await sb.from('profiles').select('id',{count:'exact',head:true}).eq('is_demo',true);
      const {count:venues}=await sb.from('venues').select('id',{count:'exact',head:true}).eq('is_demo',true);
      const {count:posts}=await sb.from('posts').select('id',{count:'exact',head:true}).eq('is_demo',true);
      const {count:yaps}=await sb.from('yap_messages').select('id',{count:'exact',head:true}).eq('is_demo',true);
      const {count:nightStatuses}=await sb.from('night_statuses').select('user_id',{count:'exact',head:true}).eq('is_demo',true);
      const {count:checkins}=await sb.from('checkins').select('id',{count:'exact',head:true}).eq('is_demo',true);
      const {count:plans}=await sb.from('plans').select('id',{count:'exact',head:true}).eq('is_demo',true);
      const {count:events}=await sb.from('events').select('id',{count:'exact',head:true}).eq('is_demo',true);
      const {count:friendships}=await sb.from('friendships').select('id',{count:'exact',head:true});
      const stats={profiles:profiles||0,venues:venues||0,posts:posts||0,yaps:yaps||0,nightStatuses:nightStatuses||0,checkins:checkins||0,plans:plans||0,events:events||0,totalFriendships:friendships||0};
      const healthy=(stats.profiles>0 && stats.venues>0);
      return new Response(JSON.stringify({success:true,healthy,stats,isAdmin}),{headers:{...h,'Content-Type':'application/json'}});
    }

    return new Response(JSON.stringify({error:'Invalid action','validActions':['seed','clear','health-check']}),{status:400,headers:{...h,'Content-Type':'application/json'}});
  } catch(e) {
    console.error(e);
    return new Response(JSON.stringify({error:String(e)}),{status:500,headers:{...h,'Content-Type':'application/json'}});
  }
});
