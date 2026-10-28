---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
---

Group mobile push notifications and add notification categories. A lab's burst of releases now arrives as one notification ("DeepSeek released 12 models"), as do several models gaining one provider and repeated price changes to one model; pushes wait five minutes to settle, a later burst the same day replaces the earlier notification with a cumulative one, and a grouped push counts once against the daily cap. A bulk catalogue change that brings a provider its first public routes sends one "Groq is now on Phaseo" notification (`provider_launched`, matched by rules for Phaseo availability or new providers); other bulk changes stay silent. Mobile notification settings gain per-category switches (`categories`, all on by default, saved partially), device registration accepts `channelScheme` so app builds with one Android channel per category get pushes on those channels, and pushes carry `category`, `group` and a replacement `tag`.
