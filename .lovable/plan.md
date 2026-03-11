

## Default to Sign Up view

One-line change in `src/pages/Auth.tsx`:

**Line 26**: Change `useState(!inviteCode)` to `useState(false)` so the sign-up form is always shown by default (not just when an invite code is present).

Additionally, update the button labels:
- Primary submit button: change `'Sign Up'` to `'Create Account'` 
- Toggle link: swap the order so "Already have an account? Sign in" shows when on signup, and "Don't have an account? Sign up" shows when on login (this is already correct)

