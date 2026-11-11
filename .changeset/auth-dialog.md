---
"@phaseo/web": minor
---

Sign in and sign up in a dialog over the current page instead of a separate page. The whole flow stays in the dialog: enterprise SSO, the two-factor code, setting a new password after a reset email, and sign-in errors. A wrong password or "check your email" shows in place, and after signing in you return to the page you were on. The old sign-in, sign-up, SSO, error and two-factor URLs still work: they open the dialog over the home page.
