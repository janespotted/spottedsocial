# Test phone users for OTP login

Phone login in the app (`src/pages/Auth.tsx` and `mobile/src/app/auth/index.tsx`) calls
`supabase.auth.signInWithOtp({ phone })` with the number stripped to digits and `+`.
Supabase lets you register **test phone numbers** that skip the SMS provider and accept a
fixed code. Register numbers in international format **without** the `+`, spaces, or dashes
(e.g. `15550000001`). In the app you still type the `+1` prefix; Supabase normalizes it.

## The 10 test users

| # | Phone (type this in the app) | OTP code |
|---|------------------------------|----------|
| 1 | +1 555 000 0001 | 123456 |
| 2 | +1 555 000 0002 | 123456 |
| 3 | +1 555 000 0003 | 123456 |
| 4 | +1 555 000 0004 | 123456 |
| 5 | +1 555 000 0005 | 123456 |
| 6 | +1 555 000 0006 | 123456 |
| 7 | +1 555 000 0007 | 123456 |
| 8 | +1 555 000 0008 | 123456 |
| 9 | +1 555 000 0009 | 123456 |
| 10 | +1 555 000 0010 | 123456 |

Each number becomes its own `auth.users` row (and profile) the first time it verifies.

## Option A: Supabase Dashboard (fastest)

1. Open https://supabase.com/dashboard/project/rwavbyvdytdegntdryll/auth/providers
2. Expand **Phone**.
3. Make sure **Enable Phone provider** is on. (If you have no Twilio / MessageBird / Vonage /
   Textlocal credentials yet, pick any provider and leave the fields as they are. Test numbers
   never hit the provider.)
4. In **Test Phone Numbers and OTPs**, paste this (comma separated, no spaces):

```
15550000001=123456,15550000002=123456,15550000003=123456,15550000004=123456,15550000005=123456,15550000006=123456,15550000007=123456,15550000008=123456,15550000009=123456,15550000010=123456
```

5. Click **Save**.

## Option B: Management API (scriptable)

Create a personal access token at https://supabase.com/dashboard/account/tokens, then:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxx
bash supabase/scripts/set-test-phone-users.sh
```

## Option C: CLI config push

`supabase/config.toml` now has an `[auth.sms.test_otp]` block with the same 10 numbers.
It applies automatically to `supabase start` (local). To push it to the hosted project:

```bash
supabase login
supabase link --project-ref rwavbyvdytdegntdryll
supabase config push
```

Note: `config push` syncs the whole auth section of `config.toml` to the hosted project, so
review the diff it prints before confirming.

## Verify

1. Open the app, choose phone login, enter `+1 555 000 0001`, tap continue.
2. Enter `123456`. You should land in the app as a new user.
3. Check https://supabase.com/dashboard/project/rwavbyvdytdegntdryll/auth/users for the row with phone `15550000001`.

## Common failures

- **"Invalid phone number" / "Unsupported phone provider"**: Phone provider toggle is off. Turn it on.
- **"Error sending SMS"**: the number you typed does not match a registered test number. Type the full number with country code, e.g. `+1 555 000 0001`.
- **Dashboard rejects the list**: entries must have no `+`, spaces, or dashes. Use `15550000001=123456`, not `+15550000001=123456`.
- **"Token has expired or is invalid"**: the code was typed for a number that is not in the test list, so a real SMS was attempted.
- **"Signups not allowed for OTP"**: **Allow new users to sign up** is off under Auth settings. Turn it on, or create the users first with the Admin API.
