---
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Add a License filter to the /models and /models/table pages. The catalogue payloads now carry each model's licence, normalised so spellings such as "Apache-2.0" and "Apache License 2.0" group under one option, and `:free` variants inherit their base model's licence.
