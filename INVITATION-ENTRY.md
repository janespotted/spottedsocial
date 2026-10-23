# Public invitation landing page

`https://spottedsocial.vercel.app/join` is the public installation landing page. The Command Center's branch preview is protected by Vercel sign-in and must never be the destination sent to new members or used for Apple's public association-file lookup.

This small static page is published with the existing production site. It does not replace its application, move the Command Center, relax preview protection, change membership, or send messages. Its public publishable key calls only `get_launch_installation`, which exposes the configured Apple download link. No visitor phone number, invitation token, session or contact data is sent by the page.

The page preserves the requirement to nominate two people. Its links only navigate; verified-phone membership remains enforced by the existing backend. An unset installation URL shows an opening-soon state. The two-person nomination and waiting-room native companion remains on `codex/seamless-invite-native` for the coordinated release.

Source: `public/join.html` and `public/invitation-assets`. Brand assets match the existing Command Center. Check with `node --test tests/public-invite-entry.test.mjs` and the normal Vite build. Before outreach, verify both `/join` and `/.well-known/apple-app-site-association` from an unauthenticated HTTP client; the final host must remain `spottedsocial.vercel.app`, without Vercel's login redirect.

The explicit Open Spotted fallback uses the app root (`spotted:///`) so existing installed builds can open too. The new `/join` universal-link path still routes through the session gate in the native companion.
