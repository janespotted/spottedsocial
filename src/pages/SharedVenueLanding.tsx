import { useSearchParams } from 'react-router-dom';
/** A public handoff only: no attendance, contacts or private venue details. */
export default function SharedVenueLanding() {
  const [params] = useSearchParams();
  const venueId = params.get('venueId');
  const valid = typeof venueId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venueId);
  return <main className="min-h-screen bg-[#110a24] text-white flex items-center justify-center p-6"><div className="max-w-sm text-center space-y-6">
    <h1 className="text-3xl">Spotted</h1><h2 className="text-xl">{valid ? 'A spot for your next night out' : 'This venue link is incomplete'}</h2>
    {valid ? <><p className="text-white/70">Open this spot in Spotted to save it or make a plan with friends.</p><a className="block rounded-full bg-[#d4ff00] text-black p-4 font-semibold" href={`spotted://venue-link?venueId=${encodeURIComponent(venueId)}`}>Open in Spotted</a></> : null}
    <a className="block underline p-3" href="https://testflight.apple.com/join/UjWqvyCX">Get Spotted on TestFlight</a>
    <p className="text-white/60 text-sm">If you need to install Spotted, return to this link afterward. New members still need an active invitation and the required nominations.</p>
  </div></main>;
}
