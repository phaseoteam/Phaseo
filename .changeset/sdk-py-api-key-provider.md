---
"@phaseo/py-sdk": minor
---

`api_key` can be a function returning the credential for each request, so trusted workloads can pass a fresh GitHub Actions or Vercel OIDC token instead of an API key. `AsyncPhaseo` also accepts an async function.
