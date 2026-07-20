---
title: MFA Setup and Recovery
description: How to enroll and manage multi-factor authentication access.
order: 2
updated: 2026-07-11
---

Enable MFA from `Settings -> Account` to protect your API keys and billing actions.

Recommended setup:

- Register an authenticator app first.
- Keep a secure backup of your authenticator configuration before changing devices.
- Confirm a fresh sign-in after setup.

Supabase MFA only upgrades a session after a verified authenticator challenge. This application does not issue custom recovery codes because they cannot create the required AAL2 session. If you lose access to your authenticator, contact support to recover the account safely.

Passkeys can also be added from the MFA settings page when they have been enabled for the current environment. They provide passwordless sign-in and do not replace the authenticator factor required by MFA.
