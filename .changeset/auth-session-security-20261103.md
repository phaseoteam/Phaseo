---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Close sign-in and session gaps from the November security review. Changing or resetting your password, or turning on two-factor authentication, now signs you out on your other devices and ends CLI, desktop and app access granted before. Changing your password or email needs two-factor verification when it's on. To sign in the CLI you now type the code shown in your terminal, so a link from someone else can't approve their login. Workspace data can't be read or changed through the database API without two-factor verification when it's on.
