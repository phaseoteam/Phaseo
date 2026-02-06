---
title: Fix 401 and 403 API Errors
description: Diagnose invalid credentials and permission-related API failures.
order: 2
updated: 2026-02-06
---

Use this checklist for authentication and permission failures.

## 401 Unauthorized

- Verify the API key is correct and active.
- Check request headers for formatting issues.
- Confirm you are sending the key to the expected environment.

## 403 Forbidden

- Confirm your key has access to the requested resource.
- Check workspace/team-level permission settings.
- Verify the endpoint is available for your current plan.
