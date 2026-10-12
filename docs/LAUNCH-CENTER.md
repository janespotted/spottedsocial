# Spotted Launch Center

The browser admin entry is `/launch-admin.html`. It is a separate entry point, so visiting it does not mount the consumer application's tracking or notification providers. Sign in with the existing Spotted admin account's email; only server-owned `launch_operators.wave_admin` access can read or change any guest list. An email sign-in never creates a new admin account. Configure the exact deployed admin URL in Supabase Auth's redirect allowlist before using email links.

## First 100 and later waves

Create a named draft with a capacity of 100. Paste numbers and optional names, or upload a CSV. Imports normalize numbers, reject invalid rows, and skip duplicate numbers and completed members. Imported people enter the queue first; select them and assign them to the draft. The server serializes assignments and rejects a batch that exceeds the capacity. Existing members are shown separately; a capacity of 100 means 100 named invitation places, in addition to existing accounts.

Before opening the first wave, save an external TestFlight invitation URL or App Store URL. Build 53 is internal-only, so its App Store Connect page is not a valid invitation link. Confirm invite-only admission in Launch settings. This preserves completed accounts but requires every new entrant, including Apple users, to verify an invited phone. Review the actual guest list before opening access. A forwarded installation link cannot grant admission.

Later nominations enter the queue only after their nominator completes both required nominations. A nominated phone is unique across seed imports and nominations. Draft assignment is separate from admission. Opening a wave is safe to repeat. Pause stops new claims while people already joining retain access. Revoking an unused invitation preserves its history; this action cannot remove an existing account. Opened lists cannot be silently reshuffled.

## Status definitions

- Pending: in the queue; not assigned or invited.
- Selected: in a draft wave; no access yet.
- Access open: the verified number can claim a place; no invitation is recorded as sent.
- Invited: personal delivery was explicitly recorded or the SMS provider accepted the message. Delivery status is shown separately.
- Started: the invited number has been verified and claimed by one account.
- Joined: profile and both required nominations are complete.
- Revoked: unclaimed access withdrawn, with history retained.

Search by name, phone, or nominator; filter by wave and status. CSV export labels itself as the current page and escapes spreadsheet formulas. No guest lists are stored in browser persistence.

## Apple sign-in

Apple stays connected to the same authenticated account. Phone verification uses Supabase `updateUser({phone})` and `verifyOtp({type:'phone_change'})`; the database reads only the confirmed phone from `auth.users`. It never trusts editable user metadata. A phone already belonging to another account is not merged automatically: sign in to that phone's existing account, then link Apple in Settings. Previously completed accounts retain access. Build 53 already has the waiting-screen phone-claim path; the next mobile build adds the dedicated required-phone screen.

## Invitation delivery

Personal sharing works by copying the invitation and explicitly marking it sent afterward. Copying alone never changes delivery status. Automated SMS is fail-closed until the sender has been configured and the recipient's own consent is recorded. A contact nomination is not SMS permission. Suppressed recipients cannot be queued. There are no automatic reminders or silent resends.

The database queues one initial text per guest. `launch-send-invitations` validates the caller and admin role, then uses a server-only worker to claim messages. A provider timeout/ambiguous reply becomes Unknown, with no automatic retry. `launch-sms-callback` validates the Twilio signature against the exact public URL, every form field, and the configured account. Delivery updates are monotonic; STOP suppresses future messages. Provider acceptance is not displayed as delivery or joining.

Required server secrets (never browser variables): `LAUNCH_TWILIO_ACCOUNT_SID`, `LAUNCH_TWILIO_AUTH_TOKEN`, `LAUNCH_TWILIO_MESSAGING_SERVICE_SID`, and `LAUNCH_SMS_MODE=live`. Configure the Messaging Service's incoming-message webhook as the deployed `launch-sms-callback` function, enable Advanced Opt-Out, verify the sender's eligibility, and only then set `launch_settings.sms_enabled=true`. The sender attaches its signed-status callback per message. Credential provisioning, sender activation, real SMS charges, and a real-device delivery test remain separate from code deployment. No SMS credentials or recipient messages are supplied by preview fixtures.

## Deployment and verification

Migration: `20261012021331_launch_admin_center.sql`. It adds the admin tables and functions but leaves admission open and automated SMS disabled by default. Applying it does not open any wave or send messages. Do not toggle invite-only mode without the reviewed initial guest list and an installable app link.

Publish the admin HTML with the existing Vite build. `VITE_LAUNCH_PREVIEW=true` works only in a local development server and uses clearly labeled synthetic people; production builds remove this path. Real data always requires server-admin authorization. No browser flag, URL parameter, or CSS visibility grants permission.

For future app/backend releases, pause automatic tester distribution first, verify the backend, then make the client available. This avoids repeating build 53's brief profile-endpoint deployment gap.

Tests: isolated PostgreSQL cases cover role denial, Apple/phone admission, capacity, imports, duplicates, pending nominations, preservation, pause/revoke, delivery idempotency and STOP. Hosted test-project REST checks cover actual authorization, import/assignment, capacity rejection, disabled sender and forged callback rejection. Mobile regression checks cover required phone routing and existing privacy behavior. Provider delivery cannot be certified by mocked tests.

### Reproduce the focused checks

- `npx tsc -p tsconfig.launch-admin.json --noEmit`
- `node --test tests/launch-admin/import.test.cjs tests/launch-admin/sms.test.mjs`
- With `@electric-sql/pglite` available (or `SPOTTED_PGLITE_MODULE` pointing at it), run `node tests/launch-admin/database.cjs`.
- Run the existing mobile checks and the root Vite production build.

The full consumer-web TypeScript check currently reports 52 pre-existing errors. Excluding the new admin directory produces identical diagnostics; the dedicated admin TypeScript check passes. The full Vite production build succeeds. These older web type errors are not silently waived as passing checks.
