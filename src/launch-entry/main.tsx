import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import mark from '../launch-admin/assets/spotted-mark.svg';
import './style.css';
import { installationLink } from './installation';

function Entry() {
  const [link, setLink] = useState<ReturnType<typeof installationLink>>(null);
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setStatus('loading');
    const client = supabase as unknown as { rpc: (name: string) => { abortSignal: (signal: AbortSignal) => PromiseLike<{data: {installUrl?: string}|null;error: unknown}> } };
    void Promise.resolve(client.rpc('get_launch_installation').abortSignal(controller.signal)).then(({data, error}) => {
      if (!active) return;
      if (error) { setStatus('error'); return; }
      setLink(installationLink(data?.installUrl)); setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); }).finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [revision]);
  return <main>
    <a className="brand" href="https://joinspottedapp.com"><img src={mark} alt="" width="28" height="44"/>Spotted</a>
    <section>
      <p className="eyebrow">NEW YORK · BY INVITATION</p>
      <h1>Your people.<br/><em>Your night.</em></h1>
      <p className="intro">Download Spotted. Verify your invited number.<br/>Your place will be waiting.</p>
      <div className="actions" aria-live="polite">
        {status === 'loading' ? <p className="hint">Finding your download…</p> : status === 'error' ? <><p role="alert">Couldn’t load the download link.</p><button onClick={() => setRevision(x=>x+1)}>Try again</button></> : link ? <a className="primary" href={link.url}>{link.label}</a> : <p className="hint">Downloads are opening soon. Your invitation will tell you when it’s time.</p>}
        <a className="secondary" href="spotted://join">Already installed? Open Spotted ↗</a>
      </div>
      <p className="small">New members nominate two people for a future wave.</p>
    </section>
    <footer><span>No invitation yet?</span> <a href="https://joinspottedapp.com/">Request a place ↗</a><p>Your invitation belongs to your verified phone number. Forwarding this link doesn’t transfer access.</p></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Entry/>);
