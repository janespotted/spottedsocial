import { createClient } from "npm:@supabase/supabase-js@2";

const NYC = [["Le Bain",40.7414,-74.0078,"Meatpacking"],["House of Yes",40.7089,-73.9332,"Bushwick"],["The Box",40.7216,-73.9935,"LES"],["Elsewhere",40.7067,-73.9278,"Bushwick"],["Double Chicken Please",40.7195,-73.9921,"LES"],["Dante NYC",40.7310,-74.0029,"West Village"],["PHD Rooftop",40.7614,-73.9776,"Chelsea"],["Good Room",40.7089,-73.9343,"Greenpoint"]];
const LA = [["Academy LA",34.0479,-118.2565,"DTLA"],["Sound Nightclub",34.0412,-118.2468,"Hollywood"],["Tenants of the Trees",34.0826,-118.2690,"Silver Lake"],["Akbar",34.0894,-118.2714,"Silver Lake"],["Highland Park Bowl",34.1118,-118.1924,"Highland Park"],["The Bungalow",34.0062,-118.4715,"Santa Monica"],["The Dresden",34.1055,-118.2891,"Los Feliz"],["EP & LP",34.0789,-118.3661,"WeHo"]];
const PB = [["Cucina",26.7056,-80.0364,"Royal Poinciana"],["Mary Lou's",26.7151,-80.0530,"Clematis"],["Respectable Street",26.7140,-80.0555,"Clematis"],["Four",26.7128,-80.0538,"Downtown WPB"],["ER Bradley's",26.7153,-80.0525,"Clematis"]];

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
const exp = () => new Date(Date.now()+4*3600000).toISOString();
const rec = (h=4) => new Date(Date.now()-Math.random()*h*3600000).toISOString();
const pick = <T>(a:T[],n:number):T[] => [...a].sort(()=>0.5-Math.random()).slice(0,n);
const wknd = () => { const t=new Date(),d=t.getDay(),f=d===0?-2:d===6?-1:d===5?0:5-d; return [0,1,2].map(i=>{const x=new Date(t);x.setDate(t.getDate()+f+i);return x.toISOString().split('T')[0];}); };

Deno.serve(async (req) => {
  const h = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
  if (req.method === 'OPTIONS') return new Response('ok', {headers:h});

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // SECURITY: Require admin authentication
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

    const { data: hasAdmin, error: roleError } = await authClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });
    if (roleError || !hasAdmin) {
      console.error('Admin role check failed:', roleError?.message || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...h, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${user.id} triggering seed-demo-data`);

    const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{autoRefreshToken:false,persistSession:false}});
    const {action, city='nyc', userId} = await req.json();

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
        await sb.from('checkins').delete().eq('is_demo',true);
        await sb.from('stories').delete().eq('is_demo',true);
      }
      await sb.from('profiles').delete().eq('is_demo',true);
      
      // Users
      const ts=Date.now(), uids:string[]=[];
      const userList = DEMO_USERNAMES[city] || DEMO_USERNAMES['nyc'];
      for(let i=0;i<24;i++){const u=userList[i];const id=crypto.randomUUID();uids.push(id);await sb.from('profiles').insert({id,display_name:u[0],username:u[1],avatar_url:`https://api.dicebear.com/7.x/avataaars/svg?seed=${u[0]}${i}`,is_demo:true});}
      
      // Friend all real users with demo
      const {data:real}=await sb.from('profiles').select('id').eq('is_demo',false);
      const fr=(real||[]).flatMap((r:any)=>uids.map(d=>({user_id:r.id,friend_id:d,status:'accepted'})));
      if(fr.length) await sb.from('friendships').insert(fr);
      
      // Venues - upsert then fetch IDs separately (upsert may not return on conflict)
      await sb.from('venues').upsert(V.map(v=>({name:v.name,lat:v.lat,lng:v.lng,neighborhood:v.hood,is_demo:true,popularity_rank:v.rank,city})),{onConflict:'name'});
      const {data:vens}=await sb.from('venues').select('id,name').in('name',V.map(v=>v.name));
      const vm=new Map((vens||[]).map((v:any)=>[v.name,v.id]));
      
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
      
      // 8 users "planning" (thinking about going out) - users 16-23
      await sb.from('night_statuses').insert(uids.slice(16,24).map((u,i)=>{const v=V[i%V.length];return{user_id:u,status:'planning',planning_neighborhood:v.hood,planning_visibility:'all_friends',expires_at:exp(),is_demo:true};}));
      
      // Posts
      await sb.from('posts').insert(Array.from({length:15},()=>{const v=V[Math.floor(Math.random()*V.length)];return{user_id:uids[Math.floor(Math.random()*uids.length)],text:CAPTIONS[Math.floor(Math.random()*5)],venue_id:vm.get(v.name),venue_name:v.name,image_url:Math.random()>0.4?IMG:null,expires_at:exp(),created_at:rec(4),is_demo:true,visibility:'friends'};}));
      
      // Yap messages - 10 anonymous messages spread across venues
      await sb.from('yap_messages').insert(YAP_TEXTS.map((text,i)=>{const v=V[i%V.length];return{user_id:uids[i%uids.length],text,venue_name:v.name,is_anonymous:true,author_handle:`User${Math.floor(100000+Math.random()*900000)}`,score:Math.floor(Math.random()*80)+5,comments_count:Math.floor(Math.random()*10),expires_at:exp(),is_demo:true};}));
      
      // Plans
      const wd=wknd();
      const {data:pls}=await sb.from('plans').insert(pick(uids,4).map((u,i)=>{const v=V[i%V.length],d=wd[i%3],ex=new Date(d+'T05:00:00');ex.setDate(ex.getDate()+1);return{user_id:u,venue_id:vm.get(v.name),venue_name:v.name,plan_date:d,plan_time:'21:00',description:'Who\'s down?',visibility:'friends',expires_at:ex.toISOString(),is_demo:true};})).select('id,user_id');
      const dws=(pls||[]).flatMap(p=>pick(uids.filter(x=>x!==p.user_id),2).map(x=>({plan_id:p.id,user_id:x})));
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
          // Create thread
          const { data: thread } = await sb.from('dm_threads').insert({ created_by: demoUid }).select('id').single();
          if (!thread) continue;
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
      
      return new Response(JSON.stringify({success:true,stats:{users:uids.length,venues:V.length,posts:15,plans:4,events:3,dms:4,city,out:16,planning:8}}),{headers:{...h,'Content-Type':'application/json'}});
    } else if (action === 'clear') {
      await sb.from('events').delete().eq('is_demo',true);
      await sb.from('plans').delete().eq('is_demo',true);
      await sb.from('posts').delete().eq('is_demo',true);
      await sb.from('yap_messages').delete().eq('is_demo',true);
      await sb.from('night_statuses').delete().eq('is_demo',true);
      await sb.from('venues').delete().eq('is_demo',true);
      const {data:d}=await sb.from('profiles').select('id').eq('is_demo',true);
      if(d?.length){
        const dids=d.map((x:any)=>x.id);
        // Clean up DM threads with demo users
        const {data:dThreadMembers}=await sb.from('dm_thread_members').select('thread_id').in('user_id',dids);
        if(dThreadMembers?.length){
          const tids=[...new Set(dThreadMembers.map((t:any)=>t.thread_id))];
          await sb.from('dm_messages').delete().in('thread_id',tids);
          await sb.from('dm_thread_members').delete().in('thread_id',tids);
          await sb.from('dm_threads').delete().in('id',tids);
        }
        await sb.from('friendships').delete().in('user_id',dids);
        await sb.from('friendships').delete().in('friend_id',dids);
      }
      await sb.from('profiles').delete().eq('is_demo',true);
      return new Response(JSON.stringify({success:true}),{headers:{...h,'Content-Type':'application/json'}});
    }
    return new Response(JSON.stringify({error:'Invalid'}),{status:400,headers:{...h,'Content-Type':'application/json'}});
  } catch(e) {
    console.error(e);
    return new Response(JSON.stringify({error:String(e)}),{status:500,headers:{...h,'Content-Type':'application/json'}});
  }
});
