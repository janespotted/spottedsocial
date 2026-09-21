# Phone OTP — Twilio cost and SMS pumping fraud

**Status: not implemented. Written Sept 19 2026 as a decision record for later.**

Nothing in this document is done. Phone login currently runs on Supabase **test
OTPs** (`supabase/config.toml` → `[auth.sms.test_otp]`, see `TEST-PHONE-USERS.md`),
which never reach an SMS provider and cost nothing. The Twilio account behind
real phone login is **suspended** (error 20003 — see `mobile/RELEASE-CHECKLIST.md`
§ "Needed from the client", item 3).

**Read this before reactivating that Twilio account.** The moment it goes live,
every item below becomes real money and real exposure. The test-OTP setup is
currently what is protecting us, and it protects nothing once a real provider is
wired in.

## How OTP works here

Supabase Auth generates and verifies the code. Twilio is only the pipe that
carries the SMS — it does not participate in the OTP logic.

| Step | Where |
|------|-------|
| Send code | `mobile/src/app/auth/index.tsx:48` — `supabase.auth.signInWithOtp({ phone })` |
| Verify code | `mobile/src/app/auth/otp.tsx:29` — `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` |
| Resend | `mobile/src/app/auth/otp.tsx:39` — 30s client cooldown (`RESEND_COOLDOWN_S`) |

The web app uses the same calls from `src/pages/Auth.tsx`.

## Provider choice: Twilio Messaging, not Twilio Verify

Supabase's Phone provider can point at either. They price very differently:

| Provider | What we'd use | Cost per code sent (US) |
|----------|---------------|-------------------------|
| **Twilio Messaging** (Programmable SMS) | Messaging Service SID | ~$0.0079 msg + ~$0.0050 carrier fee ≈ **$0.013** |
| Twilio Verify | Verify Service SID | **~$0.05** per verification + the SMS cost |

**Pick Messaging.** Verify's premium buys OTP generation, expiry, rate limiting
and Fraud Guard. Supabase Auth already does the first three, so with
`signInWithOtp` we would pay ~4× for one feature we actually use (Fraud Guard).

Revisit Verify only if fraud persists *within* allowed countries after the
controls below are in place — Fraud Guard carries number-range reputation data
that geo permissions cannot express.

**Prices are list prices as of Sept 2026 — re-check at twilio.com/pricing before
committing.** They change.

### Expected spend

Per successful login ≈ $0.013, plus resends. With a 30s resend cooldown, budget
~1.2 sends per login:

- 1,000 logins/month → ~$16
- 10,000 → ~$160
- Plus ~$1.15/mo for the phone number

Volume is not the cost risk. Fraud is.

## SMS pumping fraud

Also called SMS traffic pumping, toll fraud, or artificially inflated traffic.

**The scam:** some carriers (typically small operators in weakly regulated
markets) charge very high SMS termination fees — $0.30–$1.00+ per message
against a normal fraction of a cent. A fraudster who controls numbers on such a
range, or has a revenue-share with that carrier, scripts our "send code" button
against thousands of their own numbers. They never enter the codes; they don't
want accounts. They want the *message sent*. The carrier collects termination
fees and kicks back a share. We pay for every message.

**Why it is dangerous rather than merely annoying:**

- **Invisible in product metrics.** Signups don't spike, because nobody completes
  verification. It shows up on the Twilio bill, after the money is gone.
- **The traffic is legitimate-looking.** No injection, no malformed payloads,
  nothing a WAF flags. The API is working exactly as designed.
- **Per-number rate limiting does not stop it.** The attacker rotates thousands
  of numbers, so the 30s cooldown in `otp.tsx:10` never trips once. That cooldown
  is a UX affordance, not a security control.
- **We are billed at send time**, regardless of whether the code is ever verified.

Public incidents have run to five and six figures over a single weekend.

### Our specific exposure

`mobile/src/app/auth/index.tsx:41-44` validates only `cleaned.length < 10` — any
country code passes through untouched. That is deliberate: the comment at line 9
explains it is so `+92`, `+44` etc. work without a country mask, which Lahore
testing needs. But "any country code" is exactly the attack surface.

## Planned controls (none implemented)

Ranked by value. The first two are Twilio-dashboard work, outside this repo.

### 1. Twilio Geo Permissions — free, do first

Disable every country we don't serve. Spotted is NYC / LA plus Lahore for demo
testing, so allow `+1` and `+92` and deny the rest.

**Known weakness, stated plainly:** this is a narrower perimeter than it sounds.

- Geo permissions work at **country granularity**, so they cannot express "US and
  Canada but not Caribbean." `+1` is the whole North American Numbering Plan,
  including ranges historically used for toll fraud (+1-809 Dominican Republic,
  +1-876 Jamaica, and others).
- **Pakistan is itself a real pumping origin.** Allowing `+92` for Lahore testing
  leaves one of our two permitted countries open.

So geo permissions substantially reduce exposure but do not close it. Do not
treat it as sufficient on its own. If Lahore testing can run on test OTPs
(`TEST-PHONE-USERS.md`) rather than real SMS, consider denying `+92` entirely —
that would be the cleanest resolution of this gap and costs us nothing, since
demo-mode testing does not need real message delivery.

### 2. Twilio spend alert + monthly cap — free, do first

A hard ceiling bounds the worst case even when something slips through. This is
the difference between a $200 incident and a $40,000 one. Set it at the same time
as geo permissions, not later.

### 3. Supabase Auth rate limits — dashboard

Auth → Rate Limits. Confirm the per-number SMS limit is on (default 30s). Per-number
only, so see the caveat above about number rotation.

### 4. Server-side send limits — the real code-level control

Move OTP sends behind an edge function in `supabase/functions/` that enforces
**per-IP and per-device** limits before Supabase hands anything to Twilio. This
is the control that actually addresses number rotation, because it limits the
*requester* rather than the *destination*.

This is a meaningful change to the auth flow (both `mobile/src/app/auth/` and the
web `src/pages/Auth.tsx` would route through it) and has not been designed or
scoped. Do not start it without deciding the flow first.

**A client-side country allowlist in `auth/index.tsx` is NOT a security control.**
An attacker calls the Supabase API directly and never touches our app. It is worth
adding only as UX — a fast, clear error for a user typing an unsupported country.
Do not count it as mitigation.

### 5. Monitor the send-to-verify ratio

Healthy is ~1.2 sends per completed verification. An attack pushes it toward
infinity, because codes get sent and never entered. This is the earliest available
detection signal and is worth wiring into whatever dashboard we use.

## Also required before real SMS: A2P 10DLC registration

Mandatory for US application-to-person SMS. Without it, carriers filter our OTPs —
users report "never got the code" and it is not debuggable from our side.

- One-time brand fee ~$4–44, plus ~$1.50–10/mo campaign fee
- Approval takes several days

**Start this before launch, not at launch.** It gates real phone login working at
all, independently of everything above.

## Summary of what to do when Twilio is reactivated

1. A2P 10DLC registration (days of lead time — start first)
2. Geo permissions: allow `+1`, and decide `+92` vs. test-OTPs for Lahore
3. Spend alert + monthly cap
4. Confirm Supabase Auth SMS rate limit is on
5. Verify Supabase Phone provider points at a **Messaging** Service SID, not Verify
6. Then, as follow-up work: the edge-function send limits (§4) and ratio monitoring (§5)
