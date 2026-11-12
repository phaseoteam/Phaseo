---
"@phaseo/web": patch
---

Make model pages lighter to render. The pricing history, usage and effective-price series load in the browser from the web API instead of being embedded in every page. The provider table no longer embeds the hourly series that only its click-to-open inspector draws. The header's "Use this model" sheet gets only the identifiers, parameters and endpoints it reads. Subscription plans carry only the fields the section shows. Model pages no longer render the `/models` list skeleton.
