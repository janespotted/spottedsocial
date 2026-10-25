# Requested invites → wave outreach

The existing launch center and production database are reused. Website intake is private; assigning a request does not open app access, send a message, or record SMS permission.

## Operator flow

1. In **Requested invites**, each row has a draft-wave dropdown and **Add to wave**. **The first 100** is the default if it has room. Already selected requests show their actual wave and can move between draft waves. Full waves cannot take another person. Active invitations keep their membership history.
2. Requests without a usable phone open a small phone-entry form. The original Netlify submission stays unchanged. US numbers normalize to +1; international numbers require an explicit country code. Repeated submissions with the same number reuse the existing guest. Completed members cannot be selected again.
3. In **The first 100**, choose **Prepare wave outreach**. This previews the exact server-generated text and the entire guest list (up to the existing 500-person wave limit), with readiness/exclusion reasons and provider delivery states. The 127-person planning pool uses the same existing guest/wave system after phone collection.
4. Finish setup: external TestFlight/App Store install link, phone-based invite admission, recipient SMS permission, and a configured/verified invitation sender. Record permission per guest with evidence; a referral, event RSVP or generic website request is not automatically SMS consent.
5. Review and open the wave using the existing controls. Review outreach again, check the confirmation, and **Send N invitations**. Smaller batches are possible; the wave need not be full. Only the reviewed, eligible recipients are enqueued.
6. Keep the page open while sending. The browser drains small scoped chunks. If the page closes or the connection fails, remaining messages stay in the existing database queue. Reopen outreach and **Resume queued texts**. This processes queued messages only, not previously sent/uncertain messages. This version has no unattended background scheduler.

## Safety and delivery behavior

- Private admin RPCs check `launch_operators.wave_admin` on every call; tables use RLS with no browser table grants.
- All assignment/capacity changes share the existing settings lock. A failed move rolls back the removal. Stale wave changes require a refresh.
- Each review fingerprints the wave, recipient list/statuses, settings and exact message. Any material change requires a new review before enqueueing.
- A batch request ID gives the queue operation a durable idempotency receipt. The existing unique message-per-guest constraint covers both individual and bulk sends.
- The sender rechecks consent, opt-out, revocation, wave status and existing membership when claiming each message. New batch sending is scoped by batch ID; resume is scoped by wave; individual sends now scope by guest.
- Provider acceptance, sent and delivered remain separate statuses. A timeout/ambiguous result becomes `unknown`, never an automatic retry. Failed or uncertain deliveries require provider reconciliation or personal follow-up. Refresh the view to see callback updates.
- Preflight only checks configuration/readiness; it does not claim a message or call the SMS provider. Real carrier delivery needs a separately authorized test after sender setup.

## Rollout and verification

Migration: `20261022113542_request_wave_outreach.sql`. Sender: `launch-send-invitations`, existing callback unchanged.

PGlite integration tests apply the actual foundational/admin/request/new migrations to isolated data and cover admin/non-admin access, phone normalization, duplicate requests, missing phone recovery, atomic moves/capacity, protected membership, stale reviews, permission exclusions, idempotent batches, scoped claims, post-queue opt-outs and unknown delivery. A 100-person rehearsal drains exactly 100 distinct fictional recipients, including a paused/interrupted/resumed run. No external SMS calls are made by these database tests.

The live sender remains disabled, no install link is invented, admission settings remain unchanged, and no real contacts are selected or messaged by this deployment.
