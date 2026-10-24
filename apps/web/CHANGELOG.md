# @phaseo/web

## 1.3.0

### Minor Changes

- [#2669](https://github.com/phaseoteam/Phaseo/pull/2669) [`825a293`](https://github.com/phaseoteam/Phaseo/commit/825a2930416c740eb9a495408c05e1fc0dbeb55f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an Artificial Analysis cost per intelligence point ranking and scatter chart using matched evaluation configurations, including previews using the deployed API. Record the full methodology version separately from the API's major/minor version. Keep standalone manual index versions from hiding the imported rankings and shorten benchmark cache freshness.

- [#3002](https://github.com/phaseoteam/Phaseo/pull/3002) [`35f54dc`](https://github.com/phaseoteam/Phaseo/commit/35f54dccc941b65e557ee3ad8e3bd60522cdbdde) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a public dynamic Open Graph image endpoint at `/og/dynamic?title=…&description=…&pathname=…` in the Phaseo OG style. Inputs are limited to known params, short Latin text without links, and are checked against a profanity filter; rejected requests return an uncached 400.

- [#2440](https://github.com/phaseoteam/Phaseo/pull/2440) [`a12756e`](https://github.com/phaseoteam/Phaseo/commit/a12756ea04b50d8b10bac309908e2b3d71e7de4e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make Video and Realtime rooms generally available in Chat, and add OCR and Rerank rooms with model selection, authenticated requests, readable results, and JSON downloads.

- [#3105](https://github.com/phaseoteam/Phaseo/pull/3105) [`25a79cc`](https://github.com/phaseoteam/Phaseo/commit/25a79cc517e795801aaee1ea7649a5e6b12a16a5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a routable `broadcast_destination_failing` notification. When a Broadcast destination has failed five requests in a row with nothing delivered for 15 minutes, workspaces that route this alert get one message per failing streak, at most once an hour, by email, Slack, Discord, Teams or webhook.

- [#3102](https://github.com/phaseoteam/Phaseo/pull/3102) [`5e34e7f`](https://github.com/phaseoteam/Phaseo/commit/5e34e7fa6185e055449ddd29ab2aa1ea90f3e42c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record Broadcast delivery health per destination and show it in Broadcast settings: whether each destination is healthy or failing, the last error, and events sent and failed in the last 24 hours.

- [#3129](https://github.com/phaseoteam/Phaseo/pull/3129) [`63cae3e`](https://github.com/phaseoteam/Phaseo/commit/63cae3ead3b791f90c9bbd3ebabae209af8dee55) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast webhook destinations can set a signing secret. Deliveries, connection tests and sample traces then carry `x-phaseo-timestamp` and `x-phaseo-signature`, the hex HMAC-SHA256 of `<timestamp>.<body>`, the same scheme as workspace webhooks.

- [#3147](https://github.com/phaseoteam/Phaseo/pull/3147) [`46e95c7`](https://github.com/phaseoteam/Phaseo/commit/46e95c73f188ec5f562c5ead1286cdfbc8038aba) Thanks [@DanielButler1](https://github.com/DanielButler1)! - The compare page has an Activity section: each model's daily tokens through Phaseo over the last 30 days, split into input, output and reasoning, with request counts.

- [#3148](https://github.com/phaseoteam/Phaseo/pull/3148) [`60c6723`](https://github.com/phaseoteam/Phaseo/commit/60c67235a1376847f305948a43ab43e3d52e5330) Thanks [@DanielButler1](https://github.com/DanielButler1)! - The compare page's Benchmarks section shows where the compared models rank on the capability indexes, next to each index's five leaders.

- [#3116](https://github.com/phaseoteam/Phaseo/pull/3116) [`14ea7ed`](https://github.com/phaseoteam/Phaseo/commit/14ea7ed6a35b7fe0429b2a9d07a24e200df3fabb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redesign the compare page around one grouped table: headline prices on the routes Phaseo serves, the best value marked in each row, a differences-only switch and a short "choose this model for" summary. It adds a pricing section with service tiers and per-unit prices, a cost calculator that runs in the browser, a providers table per model, and benchmarks compared at matching effort levels with confidence intervals. Phones show two models at a time with labels above the values. The picker searches by words and shows the lab, modalities, release date and whether Phaseo serves each model. The page now reads the compact `/api/_web/compare/view` payload and removes about 8,000 lines of old compare components.

- [#3162](https://github.com/phaseoteam/Phaseo/pull/3162) [`f0471de`](https://github.com/phaseoteam/Phaseo/commit/f0471de3b7cfb7820599e7c271c1166a4899c303) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Comparisons of two models have their own indexable pages at `/compare/{a}-vs-{b}`, with a summary, an at-a-glance table and answers to common questions. A curated set of head-to-head pages is listed on the compare page and in the sitemap.

- [#3133](https://github.com/phaseoteam/Phaseo/pull/3133) [`d5fc8cb`](https://github.com/phaseoteam/Phaseo/commit/d5fc8cb6c995f2f1db1187ca865d898154bbb2a1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Compare: choose a route and service tier under each model again, and prices, the calculator and the verdicts follow the choice. The models sit in a sticky header that lines up with the table's columns. Sections have plain headings, modalities show as icons, features as check marks, long-context bands sit beside their base price, and extra meters fold away. The compare view API now sends each non-headline route's own tier prices.

- [#2898](https://github.com/phaseoteam/Phaseo/pull/2898) [`e94c9d9`](https://github.com/phaseoteam/Phaseo/commit/e94c9d9b1d8b1c90bd4381036ef5762368e007df) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show a credits runway under the billing balance. The credits endpoint now reports the average daily credits charged over the last seven days, and the balance card uses it to say when auto top-up is expected or when credits run out at the current pace.

- [#3208](https://github.com/phaseoteam/Phaseo/pull/3208) [`b13ac7a`](https://github.com/phaseoteam/Phaseo/commit/b13ac7aa22c35f3abf860d9a6b15894b9cc36a3f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Settings → Budgets has a Department budgets section: owners and admins can add, change and delete daily, weekly and monthly spend budgets for each department and see each one's spend so far. Department budgets send alerts at about 80% and 100% and never block requests.

- [#2910](https://github.com/phaseoteam/Phaseo/pull/2910) [`85d0e8a`](https://github.com/phaseoteam/Phaseo/commit/85d0e8ab8ea61acec414fa1970ca93132cc3a2e2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the public feedback page and one-click unsubscribe behind feedback request emails. A tokenised link lets people answer without signing in, issues a single-use thank-you credit code while the campaign budget lasts, and opts them out of non-essential email, including marking them unsubscribed in Resend. The redeem page now accepts a prefilled `?code=` and keeps it through sign-in.

- [#2895](https://github.com/phaseoteam/Phaseo/pull/2895) [`880d901`](https://github.com/phaseoteam/Phaseo/commit/880d901275b93678159163ec1ebbb41176f6a838) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forecast API key limits. The keys list and key detail page now project each daily, weekly and monthly window from its pace so far, show when a key is on course to hit its limit, and draw usage, projection and limit with one shared meter. Weekly and monthly key usage now comes from the gateway's UTC window totals instead of reading as zero, and limit reset countdowns use UTC boundaries rather than the viewer's local midnight.

- [#3159](https://github.com/phaseoteam/Phaseo/pull/3159) [`92bec6e`](https://github.com/phaseoteam/Phaseo/commit/92bec6ed812bc0481308b7880853a3e2c68febd4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - New Key security page (Settings → Key Security): see which API keys have no spend limit, never expire, have been idle for 90 days, are safe to remove, have no IP allowlist or no recorded storage location, and fix them in bulk (pause, revoke, set a monthly spend limit, an expiry or a storage location for up to 500 keys at once). Keys are grouped by where they are stored, with one-step "Revoke all" for a platform that reports a breach, and the owner list copies as CSV.

- [#3166](https://github.com/phaseoteam/Phaseo/pull/3166) [`3d8c227`](https://github.com/phaseoteam/Phaseo/commit/3d8c22756a1e502edb50a8d03d69048942a35f5b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Key storage incidents: when a platform where customers store API keys reports a breach, Phaseo staff can revoke or pause, in one step, every key recorded as stored there and created before a cut-off, across all workspaces. Each affected workspace's owners and admins get an email naming the platform and the number of keys, and the Key security page shows what happened and what to do next.

- [#3158](https://github.com/phaseoteam/Phaseo/pull/3158) [`2054ddb`](https://github.com/phaseoteam/Phaseo/commit/2054ddb6ef870a2b625f7b8988fafdf6b891793b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - API keys can record where they are stored (Railway, Vercel, GitHub, 1Password and 35 other places, each with its logo), optionally when the key is created or later on its page. If one of those places reports a breach, the keys stored there can be found and revoked. Revoked keys can no longer be turned back on from the dashboard, the API or the database; rotate them instead.

- [#2686](https://github.com/phaseoteam/Phaseo/pull/2686) [`b4a7418`](https://github.com/phaseoteam/Phaseo/commit/b4a7418dfac7ba646aafc7feb6c13e8e702aea70) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add per-key IP restrictions with labeled IPv4, IPv6, and CIDR entries in key settings. Enforce restrictions during gateway authentication and retain them when rotating keys.
  
  Move key details and editing to dedicated pages with creator information, usage summaries, and filtered request logs.
  
  Add daily request and spend charts, creator avatar chips, and workspace-scoped Activity filters for keys created by a user.

- [#2871](https://github.com/phaseoteam/Phaseo/pull/2871) [`8199e7d`](https://github.com/phaseoteam/Phaseo/commit/8199e7dae3517425d6c2ecc1cd836763a9b55055) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Signed-in users now see a notice under the site header when a model their workspace used recently is being deprecated, with its retirement date, suggested replacement and a link to the usage alerts page. Dismissing it hides it until that model's deprecation or retirement date changes.

- [#2905](https://github.com/phaseoteam/Phaseo/pull/2905) [`f7d6814`](https://github.com/phaseoteam/Phaseo/commit/f7d68148320db0238c483bfbb61e1fcbe0a83046) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Send a one-off notice the first time a workspace's requests for a model no provider serves are answered by a replacement. The workspace owner is emailed once per model and replacement, and the notice can also be routed to Slack, Discord, Teams, webhooks or email destinations from the notification settings.

- [#2892](https://github.com/phaseoteam/Phaseo/pull/2892) [`3eed4fb`](https://github.com/phaseoteam/Phaseo/commit/3eed4fb3ef8e4aaacbcc9550482fc1541643e352) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Let admins approve routing a model to its replacement once no provider serves it, and track when each model stopped being served. Approval records the reviewed replacement and lapses if the replacement changes. Free models can never be approved for a paid replacement. Nothing is rerouted yet.

- [#3084](https://github.com/phaseoteam/Phaseo/pull/3084) [`b60b343`](https://github.com/phaseoteam/Phaseo/commit/b60b343261aa6dfb0560d1a85b4751f8d16effe4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Open a logged request in Chat and continue it. Request details, the request table's right-click menu and a session's details now have an "Open in Chat" action for Chat Completions, Responses and Messages requests whose prompt and response were stored. Chat shows what will be carried over (model, pinned provider, parameters, system prompt, server and function tools, the logged response), then opens a new chat with its own session, saved in the browser. Tool calls, tool results and attachments from the log are sent in their original structure while those messages are unedited, so the conversation continues faithfully, and you can switch models or compare them as in any chat. The link only carries IDs, so any workspace member who can view the request can open it.

- [#2761](https://github.com/phaseoteam/Phaseo/pull/2761) [`891aa5d`](https://github.com/phaseoteam/Phaseo/commit/891aa5d238c01beb487832f3514ab0a9bb557047) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Accept V1.1 provider catalogs alongside V1, with normalized service-tier offers, independent upstream model selectors and pricing, and tier editing in provider settings.

- [#2765](https://github.com/phaseoteam/Phaseo/pull/2765) [`95d7161`](https://github.com/phaseoteam/Phaseo/commit/95d716148cffe5cb0606e678ffd341591257ef17) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep provider catalog feeds syncing alongside attributed manual overrides, with revert actions, change history, model status lists and clearer provider profile and integration settings.

- [#2825](https://github.com/phaseoteam/Phaseo/pull/2825) [`8c8af3b`](https://github.com/phaseoteam/Phaseo/commit/8c8af3bdf3ec12adfaec1f3304f3129ddaf6b19d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Providers declare the request and token limits they impose on Phaseo, provider-wide or per upstream model, through an optional `rate_limits` section in their catalogue feed or the new Rate limits section in provider settings. Limits apply without review once the provider is approved, and the gateway picks up changes as soon as the catalogue revision moves instead of waiting for its configuration TTL.

- [#3215](https://github.com/phaseoteam/Phaseo/pull/3215) [`148f14a`](https://github.com/phaseoteam/Phaseo/commit/148f14a0782360ffd62d2c9e675f37b88113df1c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Settings → Rate limits shows the workspace's limit tier, and the owner can raise it one step when the workspace qualifies.

- [#3213](https://github.com/phaseoteam/Phaseo/pull/3213) [`361792a`](https://github.com/phaseoteam/Phaseo/commit/361792aa50a035e7fcc11b4a97d01c79fbe8af09) Thanks [@DanielButler1](https://github.com/DanielButler1)! - The Rate limits page can set a policy's concurrent request limit and strict mode, and no longer labels them "not enforced yet".

- [#3150](https://github.com/phaseoteam/Phaseo/pull/3150) [`7e408b6`](https://github.com/phaseoteam/Phaseo/commit/7e408b6dbb783862b758e648ced8c36aa501e997) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Settings → Rate limits (beta). Owners and admins can create rate limit policies with requests and tokens per minute, assign them to API keys, members, departments, guardrails or the end-user default, and see how many requests each policy throttled in the last 24 hours. Saves go through the gateway's `/v1/rate-limits` routes, which now also accept the dashboard session, so changes are validated, audited and enforced within about a minute.

- [#3032](https://github.com/phaseoteam/Phaseo/pull/3032) [`0b6d5be`](https://github.com/phaseoteam/Phaseo/commit/0b6d5beed158f9ca6f378b6d4148387f328324c8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show request classifications in Logs and Usage. The label filter lists classifier dimensions by name with their allowed values, even before any request carries them, alongside the caller's own labels and classifier spend; Logs can also filter to a label key with any value, or exclude a value or key. Usage adds a "Usage by label" table (requests, success, tokens and spend per value of any label key, summed in the database by the new `get_private_usage_label_breakdown` RPC), which also shows what classifier calls cost by classifier. The request detail gets a Classifications section with each classifier's answers, confidence, status, model, cost and a link to the classifier call. Members get classifier names, keys and allowed values only; configuration stays admin-only.

- [#2443](https://github.com/phaseoteam/Phaseo/pull/2443) [`d97391a`](https://github.com/phaseoteam/Phaseo/commit/d97391ae0d33702621b35d350f88df31c7f100d5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add shared SDK request controls and diagnostics, native Python async resources,
  resumable media jobs, structured output and streaming helpers, model capability
  preflight, and deterministic testing transports. Export submitted room requests
  as runnable TypeScript or Python and link requests to dashboard traces.
  
  Python JSON requests now use HTTPX. Catch PhaseoHTTPError (or
  httpx.HTTPStatusError) instead of urllib.error.HTTPError, and use error.status
  for the HTTP status; error.code contains the API error code.

- [#3156](https://github.com/phaseoteam/Phaseo/pull/3156) [`d299801`](https://github.com/phaseoteam/Phaseo/commit/d2998010acffdc89c04d17b963eaad58c9ae2292) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Settings → Slack, behind the `slack_agent` Statsig gate: install the Slack agent with a model, who can use it, its plan and limits, or with a company's own Slack app; then change its settings, pause or resume it, see this month's people, answers and estimated charge, review past charges and uninstall it. Add the `/slack/link` page that connects a Slack account to a Phaseo account after a click. Label the agent's month-end charge as "Slack agent" in billing transactions, and let installs set the hourly answer limit, guests and Slack Connect people.

- [#2903](https://github.com/phaseoteam/Phaseo/pull/2903) [`25bc968`](https://github.com/phaseoteam/Phaseo/commit/25bc968c9b92e88772f8cd860ece350936532acd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Separate subscription plans from billing offers, price components, feature access, and usage allowances. Preserve historical catalogue data and display custom, seat-based, composite, and phased prices accurately.

- [#2900](https://github.com/phaseoteam/Phaseo/pull/2900) [`682cef2`](https://github.com/phaseoteam/Phaseo/commit/682cef2b431fb36b7f88c6256a50645add5b2671) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forecast this month on the usage overview. Every KPI card gains a this-month line: Spend, Requests and Tokens show where the month is heading, and the rate cards show the month so far. Each line uses the exact daily rollup. Also, "Usage by model" gains a This month view with cumulative spend, the projection and last month's total, all from the exact daily rollup. Spend, request and token deltas are now neutral, with green and red kept for metrics where the direction is good or bad. Chart cursors and the sparkline hover dot use valid theme colours.

- [#3095](https://github.com/phaseoteam/Phaseo/pull/3095) [`7745ca6`](https://github.com/phaseoteam/Phaseo/commit/7745ca661168dfe21b1af86ce980a4d4ed4d5abd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a Budgets settings page (`/settings/budgets`). Owners and admins can set, change and delete the workspace's daily, weekly, monthly and lifetime budgets; everyone in the workspace can see each budget's spend so far, percent used, reset time and a projection for the period. Usage comes from the same SQL function the gateway enforces with. Writes use the control API's validation (now shared through `packages/shared/workspace-budgets`), are audit-logged with the same actions, and invalidate the gateway's cached workspace context.

- [#2899](https://github.com/phaseoteam/Phaseo/pull/2899) [`b197a50`](https://github.com/phaseoteam/Phaseo/commit/b197a502917be01c28c7f4a1e4efea586509367f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add retired model routing settings to the workspace routing page: turn routing to replacement models on, choose whether a more expensive replacement may be used, and set your own replacement for a model or never redirect it. Workspace replacements need no admin approval and are used whatever they cost, but still wait for the 72-hour grace period and never turn a free model into a paid one.

### Patch Changes

- [#3027](https://github.com/phaseoteam/Phaseo/pull/3027) [`cb4392b`](https://github.com/phaseoteam/Phaseo/commit/cb4392b9eea116b1b4ce232e77980828fc36cfbc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Rebuild the Artificial Analysis workspace with scrolling chart sections, grouped configuration ranges on mobile, shared chart settings, model groups and PNG export. Improve chart inspection with configuration pinning, crosshairs, keyboard controls, usable source links and expandable mobile configuration rows. Keep cost charts readable with collision-aware labels, compact currency formatting and correctly sized hover readouts.

- [#3027](https://github.com/phaseoteam/Phaseo/pull/3027) [`cb4392b`](https://github.com/phaseoteam/Phaseo/commit/cb4392b9eea116b1b4ce232e77980828fc36cfbc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make Artificial Analysis a focused chart explorer with direct model labels, shareable chart views and a responsive model selector.

- [#2917](https://github.com/phaseoteam/Phaseo/pull/2917) [`06959a1`](https://github.com/phaseoteam/Phaseo/commit/06959a1b62f373d3e53652b6a516aa1d5b721051) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the official Abliteration AI logo to the shared logo manifest.

- [#3204](https://github.com/phaseoteam/Phaseo/pull/3204) [`d099a33`](https://github.com/phaseoteam/Phaseo/commit/d099a335e7d770a8e03ffa20753b0ba32492313e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the official dealign.ai logo to the shared logo manifest.

- [#2452](https://github.com/phaseoteam/Phaseo/pull/2452) [`9184c80`](https://github.com/phaseoteam/Phaseo/commit/9184c80f9c199fbf5cba5cb544db483996439eb4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add account-level preferences for formatting, interface density, code language, sign-in landing page, sensitive-data masking, and coordinated light and dark themes.

- [#2772](https://github.com/phaseoteam/Phaseo/pull/2772) [`c286977`](https://github.com/phaseoteam/Phaseo/commit/c28697705d03cd2967958c86014ab6ae98d5a912) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Display the EmpirioLabs AI symbol in provider logos.

- [#2867](https://github.com/phaseoteam/Phaseo/pull/2867) [`6076d32`](https://github.com/phaseoteam/Phaseo/commit/6076d32d3b532e1bab412fbc80079aeafe184591) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add OCR, Document parsing and Translation groups to the models page filters, with their own colours and icons, so models with those capabilities are no longer only reachable through Text.

- [#2726](https://github.com/phaseoteam/Phaseo/pull/2726) [`9fb907c`](https://github.com/phaseoteam/Phaseo/commit/9fb907c20815756142e94df98abd2203ce49846e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add transparent Reflection logo assets for light and dark themes to the shared logo catalogue.

- [#2425](https://github.com/phaseoteam/Phaseo/pull/2425) [`9b68ad3`](https://github.com/phaseoteam/Phaseo/commit/9b68ad32bbad415bd591c01d2d46841fe43119d3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add TypeSafe Jev structured Decisions support through the `/v1/decisions` gateway endpoint, generated SDK operations, catalog pricing, and a dedicated Decisions playground.

- [#2425](https://github.com/phaseoteam/Phaseo/pull/2425) [`9b68ad3`](https://github.com/phaseoteam/Phaseo/commit/9b68ad32bbad415bd591c01d2d46841fe43119d3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add TypeSafe Jev 1.13 to the Decisions capability with the public `/v1/decisions` route, per-million-token pricing, a dedicated Decisions playground, and provider model discovery.

- [#2816](https://github.com/phaseoteam/Phaseo/pull/2816) [`8d6afb2`](https://github.com/phaseoteam/Phaseo/commit/8d6afb20839dbb48346c9d8b5175b137de81f367) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Speed up admin page loads. A new lightweight hidden-models endpoint replaces the full model audit source on `/chat`, `/models`, and the header search. The admin chat model list now loads in a single batched request instead of one request per hidden model.

- [#2804](https://github.com/phaseoteam/Phaseo/pull/2804) [`a56eba0`](https://github.com/phaseoteam/Phaseo/commit/a56eba0b83cfe69bd207edc56ee567224734c3a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show eligible internal text models in the admin chat picker and enable their Chat action.

- [#2799](https://github.com/phaseoteam/Phaseo/pull/2799) [`3a75c6e`](https://github.com/phaseoteam/Phaseo/commit/3a75c6e25135c41565350b9e861610aed154df2c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show internal models in the authenticated admin catalogue with the standard overview layout while preserving public exclusions.

- [#3119](https://github.com/phaseoteam/Phaseo/pull/3119) [`9e5d16e`](https://github.com/phaseoteam/Phaseo/commit/9e5d16ea604b002b482eeed8418bd5a2ce1e7e99) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Anthropic SDK examples on model pages, the playground, the migration guide, the landing page and the Anthropic SDK and migration docs now pass the Phaseo key as `authToken` (`auth_token` in Python), which sends `Authorization: Bearer` on every SDK version, and use the root host `https://api.phaseo.app` so the SDK calls `/v1/messages` instead of `/v1/v1/messages`.

- [#3121](https://github.com/phaseoteam/Phaseo/pull/3121) [`50d6d80`](https://github.com/phaseoteam/Phaseo/commit/50d6d80452456e21af4fcfcf6e0914e913abcbd7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Baseten Elephant-1 and Mammoth-1 support through the Decisions IR and register the official Base Labs logo.

- [#3138](https://github.com/phaseoteam/Phaseo/pull/3138) [`669b4e0`](https://github.com/phaseoteam/Phaseo/commit/669b4e08494efe7a92e43e399cd230f47f42478b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use the official Base Labs square icon instead of its wordmark in lab and model listings.

- [#2749](https://github.com/phaseoteam/Phaseo/pull/2749) [`cc95012`](https://github.com/phaseoteam/Phaseo/commit/cc950122a5808b68707aa1db2f1ebc2f90963f48) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Load translated configuration labels in rankings and model benchmark charts and tooltips.

- [#2469](https://github.com/phaseoteam/Phaseo/pull/2469) [`f7ef5bd`](https://github.com/phaseoteam/Phaseo/commit/f7ef5bdf7328e5ee44ac06d67801c5bb316fb93f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expand chat request samples with cURL, every supported client and Agent SDK language, text API shape switching, and optional code wrapping.

- [#2989](https://github.com/phaseoteam/Phaseo/pull/2989) [`0d2651b`](https://github.com/phaseoteam/Phaseo/commit/0d2651b917839590428f28b22ea2681e73cee292) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make Artificial Analysis comparisons chart-led, with model and reasoning filters, matched evaluation cost data, and branded search results.

- [#2503](https://github.com/phaseoteam/Phaseo/pull/2503) [`280687b`](https://github.com/phaseoteam/Phaseo/commit/280687b57f92c63322f2765c197dbd82303e2330) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep chat reasoning choices compatible with model capabilities and expose the `instant` effort only in generated OpenAI-compatible request types.

- [#2701](https://github.com/phaseoteam/Phaseo/pull/2701) [`4ade024`](https://github.com/phaseoteam/Phaseo/commit/4ade024f61bf8dcc36f47582d7f6f8f37b1cc68b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce shared translation payloads by rendering footer copy on the server and loading chat accessibility labels within chat routes.

- [#2649](https://github.com/phaseoteam/Phaseo/pull/2649) [`7b30ce4`](https://github.com/phaseoteam/Phaseo/commit/7b30ce4acc2dc4fe874d9fef91b95a91531b17df) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Register public model announcement runs before writing state, and show character-based provider prices per 1K characters.

- [#2624](https://github.com/phaseoteam/Phaseo/pull/2624) [`a134fa5`](https://github.com/phaseoteam/Phaseo/commit/a134fa542da6cb529b1827aa84a85d88a31d2edf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Ultrafast tier to gateway routing and the OpenAPI SDKs, and display it with a distinct badge in model and provider pricing.

- [#2870](https://github.com/phaseoteam/Phaseo/pull/2870) [`5e22d10`](https://github.com/phaseoteam/Phaseo/commit/5e22d1063438d97d55b107ae665f045733e2f8a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Share one Broadcast destination registry across the gateway, the dashboard API and the dashboard, so every part agrees on which destinations exist and which endpoint an OTLP destination sends to. OTLP destinations configured with only `url` are now rejected at creation, because the exporter never read that field. A workspace can have up to 5 destinations of each type, enforced in the database; operators can raise this per workspace.

- [#3194](https://github.com/phaseoteam/Phaseo/pull/3194) [`a54d910`](https://github.com/phaseoteam/Phaseo/commit/a54d910c70c8559d815ae1ef29431c6dcf1e4024) Thanks [@DanielButler1](https://github.com/DanielButler1)! - The Broadcast settings form reads correctly in Arabic, Chinese, French, German, Hindi, Japanese, Portuguese and Spanish: labels that were mistranslated, such as "Request Context" as a verb or the sampling "Rate" as speed, now say what they mean.

- [#2681](https://github.com/phaseoteam/Phaseo/pull/2681) [`5f51f0c`](https://github.com/phaseoteam/Phaseo/commit/5f51f0cc0525c3ec1c64aa2bf7151b2fefe9fb92) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Launch full-site localization across ten public locales, including locale-aware
  App Router pages, translated product and settings catalogs, localized help
  content, canonical and hreflang metadata, RTL/script font support, locale-safe
  auth hand-offs, a flagged footer language switcher, typed ICU validation, and
  the self-hosted Weblate operating foundation.

- [#2477](https://github.com/phaseoteam/Phaseo/pull/2477) [`3ec3df2`](https://github.com/phaseoteam/Phaseo/commit/3ec3df2bd9af751a12bf89ac6bf1289a7a94f9b8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use shadcn scroll areas throughout request samples, keep managed gateway tools available in Agent SDK examples, and generate multi-turn starters from the latest user message.

- [#2754](https://github.com/phaseoteam/Phaseo/pull/2754) [`8b8672d`](https://github.com/phaseoteam/Phaseo/commit/8b8672d10f8abf4d91ce6d8617ba14e22c3ac054) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve Cloudflare public cache reuse while disabling the Next.js data cache, and retain warm public responses across Worker deployments.

- [#2495](https://github.com/phaseoteam/Phaseo/pull/2495) [`a3eae2f`](https://github.com/phaseoteam/Phaseo/commit/a3eae2f256293c3373ae5a9e02f350416ae77853) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Match Decisions user message bubbles to Text Chat's dark accent styling.

- [#2670](https://github.com/phaseoteam/Phaseo/pull/2670) [`a29d6a5`](https://github.com/phaseoteam/Phaseo/commit/a29d6a5197e9069f44aabc9ac23311363a4ebad1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Derive chat service-tier options from active text-generation pricing SKUs and support Ultrafast requests. Exclude unpublished and expired offers while preserving Standard catalog prices. Preserve the user's selected tier and reject unavailable selections instead of automatically switching tiers.

- [#2468](https://github.com/phaseoteam/Phaseo/pull/2468) [`f057991`](https://github.com/phaseoteam/Phaseo/commit/f0579917c407ee9b32d77a63a94c15be45d6b6a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redesign chat request samples with SDK and Agent SDK integrations, language logos, and Shiki syntax highlighting.

- [#3056](https://github.com/phaseoteam/Phaseo/pull/3056) [`7e5c957`](https://github.com/phaseoteam/Phaseo/commit/7e5c957e44e4b7b5e07a3e9fbc689228c32273a3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show the Lucide text-selection icon for extraction models and endpoint filters.

- [#2661](https://github.com/phaseoteam/Phaseo/pull/2661) [`7b0fda6`](https://github.com/phaseoteam/Phaseo/commit/7b0fda68256f68666d996067f120cf250f89a3e4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show provider meter prices directly in the Pricing section without a conditional Usage rates heading.

- [#2441](https://github.com/phaseoteam/Phaseo/pull/2441) [`68c6ead`](https://github.com/phaseoteam/Phaseo/commit/68c6ead05d9c63af160d214f34bfaf32917ddbef) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore compact benchmark rank labels while retaining configuration-based rankings, and remove the dimmed-model chart caption.

- [#2830](https://github.com/phaseoteam/Phaseo/pull/2830) [`3d8bc30`](https://github.com/phaseoteam/Phaseo/commit/3d8bc30db86f0b30b780c18c2c6a0a0351ac4ac4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Send only the twelve displayed neighbouring models to inline Epoch charts while preserving ranks, confidence intervals and the full leaderboard page.

- [#3202](https://github.com/phaseoteam/Phaseo/pull/3202) [`97a7b38`](https://github.com/phaseoteam/Phaseo/commit/97a7b3895a192992613baf34fab3b9ff7872c168) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Compare page Activity tooltips say "1 request" instead of "1 requests".

- [#3090](https://github.com/phaseoteam/Phaseo/pull/3090) [`bb0aea7`](https://github.com/phaseoteam/Phaseo/commit/bb0aea7f0e2696923147d48a91e37ae1c3320d31) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix the compare page's headline prices and dropdowns. Input and output prices now come from standard-tier text-token rates, on routes Phaseo serves when there are any. They no longer pick up a provider's $0 image or reasoning rows, batch discounts, or other listings' discounted rows. The provider and service-tier dropdowns show display names ("Amazon Bedrock", "Standard") instead of raw ids, and a model without priced providers no longer shows "__none__". Four models fit on desktop without clipping the last column. The empty Subscription plans heading and the always-unknown Capabilities row are hidden, plan cards no longer overflow their column, and Performance "View charts" opens the model's performance section. Model page titles no longer say "Compare 1 Providers".

- [#2679](https://github.com/phaseoteam/Phaseo/pull/2679) [`a0a6d2c`](https://github.com/phaseoteam/Phaseo/commit/a0a6d2c93ad42101bb374be3c7c524e07ec3609f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use shared rounded-down compact token counts across public Rankings lists, tooltips, summaries, and gateway landing-page showcases.

- [#2931](https://github.com/phaseoteam/Phaseo/pull/2931) [`a4b50a1`](https://github.com/phaseoteam/Phaseo/commit/a4b50a17eef63b8df7fab38ddae2e2d906e7fe37) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update the Weights & Biases inference provider logo and label to CoreWeave Forge while preserving existing provider IDs and the separate W&B Weave destination branding.

- [#2751](https://github.com/phaseoteam/Phaseo/pull/2751) [`52349ec`](https://github.com/phaseoteam/Phaseo/commit/52349ecd8354e65979dfbf9440d0e0df89553a03) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show the selected model in Decisions playground copy and response image labels.

- [#2828](https://github.com/phaseoteam/Phaseo/pull/2828) [`057390d`](https://github.com/phaseoteam/Phaseo/commit/057390d201bb8047b2c613b47bf65a16859000f8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Deduplicate repeated anonymous public API reads within one server render while preserving timeouts, explicit cancellation and Cloudflare freshness.

- [#2711](https://github.com/phaseoteam/Phaseo/pull/2711) [`2a84658`](https://github.com/phaseoteam/Phaseo/commit/2a84658993c7477296c1ac4461d59044d3c732dc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update vulnerable runtime and tooling dependencies to patched releases, including Hono, Electron, Jackson, Guzzle, and shared dependency overrides.

- [#2732](https://github.com/phaseoteam/Phaseo/pull/2732) [`8f9c748`](https://github.com/phaseoteam/Phaseo/commit/8f9c7489605712f075956fd25294fb9debbbb8d3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Allow the registered first-party desktop client's temporary loopback port on the OAuth consent page and decline action, matching gateway callback validation.

- [#2526](https://github.com/phaseoteam/Phaseo/pull/2526) [`79f440d`](https://github.com/phaseoteam/Phaseo/commit/79f440db769f6a8f1a7e057a89bc5490f482f8f1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Include documentation pages in global search and prioritize models in the default search view.

- [#2752](https://github.com/phaseoteam/Phaseo/pull/2752) [`9945702`](https://github.com/phaseoteam/Phaseo/commit/9945702b320a9661e8bab97bad4963bed7e6a245) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Include models with the Decisions capability in the Decisions filter alongside their regular output modalities.

- [#2744](https://github.com/phaseoteam/Phaseo/pull/2744) [`5cc4d2f`](https://github.com/phaseoteam/Phaseo/commit/5cc4d2faa1440b62f07a6c5774f44adc1a066d62) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show Text generation and Decisions capabilities together on one model card and table row. Preserve both playground actions and API quickstarts, and display operation-specific pricing without mixing Decisions rates into chat summaries.

- [#3074](https://github.com/phaseoteam/Phaseo/pull/3074) [`b4821aa`](https://github.com/phaseoteam/Phaseo/commit/b4821aa906a086f176164388c4af366b94e93d01) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an Epoch capability workspace with confidence-range comparisons, release timelines, domain views, shared model controls, pinned inspection and exportable rankings.
  
  Show Epoch branding in search and support ECI and Epoch search aliases.

- [#2937](https://github.com/phaseoteam/Phaseo/pull/2937) [`caefa98`](https://github.com/phaseoteam/Phaseo/commit/caefa98e5e02a80b6bd0cafd343712024fd7d530) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Apply verified route retention consistently in gateway routing, guardrail previews, model pricing, and provider hovers.

- [#2975](https://github.com/phaseoteam/Phaseo/pull/2975) [`ae3352a`](https://github.com/phaseoteam/Phaseo/commit/ae3352a1497c41d85265c9493394fcebe3147377) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Place the expanded model description's collapse button underneath the text, aligned to the right.

- [#3045](https://github.com/phaseoteam/Phaseo/pull/3045) [`debbbf8`](https://github.com/phaseoteam/Phaseo/commit/debbbf851bb068da14027e9b5f1dc9f28908bf22) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Set `partialPrefetching: false` explicitly, so Next.js 16.4 stops warning about it and a future default change can't turn Partial Prefetching back on.

- [#2972](https://github.com/phaseoteam/Phaseo/pull/2972) [`d2bc153`](https://github.com/phaseoteam/Phaseo/commit/d2bc1534b19193dbb8dac01572f4694264fd6af5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show Fastino's current light and dark logos for the provider formerly branded Pioneer.

- [#2437](https://github.com/phaseoteam/Phaseo/pull/2437) [`0b61259`](https://github.com/phaseoteam/Phaseo/commit/0b61259027ba52417bbe15d48280b078d6ca6c70) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep a model's own benchmark result visible when the comparison leaderboard is stale, rank individual configurations consistently with the chart, and ignore sentence punctuation when matching Artificial Analysis index versions.

- [#2512](https://github.com/phaseoteam/Phaseo/pull/2512) [`20b0bde`](https://github.com/phaseoteam/Phaseo/commit/20b0bde99c35b85291b4dfb4567639f917d3ec06) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Render supported reasoning efforts as a dropdown and keep service tier directly below provider in chat model settings.

- [#2458](https://github.com/phaseoteam/Phaseo/pull/2458) [`650c501`](https://github.com/phaseoteam/Phaseo/commit/650c5017cbe98402f706fd11ee0fcd588941c535) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the Decisions room with the Text chat experience by adding automatic message scrolling, inline prompt editing, Enter-to-send behavior, compact idle composition, cleared structured inputs after send, and clearer Noul and Score result displays.

- [#2934](https://github.com/phaseoteam/Phaseo/pull/2934) [`4daeab3`](https://github.com/phaseoteam/Phaseo/commit/4daeab33bb0e4089f2a4478f84b7bcd9a72105cb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix the lifecycle alerts page crashing when a workspace has deprecation warnings, and tidy the model retirement banner: it is centred with its dismiss button pinned to the right edge, wraps cleanly, says models are being retired, and names the model that retires first so a red (critical) banner explains itself; a critical warning with no retirement date stays amber. The alerts page drops the time range and refresh controls, which had no effect on its data, keeps every model you use visible, and collapses only models you don't use behind a chevron. Lifecycle warnings are only critical when a retirement date is within 7 days; a deprecation date alone tops out at warning.

- [#2760](https://github.com/phaseoteam/Phaseo/pull/2760) [`85307c1`](https://github.com/phaseoteam/Phaseo/commit/85307c14daea07efb75ee9738deb03bba5a42ff8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve Discord delivery records across model watcher failures, monitor Mistral API pricing tables, and restore fallback model OG images in public notifications.

- [#2861](https://github.com/phaseoteam/Phaseo/pull/2861) [`2b77a4d`](https://github.com/phaseoteam/Phaseo/commit/2b77a4dbbf6a11833a28ae1fd7b0327d784ccdf3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - English API reference pages show English descriptions again instead of Arabic, and the "Get API Key" buttons and quickstart links open the API keys page instead of a 404. Translated docs pages that had dropped sections, stale code examples, broken formatting, or untranslated English now match the English pages, and the Hindi docs read as Hindi rather than a mix of Hindi and English.

- [#2682](https://github.com/phaseoteam/Phaseo/pull/2682) [`9d1e0f7`](https://github.com/phaseoteam/Phaseo/commit/9d1e0f7a639067d425b80f95ebc2f7d355a28941) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve migration assistant mobile spacing and use sentence-case step labels.

- [#2868](https://github.com/phaseoteam/Phaseo/pull/2868) [`e7391d5`](https://github.com/phaseoteam/Phaseo/commit/e7391d5d1d06fc73a590f7503d0f7262afd7364e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix model deprecation alerts, which never matched a workspace. A workspace that turned them on now gets one notice per model, as soon as a model it called in the last 30 days is marked deprecated or retiring, counted by the model it requested rather than the one that served it. The owner is emailed and the workspace's routed destinations are notified; a new setting also emails admins. The usage page's deprecation warnings use the same lookup.

- [#2728](https://github.com/phaseoteam/Phaseo/pull/2728) [`3099515`](https://github.com/phaseoteam/Phaseo/commit/30995154f014b03f5e73725a9a2f8c1b0116e413) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Include saved model specifications in public model overviews and preserve limited-access lifecycle labels.

- [#2518](https://github.com/phaseoteam/Phaseo/pull/2518) [`28f1710`](https://github.com/phaseoteam/Phaseo/commit/28f1710320c394daef3b9133fe102ab9c7a05c94) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix model settings reasoning and service-tier selectors so supported values are displayed in the correct format and selecting a reasoning effort enables reasoning.

- [#2729](https://github.com/phaseoteam/Phaseo/pull/2729) [`2b5556d`](https://github.com/phaseoteam/Phaseo/commit/2b5556d211cd4b0779a2fd169a86a237b964977c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Format model specifications compactly and keep metadata grid styling consistent when fields wrap.

- [#3077](https://github.com/phaseoteam/Phaseo/pull/3077) [`cbf608c`](https://github.com/phaseoteam/Phaseo/commit/cbf608c55f39b3fd705d3abd5b961bc811e9e6b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Group cache-write pricing by lifetime, with short and long context prices inside each group, including OpenAI's 30-minute and 12-hour rates.

- [#2685](https://github.com/phaseoteam/Phaseo/pull/2685) [`b56f720`](https://github.com/phaseoteam/Phaseo/commit/b56f720a8b1b587052c641f57b186cc0288afc6a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bound public catalogue requests and allow sitemap generation to fetch model metadata without gateway monitor enrichment, preventing stalled upstream requests from exhausting the prerender cache deadline.
  
  Pass the locale direction to Base UI so Arabic ShadCN components use RTL interaction behavior.

- [#2737](https://github.com/phaseoteam/Phaseo/pull/2737) [`72b0f9d`](https://github.com/phaseoteam/Phaseo/commit/72b0f9d74c3c158df21d608522c1f924563fad4e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce database work in public model performance, token trajectory and monitor lookups, and bound scheduled metadata cleanup.

- [#2420](https://github.com/phaseoteam/Phaseo/pull/2420) [`96cd1e5`](https://github.com/phaseoteam/Phaseo/commit/96cd1e559c1eb895488f393d6e820bb6db71332e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make public OG cards resolve only canonical, publicly visible catalog records, fail fast when the data service is unavailable, and retain successful payloads and rendered images through shared-cache revalidation.

- [#2719](https://github.com/phaseoteam/Phaseo/pull/2719) [`620e548`](https://github.com/phaseoteam/Phaseo/commit/620e548bab244b14b59549e0182441f804f36e0d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Compare model, app and market-share totals over exact rolling periods, include partial-day usage without counting it twice, and calculate chart totals from all models. Align weekly chart buckets with UTC to remove phantom gaps.

- [#2439](https://github.com/phaseoteam/Phaseo/pull/2439) [`6750211`](https://github.com/phaseoteam/Phaseo/commit/675021141b68dc7d47b8218a6b58ca92d664c4fc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Connect modality rankings to recorded usage, persist missing workload meters, repair public meter aliases and backend retention access, and show retryable errors when ranking data cannot be loaded.

- [#2833](https://github.com/phaseoteam/Phaseo/pull/2833) [`92c7660`](https://github.com/phaseoteam/Phaseo/commit/92c7660e2da1898f8df3dee1e8ebb324b8459415) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix model pages for rumoured models never finishing. Their status banner passed a Discord link callback for a plain `{discord}` placeholder, so the render errored and the response stayed open until the 300 second function limit. Every locale now uses a `<discord>` tag.
  
  A new test checks that each rich text tag callback has a matching tag in every locale. It also found and fixed:
  
  - the compare page licence, knowledge cutoff, release date and context window sentences, which had lost their model names and links;
  - the free router ID, which had lost its monospace style;
  - the Spanish terms, which had lost the operator's emphasis;
  - an unused code callback in provider onboarding.

- [#2703](https://github.com/phaseoteam/Phaseo/pull/2703) [`4e741f6`](https://github.com/phaseoteam/Phaseo/commit/4e741f66202d72c344edb6c04376ace391fee118) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redirect workspace self-profile links to account settings using the authenticated server session.

- [#2823](https://github.com/phaseoteam/Phaseo/pull/2823) [`fc8e0aa`](https://github.com/phaseoteam/Phaseo/commit/fc8e0aab40227950e71826818a235c802b5d797b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Classify model groups using supported capabilities as well as output modalities, so transcription, speech, realtime, music, embeddings, reranking, moderation, image, video, and text models remain discoverable when output metadata differs or is missing.

- [#2901](https://github.com/phaseoteam/Phaseo/pull/2901) [`40e0a1b`](https://github.com/phaseoteam/Phaseo/commit/40e0a1bbc228d41c6b6cf12cf6ef551954f851a6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Repair corrupted and mistranslated settings text in Arabic, Japanese, Portuguese, Spanish, Chinese and Hindi, and use one set of terms across the Hindi web app and docs. Spanish and German now address the reader informally throughout (tú, du), and Chinese uses 你, matching the docs. The translated help centre now describes Stripe receipts, as the English does, and its settings paths use the menu names each language shows. Provider catalog errors that fell back to a generic message now show their real reason. The OAuth app delete dialog and the management key notice read correctly in every language, and the C# Agent SDK quickstart uses the right namespace. `validate:i18n` now rejects HTML entities, Latin-script words that are not in the English source, Simplified Chinese characters in Japanese, and German Sie or Chinese 您.

- [#2453](https://github.com/phaseoteam/Phaseo/pull/2453) [`a4974fa`](https://github.com/phaseoteam/Phaseo/commit/a4974fa70c42b1e1bfadd01f28ba7295b4de1866) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Flatten the model playground header and link response request IDs to their request-log details from message metadata.

- [#3022](https://github.com/phaseoteam/Phaseo/pull/3022) [`f5db7a3`](https://github.com/phaseoteam/Phaseo/commit/f5db7a394bbf3a18344a46a15c9e2e167c94e8c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Serve US English visitors the main English pages. `/en-US/` URLs now redirect permanently to the same page without the prefix, and English (US) leaves the language menu. It differed only in spelling, while crawlers rendered every English page twice.

- [#2675](https://github.com/phaseoteam/Phaseo/pull/2675) [`bc642ed`](https://github.com/phaseoteam/Phaseo/commit/bc642ed06d08717b4c82c900c8f333339c2f2fc7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Start a new conversation when opening Chat from a model link, preserving existing chat history.

- [#3218](https://github.com/phaseoteam/Phaseo/pull/3218) [`d8938ed`](https://github.com/phaseoteam/Phaseo/commit/d8938ed0ee5c56bb1feca34cdad7db5f6bfa4e57) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show the Moonshot logo for Kimi models in Artificial Analysis charts.

- [#2487](https://github.com/phaseoteam/Phaseo/pull/2487) [`4fa216c`](https://github.com/phaseoteam/Phaseo/commit/4fa216c81c1fad3c988907e49872da0da5f78d6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Allow Chat Completions and Messages code samples to retain managed gateway tools.

- [#3023](https://github.com/phaseoteam/Phaseo/pull/3023) [`7c781c7`](https://github.com/phaseoteam/Phaseo/commit/7c781c7b8dc52f25bab217f59d7a7a69198ca07e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Let model descriptions fill the available page width while preserving expansion controls.

- [#3055](https://github.com/phaseoteam/Phaseo/pull/3055) [`d6c8e94`](https://github.com/phaseoteam/Phaseo/commit/d6c8e94e149c3065fec766ab1043bd970e88ee28) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Error responses now return `error` as an object with `code`, `message` and `type` (plus `param` when the gateway knows which request field failed, and `metadata` with structured detail such as the failing provider, the reason or `retry_after_seconds`), so OpenAI-compatible SDKs surface the gateway's message instead of a generic error. `type` follows OpenAI's documented error types: `invalid_request_error`, `authentication_error`, `insufficient_quota`, `permission_error`, `not_found_error`, `rate_limit_error`, `server_error`, `service_unavailable` (503) or `overloaded` (529). On an error response it is set from the HTTP status; on a Chat Completions mid-stream `error` frame, which has no status of its own, it is derived from the error code. Every existing top-level field is still returned, and the code string that `error` used to hold is also returned as top-level `code`. `/v1/messages` errors use the same body, and Chat Completions mid-stream `error` frames carry the same object. Batch, file and async-job errors that already returned an `error` object get the full shape too: the code they held in `error.type` moves to `error.code` and top-level `code`, `error.type` becomes the error type, and their other fields such as `reason` and `batch_id` stay. The web playground and request logs read both shapes.

- [#2846](https://github.com/phaseoteam/Phaseo/pull/2846) [`d991243`](https://github.com/phaseoteam/Phaseo/commit/d9912432aeb4a9fbf3ae4b6553649cd90d8cb41f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use generic social metadata without preview images for unavailable and non-public model pages.

- [#2741](https://github.com/phaseoteam/Phaseo/pull/2741) [`723f0bb`](https://github.com/phaseoteam/Phaseo/commit/723f0bbe31003f047576ed1b77567ff79ec76f78) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Combine matching input token prices in provider comparison tables while preserving distinct output, cache and usage prices.

- [#2759](https://github.com/phaseoteam/Phaseo/pull/2759) [`be1fd69`](https://github.com/phaseoteam/Phaseo/commit/be1fd691d579607365f0b8f8b706928859398413) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show prompt-length tiers alongside cache-write TTL pricing labels.

- [#2866](https://github.com/phaseoteam/Phaseo/pull/2866) [`d554346`](https://github.com/phaseoteam/Phaseo/commit/d5543463264320b88ccb31e6352b435a74ef5281) Thanks [@DanielButler1](https://github.com/DanielButler1)! - The guardrail editor no longer shows the Budget Policies section. Guardrail request and spend limits were saved but never enforced, so they are hidden until per-key, member and department rate limits replace them. Saving a guardrail keeps any values it already has. The guardrail API reference and cookbook now say that the `budgets` field has no effect and point to API key limits and workspace budgets instead.

- [#2854](https://github.com/phaseoteam/Phaseo/pull/2854) [`204b757`](https://github.com/phaseoteam/Phaseo/commit/204b757f54510deebf4d6d40d732906223e9f483) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hover cards open on tap on touch screens, like a popover: tap the trigger to open or close the card, or tap elsewhere to close it. Mouse hover and click are unchanged.

- [#2767](https://github.com/phaseoteam/Phaseo/pull/2767) [`f489c72`](https://github.com/phaseoteam/Phaseo/commit/f489c728da9aca247d4f204fc2b3ae76d49aa0c9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Scramble personal data before blurring across account, profile, and billing settings, preserve input field styling, and keep payment selectors free of nested reveal buttons.

- [#2697](https://github.com/phaseoteam/Phaseo/pull/2697) [`44be7f0`](https://github.com/phaseoteam/Phaseo/commit/44be7f0dd8deb68678a89822e8132f0e74eac627) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show monitoring recovery progress and incident updates in the footer status indicator while preserving reported service impact.

- [#2778](https://github.com/phaseoteam/Phaseo/pull/2778) [`58aaefd`](https://github.com/phaseoteam/Phaseo/commit/58aaefd9f1b23549f7c6c957b0dc881a4d900141) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an opt-in Interactive answers experiment in the chat header, with comparison cards, tables, charts, and follow-up forms whose values persist per response variant.

- [#2812](https://github.com/phaseoteam/Phaseo/pull/2812) [`efb6467`](https://github.com/phaseoteam/Phaseo/commit/efb64679dd9df76a284076f10102b85c730fe59e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Group administrator-only internal chat models in a collapsible picker section and preserve the selected route's pricing scope during execution.

- [#3103](https://github.com/phaseoteam/Phaseo/pull/3103) [`bdeced4`](https://github.com/phaseoteam/Phaseo/commit/bdeced4aab7626f5001373d9e8521e298f273b6e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a workspace setting for who can view stored request and response contents: all members (the default) or only owners and admins. It applies to request details, Chat and the generations API, where API keys act with their creator's role.

- [#3081](https://github.com/phaseoteam/Phaseo/pull/3081) [`4c6ada8`](https://github.com/phaseoteam/Phaseo/commit/4c6ada804363945798f911a738858e86da78235b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Never store request or response bodies in Gateway I/O logs for zero data retention workspaces, or for requests whose API key guardrail requires zero data retention. The privacy settings page shows the I/O log switch as off while ZDR endpoints only is on. Streamed Chat Completions now record the whole assistant message (text, reasoning and tool calls) in the I/O log, request classifiers and trace exports when the stream ends without a full final snapshot, rather than only the last chunk.

- [#3178](https://github.com/phaseoteam/Phaseo/pull/3178) [`b1be07c`](https://github.com/phaseoteam/Phaseo/commit/b1be07c738abfd7c44bf7d43c87bd61baf3f7363) Thanks [@DanielButler1](https://github.com/DanielButler1)! - When a workspace keeps I/O logs and zero data retention keeps a request's content out, the request log now says "Skipped: zero data retention is required" instead of a generic "no retained payload". This covers every source of ZDR: the workspace setting, a key guardrail, and the request itself, its preset or its routing. The gateway records the skip without any content, and the request sheet shows it in the reader's language. A key whose policy couldn't be read keeps its content out as before but doesn't claim ZDR as the reason.

- [#2904](https://github.com/phaseoteam/Phaseo/pull/2904) [`6388cf2`](https://github.com/phaseoteam/Phaseo/commit/6388cf2d0007240446fc5df8f705feeb2537d7c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add verified Java source-install guides, corrected JSON examples, streaming instructions, and language selection across the documentation and model quickstarts. Cover Java streaming and local HTTP behavior with deterministic tests, and add CMake build and test support for the C++ preview. Keep C++ out of the published SDK menu until its HTTP transport and streaming support are ready.
  
  Use tested Java HTTP multipart examples for file uploads, audio transcription and translation, and image edits until the SDK supports multipart encoding. Verify the documented requests against a local multipart parser in CI.

- [#2502](https://github.com/phaseoteam/Phaseo/pull/2502) [`13cc86a`](https://github.com/phaseoteam/Phaseo/commit/13cc86a7b5d05e2b1b901029466e60c592ad48ba) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep the Decisions composer expanded after edits and reveal newly added options in the bounded list.

- [#2698](https://github.com/phaseoteam/Phaseo/pull/2698) [`1ca9946`](https://github.com/phaseoteam/Phaseo/commit/1ca99467f06048ffb08461e572f5003acb1c4c54) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Apply account display preferences to key dates, usage summaries, chart axes and tooltips.

- [#2864](https://github.com/phaseoteam/Phaseo/pull/2864) [`6fde6ac`](https://github.com/phaseoteam/Phaseo/commit/6fde6aca0eb81aa5a68146d2d345a3c61bc44f14) Thanks [@DanielButler1](https://github.com/DanielButler1)! - API key request and spend limits and workspace budgets now send `Retry-After` with their `429`, set to the seconds until the limit's window resets. Limits that never reset by themselves, such as lifetime budgets and soft-blocked keys, still omit it. The rate limits page now lists the requests-per-minute allowance for each workspace standing instead of a single 25 requests per minute.

- [#2696](https://github.com/phaseoteam/Phaseo/pull/2696) [`cbb72d1`](https://github.com/phaseoteam/Phaseo/commit/cbb72d1f7581ab5604dc0bae767b0613018048ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve encoded key names through sign-in and avoid repeated redirects when key route parameters contain escaped characters.

- [#2694](https://github.com/phaseoteam/Phaseo/pull/2694) [`c3f0717`](https://github.com/phaseoteam/Phaseo/commit/c3f07178ad3e5f879187a046a91ff54be8ec0cec) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix key detail pages returning 404 when a key name ends in a static file extension, including OAuth client URLs.

- [#3184](https://github.com/phaseoteam/Phaseo/pull/3184) [`ec83825`](https://github.com/phaseoteam/Phaseo/commit/ec83825d38ee7b2577323fdecd0ffca68999a3c8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Key Security now sits under API Keys in the settings sidebar, next to the key list. On the page, filters sit directly above the key table with their counts, and a "Showing X of Y keys" line says which filter is on. Every column of the table sorts, and there are new Created and Status columns: Status shows whether a key is active, paused, idle, never used or safe to remove, and Risks shows the settings that make a leak worse, each with the same icon as its filter. "Where keys are stored" lists the top 5 platforms with a "Show all" button. Storage location logos are drawn in each platform's brand colour.

- [#3146](https://github.com/phaseoteam/Phaseo/pull/3146) [`48ba524`](https://github.com/phaseoteam/Phaseo/commit/48ba524d7d059e057b891a4b604d474479b2e0a5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Label filters: the spend card is now one plain line ("1 request · $0.000027 spent"), the chip reads "Department: legal", and Labels sit after Usage in the request sheet.

- [#3069](https://github.com/phaseoteam/Phaseo/pull/3069) [`862de5a`](https://github.com/phaseoteam/Phaseo/commit/862de5a68ec9c5d8acc14402fdf44a87a7907fb1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Cut server work on model, home and compare pages. Model pages fetch one model's benchmark ranks instead of every leaderboard, "other models" fetch ten models, the home page fetches six models' prices instead of the gateway catalogue, and compare pages load the picker's model list in the browser when it opens. Compare pages now find every model they can compare, not only the first 1,000.

- [#2948](https://github.com/phaseoteam/Phaseo/pull/2948) [`c0d9908`](https://github.com/phaseoteam/Phaseo/commit/c0d9908d1903224dcf3bbf446f46b217a29166e8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Lifecycle alerts section headings are bold, model cards use three columns on extra-large screens, and collapsed sections show six cards before "Show more" so rows stay full.

- [#3186](https://github.com/phaseoteam/Phaseo/pull/3186) [`609af48`](https://github.com/phaseoteam/Phaseo/commit/609af48acb8663d690f64f8fc384f33bf01cf89c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make country pages lighter to render. The models section shows the newest six models per organisation, with a "Show all" button that loads the rest; searching loads the full list. The US page rendered all 859 model cards (about 12 MB of HTML) on every request.

- [#3172](https://github.com/phaseoteam/Phaseo/pull/3172) [`92a182f`](https://github.com/phaseoteam/Phaseo/commit/92a182f8137ad1e21da194e7540093c94206000c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make model pages lighter to render. The pricing history, usage and effective-price series load in the browser from the web API instead of being embedded in every page. The provider table no longer embeds the hourly series that only its click-to-open inspector draws. The header's "Use this model" sheet gets only the identifiers, parameters and endpoints it reads. Subscription plans carry only the fields the section shows. Model pages no longer render the `/models` list skeleton.

- [#2724](https://github.com/phaseoteam/Phaseo/pull/2724) [`a668361`](https://github.com/phaseoteam/Phaseo/commit/a6683615ead077359fc84c45a9ae26e6d6a158cd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Render context length and country rankings at request time so unavailable placeholders are not frozen into the static page.

- [#2747](https://github.com/phaseoteam/Phaseo/pull/2747) [`505ef64`](https://github.com/phaseoteam/Phaseo/commit/505ef64fd6732ff493c40ee25abeb95932c21995) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep catalogue scroll controls and dashboard footer visibility consistent across locale rewrites during hydration.

- [#2681](https://github.com/phaseoteam/Phaseo/pull/2681) [`5f51f0c`](https://github.com/phaseoteam/Phaseo/commit/5f51f0cc0525c3ec1c64aa2bf7151b2fefe9fb92) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Complete and correct user-facing web translations across the supported locales.

- [#2835](https://github.com/phaseoteam/Phaseo/pull/2835) [`7f9e13b`](https://github.com/phaseoteam/Phaseo/commit/7f9e13b80d56ab8405e2809afe478e812f9a0489) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Apply robots.txt disallow rules to localized copies of private pages, such as `/de-DE/sign-up` and `/ja/settings`, and cover section roots such as `/settings` that have no trailing slash. Block Reflectionbot from the whole site.

- [#2820](https://github.com/phaseoteam/Phaseo/pull/2820) [`b4df870`](https://github.com/phaseoteam/Phaseo/commit/b4df870209334dfc0f23c8dfa3956d11b6afe969) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Render pages next to the London database. Web functions now run in `lhr1`, and the web API Worker uses Smart Placement. Each signed-in page now reads account and auth status once per request.

- [#2684](https://github.com/phaseoteam/Phaseo/pull/2684) [`b952403`](https://github.com/phaseoteam/Phaseo/commit/b952403ba791e43e909a5932dc652c8a4201b8ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Lower Enterprise pricing to $29/month for up to 100 workspace members and $79/month at 1,000 members. Allow smaller teams to subscribe, clarify membership-based allowances, and let Statsig control self-service rollout without an internal-admin restriction. Existing subscriptions and credit top-up fees remain unchanged.

- [#2839](https://github.com/phaseoteam/Phaseo/pull/2839) [`fa8cad7`](https://github.com/phaseoteam/Phaseo/commit/fa8cad7cc9d330c77aadb59919322a7379d5494a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show each priced variant of image and video models (resolution, audio, quality) in the model card hover card, grouped under the meter it applies to, and mark media prices that vary with "From".

- [#2715](https://github.com/phaseoteam/Phaseo/pull/2715) [`5817d16`](https://github.com/phaseoteam/Phaseo/commit/5817d16bf781795eb5a139a98a46bfe8f87924b6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore access to provider onboarding and provider settings from the mobile settings sheet.

- [#2831](https://github.com/phaseoteam/Phaseo/pull/2831) [`496010d`](https://github.com/phaseoteam/Phaseo/commit/496010dca89a06a301c9e691932ead98c3da56c9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show list prices with units on model card pricing pills. The catalogue API now sends a structured headline price that excludes cache, batch and pass-through meters, keeps the billed time unit, and covers every meter in the hover card. The card localises it as, for example, "$3 in · $15 out / 1M tokens", "From: $0.04 / image" or "Free".

- [#2922](https://github.com/phaseoteam/Phaseo/pull/2922) [`a7142c5`](https://github.com/phaseoteam/Phaseo/commit/a7142c5d5539550fe54f7545724974e62dce472f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve Markdown structure in model descriptions and improve their typography, reading width, and expand controls.

- [#3060](https://github.com/phaseoteam/Phaseo/pull/3060) [`d2fc208`](https://github.com/phaseoteam/Phaseo/commit/d2fc208eaad8a2b8d38714dbf2a4f3927bac62aa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add extraction Quickstart examples and restrict model Quickstarts to supported endpoints.

- [#2873](https://github.com/phaseoteam/Phaseo/pull/2873) [`701e89e`](https://github.com/phaseoteam/Phaseo/commit/701e89e05dea0a0d0f8fa3ec17b4d7e37064424b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Tidy the models page output filters. Audio now opens its own row in place (Speech, Transcription, Translation, Realtime, Music) and counts all of them, OCR and Document parsing are one Documents chip, the File chip is gone, and the chips follow a new order. The cards and table views share one chip row.

- [#2876](https://github.com/phaseoteam/Phaseo/pull/2876) [`5834108`](https://github.com/phaseoteam/Phaseo/commit/5834108885786ffb5c581ea192c080a58c1db15a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make the models page output chips respond instantly. The Audio row swap is now about 160 ms with no stagger or delay, and pressing a chip updates the row before the models list finishes re-filtering.

- [#2875](https://github.com/phaseoteam/Phaseo/pull/2875) [`6e9ff5a`](https://github.com/phaseoteam/Phaseo/commit/6e9ff5a526afc42914fced0c9615267afa2b6479) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hide the scrollbar under the models page audio row. The row stays scrollable if it is wider than the window.

- [#2916](https://github.com/phaseoteam/Phaseo/pull/2916) [`d6f8d0a`](https://github.com/phaseoteam/Phaseo/commit/d6f8d0a5be5eed5b92fe43faf30b7e5704145f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a weak `ETag` (`W/"…"`) to `GET /v1/models` JSON and OpenAI-format responses and answer a matching `If-None-Match` with a body-less `304`, which saves transfer and parsing when clients poll the model list. The `ETag` ignores `gateway_region`, which is why it is weak. Each model offer now lists the `service_tiers` its provider route accepts (`flex`, `priority`, `standard`, `ultrafast`), derived from the same executable pricing the gateway uses (current, USD, with a billable meter); prices stay standard-tier.

- [#3079](https://github.com/phaseoteam/Phaseo/pull/3079) [`83e6379`](https://github.com/phaseoteam/Phaseo/commit/83e6379e03c5de556910103f007998f233f29438) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Models licence filter: no dropdown for groups with a single licence, and licences with no matching models are hidden.

- [#3062](https://github.com/phaseoteam/Phaseo/pull/3062) [`70f223a`](https://github.com/phaseoteam/Phaseo/commit/70f223a377fe35d2b03f48de465f1a4dbc8c6639) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a License filter to the /models and /models/table pages. It offers Open and Closed groups, each expanding to the specific licences inside it. The catalogue payloads now carry each model's licence, normalised so spellings such as "Apache-2.0" and "Apache License 2.0" group under one option, and `:free` variants inherit their base model's licence.

- [#2853](https://github.com/phaseoteam/Phaseo/pull/2853) [`bf66214`](https://github.com/phaseoteam/Phaseo/commit/bf6621434157fb7e2683ae147c0138c67a8c3f75) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show every capability in the models table as a labelled badge with its icon, collapse endpoint aliases into one capability, and show one gateway status icon per status. The table projection now reports unlisted token prices as null and carries per-unit charges (per image, per second, per request, ...), so image, video and other non-token models show "From $X / unit" or "-" instead of a misleading $0.00, while listed $0 rates and free offers keep $0.

- [#3075](https://github.com/phaseoteam/Phaseo/pull/3075) [`b5117de`](https://github.com/phaseoteam/Phaseo/commit/b5117de702e4ad1b2dcb552c34a27f203f100548) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a Weights filter (Open weights / Closed weights) to the /models and /models/table pages, and regroup the License filter into Permissive, Restricted and Proprietary. Restricted covers community, non-commercial and research licences.

- [#3058](https://github.com/phaseoteam/Phaseo/pull/3058) [`1ed091d`](https://github.com/phaseoteam/Phaseo/commit/1ed091d6a3087213299d9ba68b84d0e95d0edbcc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Nace.AI catalogue logos and the internal decision evaluation representation and codec. Inference routing remains disabled pending endpoint and billing integration.

- [#2826](https://github.com/phaseoteam/Phaseo/pull/2826) [`0ba84a0`](https://github.com/phaseoteam/Phaseo/commit/0ba84a01ed1e4653c0a65ec983477ac1e48b83b4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Send model routes only the catalogue translations their client components use.

- [#2785](https://github.com/phaseoteam/Phaseo/pull/2785) [`fc6dfb0`](https://github.com/phaseoteam/Phaseo/commit/fc6dfb0ac302f505d000e39cc5927cd428606b62) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Normalize catalogue service tier filters to Standard, Flex, Fast, Batch, and Ultrafast, retaining Free for free models and preserving provider pricing labels.

- [#3089](https://github.com/phaseoteam/Phaseo/pull/3089) [`2a9a4d6`](https://github.com/phaseoteam/Phaseo/commit/2a9a4d617c8677af2f1951feb64ebb177ed63635) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Sign custom webhook notification deliveries. New custom webhook destinations get a `whsec_` signing secret, shown once, and every delivery (routed alerts and tests sent from a saved destination) carries `x-phaseo-timestamp` and `x-phaseo-signature`, the hex HMAC-SHA256 of `<timestamp>.<raw body>`: the same scheme as video and batch webhooks. Deliveries also carry `x-phaseo-event-id` and `x-phaseo-event-type`. Destinations created before this change have no secret and keep sending unsigned; Settings marks them **Unsigned** and offers **Generate secret**. `POST /v1/notifications/destinations/{id}/rotate-secret` generates or replaces a secret, and destinations now report `has_signing_secret` and `signing_secret_rotated_at`.

- [#3009](https://github.com/phaseoteam/Phaseo/pull/3009) [`5e2d013`](https://github.com/phaseoteam/Phaseo/commit/5e2d0137575c8ba7e816ede7a107c1d4b101e76e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Stop embedding client translation dictionaries in every page. Pages now reference a content-addressed dictionary file that browsers load once and cache, while server-rendered HTML keeps every translated string.

- [#3151](https://github.com/phaseoteam/Phaseo/pull/3151) [`15670da`](https://github.com/phaseoteam/Phaseo/commit/15670daa9bdd2f3e2854a0f315b824dbb4fd4e09) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Open in Chat now sits in the header of the request details dialog and the session sheet, next to the title.

- [#3092](https://github.com/phaseoteam/Phaseo/pull/3092) [`093c702`](https://github.com/phaseoteam/Phaseo/commit/093c702f39a4ad789ec324513dac5a69389b6980) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Open any turn of a session in Chat from the session's request timeline, not only the latest one. Add an "Open Requests in Chat" guide in all documentation languages.

- [#2744](https://github.com/phaseoteam/Phaseo/pull/2744) [`5cc4d2f`](https://github.com/phaseoteam/Phaseo/commit/5cc4d2faa1440b62f07a6c5774f44adc1a066d62) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make OpenAI-compatible input and ordered question/answer arrays the preferred Decisions contract across the gateway, SDKs, docs, and playground. Support GPT-6 Luna with inline images, typed boolean choices, refusal handling, and input-only billing while preserving legacy state/question-map callers and SDK type names.

- [#2708](https://github.com/phaseoteam/Phaseo/pull/2708) [`0c67106`](https://github.com/phaseoteam/Phaseo/commit/0c67106448b069a2208a20f28a5fe9cb2a3308f9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record an ordered, bounded request lifecycle journal in operational metadata and retained I/O logs. Display model calls, tool execution, retries, and continuations in execution order, including the routing timeline when payload logging is disabled.

- [#2872](https://github.com/phaseoteam/Phaseo/pull/2872) [`5c19313`](https://github.com/phaseoteam/Phaseo/commit/5c19313df4b073bc530cdfcb7492839f70b80451) Thanks [@DanielButler1](https://github.com/DanielButler1)! - OpenTelemetry Collector destinations can now send traces as OTLP/HTTP protobuf. Set the destination's protocol to `http/protobuf` (the default stays `http/json`), and exports, connection checks and sample traces use `application/x-protobuf`, including protobuf partial-success responses.

- [#3110](https://github.com/phaseoteam/Phaseo/pull/3110) [`a74b795`](https://github.com/phaseoteam/Phaseo/commit/a74b7950fb757fa759befcbf70bcd4b641f5c1e2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Override proxy-addr, source-map-js and compression to their patched releases.

- [#2768](https://github.com/phaseoteam/Phaseo/pull/2768) [`d9dcaee`](https://github.com/phaseoteam/Phaseo/commit/d9dcaee374ca939f91c182c642adb3fce10d071d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent selecting or focusing masked sensitive values until they are revealed.

- [#2845](https://github.com/phaseoteam/Phaseo/pull/2845) [`92880e5`](https://github.com/phaseoteam/Phaseo/commit/92880e55b6f736d7c697407a2386c7c2784185ff) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Title the model card's pricing hover card with the provider whose prices it shows (logo and name; stealth routes stay anonymous), list text Input before image, video and audio inputs, and drop media token rates that only repeat the text rate.

- [#2805](https://github.com/phaseoteam/Phaseo/pull/2805) [`10757c3`](https://github.com/phaseoteam/Phaseo/commit/10757c392235a4e49a27edacdcccc17af5e9f91d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Include internal models in authenticated admin search without persisting private results in browser search history.

- [#2709](https://github.com/phaseoteam/Phaseo/pull/2709) [`5ff8612`](https://github.com/phaseoteam/Phaseo/commit/5ff8612b792ae09f865001a5477a1d959472a84b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use one localized compact count formatter with up to two decimal places across model, provider, app, Rankings, gateway, and profile usage summaries, keeping precise compact chart-axis labels.

- [#2743](https://github.com/phaseoteam/Phaseo/pull/2743) [`24121c1`](https://github.com/phaseoteam/Phaseo/commit/24121c1a1d717a627d85e00f494c12001f4ee24e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show the model catalogue before optional usage statistics and preserve cached catalogue data during route navigation.

- [#2971](https://github.com/phaseoteam/Phaseo/pull/2971) [`6dd0d40`](https://github.com/phaseoteam/Phaseo/commit/6dd0d405ce8dab52970cf2b903403cf7216c585b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Document prompt caching as the gateway now behaves: which providers cache automatically, where each cache control is sent, OpenAI-style usage with `cache_write_tokens`, the input-rate fallback for missing cache prices, and provider affinity. The OpenAPI usage schemas gain `input_tokens_details` / `prompt_tokens_details` with `cached_tokens` and `cache_write_tokens`, and the Anthropic usage schema gains its cache fields, so the generated SDK types include them.

- [#2734](https://github.com/phaseoteam/Phaseo/pull/2734) [`f150dde`](https://github.com/phaseoteam/Phaseo/commit/f150dde4cf0b984a2f4cc8a816468bb7e503d992) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require approval for new canonical models while keeping approved provider offers and prices automatic. Add a private model-review queue, safe Slack alerts, and field-level catalog validation errors.

- [#2758](https://github.com/phaseoteam/Phaseo/pull/2758) [`c835b30`](https://github.com/phaseoteam/Phaseo/commit/c835b302ef6b78e530f777a19e623f22c0fc627b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Import valid provider offers when another model requires mapping changes, and display blocked model reasons in provider settings.

- [#3107](https://github.com/phaseoteam/Phaseo/pull/3107) [`82eca20`](https://github.com/phaseoteam/Phaseo/commit/82eca2052394b942b9625cd4e08c9ff4f309cc0d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider catalog v1.2 capability-level training and retention declarations, with separate administrator approval, revocable feed ownership and consistent privacy routing projections.
  
  Retain validated typed model, media, parameter, pricing, capacity and deployment declarations for review, with explicit feedback distinguishing those claims from active billing and execution support.

- [#2770](https://github.com/phaseoteam/Phaseo/pull/2770) [`b2d7f40`](https://github.com/phaseoteam/Phaseo/commit/b2d7f4076bd5080d3ad2181d9dd0ad4b06cf0a0a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restrict shared model metadata changes to Phaseo administrators. Providers manage their offers and endpoint capabilities through checkbox controls, while the API rejects unauthorized metadata edits.

- [#2731](https://github.com/phaseoteam/Phaseo/pull/2731) [`4dd86ab`](https://github.com/phaseoteam/Phaseo/commit/4dd86abf8a3199eee7da888b8850cde574864530) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Apply validated catalog updates automatically after provider approval, preserving price history and retiring removed provider offers. Remove the manual model approval queue and reject invalid feed prices with useful errors.

- [#2579](https://github.com/phaseoteam/Phaseo/pull/2579) [`aab03e8`](https://github.com/phaseoteam/Phaseo/commit/aab03e831175dc8e2a063bc06002b11ec3ddd8ea) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Separate provider application approval from route readiness, expose ownership proof and review decisions, support application revisions, and gate catalog editing until approval.

- [#2447](https://github.com/phaseoteam/Phaseo/pull/2447) [`c099268`](https://github.com/phaseoteam/Phaseo/commit/c099268b2b56c4489f4fe2af43b1d58cd3ff3104) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Group additional routing options in model provider tables, with borderless tier badges, parenthesised region labels, and expandable service tiers that clarify explicit selection. Hide external providers unless enabled in the status filters, then show them in their own section.

- [#2449](https://github.com/phaseoteam/Phaseo/pull/2449) [`68e758d`](https://github.com/phaseoteam/Phaseo/commit/68e758d5ca549e594f87816d8a7321b85f66f2fc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Open provider details when clicking table names and retain provider-page navigation in the sheet. Explain how the routing slug pins API requests to a provider, with a link to the routing documentation.

- [#2769](https://github.com/phaseoteam/Phaseo/pull/2769) [`00c3554`](https://github.com/phaseoteam/Phaseo/commit/00c3554c7ee45b052d702c0befa372e50c189211) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use consistent shadcn dropdowns for provider catalog, service-tier and onboarding controls.

- [#2685](https://github.com/phaseoteam/Phaseo/pull/2685) [`b56f720`](https://github.com/phaseoteam/Phaseo/commit/b56f720a8b1b587052c641f57b186cc0288afc6a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Avoid extra comparison requests during backend failures and serve bounded stale public catalogue data while refreshing or recovering from an outage.

- [#2470](https://github.com/phaseoteam/Phaseo/pull/2470) [`c368d1a`](https://github.com/phaseoteam/Phaseo/commit/c368d1a5d02a67258d62449da9d7a3d8b9a2286c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Announce public models when their catalogue status becomes available, check for availability every minute, and add a per-model Discord announcement action to the internal model editor using the current public embed format.

- [#2496](https://github.com/phaseoteam/Phaseo/pull/2496) [`33cd306`](https://github.com/phaseoteam/Phaseo/commit/33cd306401491a1bfc1e779be10de62d4048c2db) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restrict Chat reasoning choices to the selected model's supported effort values and add an in-menu back control for nested chat actions.

- [#2467](https://github.com/phaseoteam/Phaseo/pull/2467) [`ea1162c`](https://github.com/phaseoteam/Phaseo/commit/ea1162c62dab482364bded727fab4b22173526ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bring Decisions chat history and result colors in line with the other chat rooms.

- [#2706](https://github.com/phaseoteam/Phaseo/pull/2706) [`8d60a07`](https://github.com/phaseoteam/Phaseo/commit/8d60a07717cff4506f39dfa0802c1313126546bd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove Providers from the desktop header and mobile navigation menu.

- [#2801](https://github.com/phaseoteam/Phaseo/pull/2801) [`2bbf817`](https://github.com/phaseoteam/Phaseo/commit/2bbf8174e09a4ff1d673d3ab0670bcc0d94d6728) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show the catalogue lifecycle status on admin-only hidden model overviews.

- [#2883](https://github.com/phaseoteam/Phaseo/pull/2883) [`8162204`](https://github.com/phaseoteam/Phaseo/commit/816220432a3b0c9c4132d859ea6accd555300b56) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prefetch homepage statistics, update cards, articles, and lower-page actions only when visitors hover, focus, or touch their links.

- [#2837](https://github.com/phaseoteam/Phaseo/pull/2837) [`ae56a0d`](https://github.com/phaseoteam/Phaseo/commit/ae56a0d4acdf6f767ab20d93664507778d13302e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fetch common navigation and model-action destinations on user intent instead of every passive page visit, and bypass session middleware for public documentation and analytics rewrites.

- [#2810](https://github.com/phaseoteam/Phaseo/pull/2810) [`aa89c1d`](https://github.com/phaseoteam/Phaseo/commit/aa89c1d8713cfe4e2194c34881a752686ebf4f02) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce shared page rendering work by reusing bundled locale dictionaries and skipping redundant anonymous account requests and disabled notice authentication.

- [#2855](https://github.com/phaseoteam/Phaseo/pull/2855) [`1ff1119`](https://github.com/phaseoteam/Phaseo/commit/1ff1119f41ceb3ac2c85ed605f6e1c4beca6e011) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prefetch homepage and methodology destinations on user interaction, and avoid background documentation fetches from footer links.

- [#2507](https://github.com/phaseoteam/Phaseo/pull/2507) [`f1ea06f`](https://github.com/phaseoteam/Phaseo/commit/f1ea06fdffdd88d85d53626b4cb00fc6ffc0bf35) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Filter chat model settings to the selected model's supported reasoning efforts and service tiers.

- [#2963](https://github.com/phaseoteam/Phaseo/pull/2963) [`a0ef4b5`](https://github.com/phaseoteam/Phaseo/commit/a0ef4b5a83d6ec8aa6df23e9d150873b255a78f5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject POSTs to page URLs that carry no server action before they render, and turn off Partial Prefetching so pages no longer render and embed a second runtime prefetch copy.

- [#2448](https://github.com/phaseoteam/Phaseo/pull/2448) [`b8c33ca`](https://github.com/phaseoteam/Phaseo/commit/b8c33cab339f123ac730ababde51bdf69c03c1fe) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use shallow nuqs updates for model provider sheets, table sorting, and the internal routing settings sheet. Preserve deep links and scroll position, and close request-log sheets when Back removes their query parameter.

- [#2436](https://github.com/phaseoteam/Phaseo/pull/2436) [`25ab069`](https://github.com/phaseoteam/Phaseo/commit/25ab06929842957896ade97487811db61dbedd98) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Migrate client data refresh to TanStack Query with account-scoped caches, credential-free public requests, and private-data invalidation on session changes. Reauthorize provider previews, preserve private model endpoint rows, and restore repeated focus refreshes without background polling.
  
  Keep private query data fresh for five minutes, refresh visible private queries every five minutes, and invalidate account queries after private-model and provider-catalogue mutations. Manual refresh and sign-out bypass the freshness window.
  
  Prevent old private content flashing after account changes by masking saved documents and revalidating full-document history restores before cached HTML can paint.
  
  Use fifteen-minute public query freshness and visible polling for catalogue, pricing, performance and search views. Align public provider information, model/provider telemetry and pricing at the edge to fifteen minutes without an additional stale-serving window. Preserve five-minute private queries, explicit client invalidation/refetch, and server cache purge tags.

- [#2665](https://github.com/phaseoteam/Phaseo/pull/2665) [`c0b7e78`](https://github.com/phaseoteam/Phaseo/commit/c0b7e7802d5b18ed8681903a0a1282115326d2f0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show availability for each service tier independently, including coming soon Ultrafast pricing.

- [#2704](https://github.com/phaseoteam/Phaseo/pull/2704) [`58cba0b`](https://github.com/phaseoteam/Phaseo/commit/58cba0b8354b4f9c622cf253502b1a9143d6fe6f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Evaluate the request Trace UI flag on the server so eligible internal users can open the new view without a browser Statsig provider.

- [#2689](https://github.com/phaseoteam/Phaseo/pull/2689) [`4d33098`](https://github.com/phaseoteam/Phaseo/commit/4d330989de6993f7e741985b9294bd04b52ac083) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove unrelated shared translations from public pages, select client-only route copy, and load optional admin-tool translations on demand.

- [#2850](https://github.com/phaseoteam/Phaseo/pull/2850) [`4deb866`](https://github.com/phaseoteam/Phaseo/commit/4deb8669706b0a398518fcfeeda199905887f520) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Routing eases traffic off a provider as it approaches a declared rate limit instead of switching it off at the limit. The limit coordinator projects each window's use from what isolates report they have used, and shortens leases near a limit so unused allowance is returned sooner. This removes the per-minute traffic swings and most of the requests that were sent over a limit.

- [#2888](https://github.com/phaseoteam/Phaseo/pull/2888) [`dafbc58`](https://github.com/phaseoteam/Phaseo/commit/dafbc580dcda55d340613949c80939763f07215d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for named rate limit policies (requests per minute, tokens per minute, concurrent requests) and their assignments to API keys, members, departments, guardrails, or the workspace's end-user default, with new `rate_limits:read`, `rate_limits:write`, and `rate_limits:delete` scopes. The gateway does not enforce these policies yet. API keys can now be linked to a department with `department_id`. The guardrail request and spend limit fields, which were never enforced, are marked deprecated.

- [#2946](https://github.com/phaseoteam/Phaseo/pull/2946) [`105d6d2`](https://github.com/phaseoteam/Phaseo/commit/105d6d28d5947798db8f6013034cfd0f300047ff) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `rate_limit_throttled` notification event. Workspaces that route it to a destination get at most one alert an hour when rate limit policies reject requests, with the total over the last 15 minutes and the most-rejected policies.

- [#3207](https://github.com/phaseoteam/Phaseo/pull/3207) [`625c74d`](https://github.com/phaseoteam/Phaseo/commit/625c74d506e0a8901a2ca25f3f0a4828d2271a9d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - The Rate limits page's "Applies to" and policy pickers show the chosen name instead of its internal value.

- [#2429](https://github.com/phaseoteam/Phaseo/pull/2429) [`2b78b13`](https://github.com/phaseoteam/Phaseo/commit/2b78b13e7225b6ccb54c9c4a615b73455cdb26b6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refine the Decisions chat experience with typed question controls, local conversation history, structured result rendering, canonical Jev model identity, and complete request timing metadata. Expose provider-neutral Decisions naming across the gateway, web proxy, OpenAPI contract, and generated SDKs while keeping TypeSafe's System One terminology inside its provider adapter. Keep text generation internally streamed while preserving non-streaming client responses.

- [#2847](https://github.com/phaseoteam/Phaseo/pull/2847) [`9902f7f`](https://github.com/phaseoteam/Phaseo/commit/9902f7f52cbe0da3e189f0a23e4a2519e5c47eaf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refine model modality colours in light and dark themes with borderless badges and use the Realtime label consistently.

- [#2797](https://github.com/phaseoteam/Phaseo/pull/2797) [`7a9f95b`](https://github.com/phaseoteam/Phaseo/commit/7a9f95bde5d3186b844bc2aa568017d68375011a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the model release button from the admin editors.

- [#2757](https://github.com/phaseoteam/Phaseo/pull/2757) [`9c096ff`](https://github.com/phaseoteam/Phaseo/commit/9c096ff732bebced9ada62a0563a4523b8f9f2f9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the redundant capability badge row from model cards.

- [#2683](https://github.com/phaseoteam/Phaseo/pull/2683) [`b53e4cb`](https://github.com/phaseoteam/Phaseo/commit/b53e4cbd31036f3bb7ea5a3ec395ec187c9e281a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the Monitor page and its navigation and sitemap entries.

- [#2722](https://github.com/phaseoteam/Phaseo/pull/2722) [`a9fb435`](https://github.com/phaseoteam/Phaseo/commit/a9fb4358b5393adf5be23a2c5f9a755e26e1ab63) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the date-range and comparison caption beneath ranking leaderboard filters.

- [#3031](https://github.com/phaseoteam/Phaseo/pull/3031) [`aa2719c`](https://github.com/phaseoteam/Phaseo/commit/aa2719cad0c9a1081895856581cacbc7e7bf8848) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Export request labels, including request classifier answers, to Broadcast destinations as `phaseo.label.<key>` span attributes, and add the Request Classifiers guide in every docs language.

- [#3061](https://github.com/phaseoteam/Phaseo/pull/3061) [`ba1a716`](https://github.com/phaseoteam/Phaseo/commit/ba1a716b4196ae26af0c8c8990f17f7839b69f28) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Put request classifiers behind the `gateway_request_classifiers` Statsig gate while they are in beta. Until a workspace is in the gate, the gateway does not classify its requests, the `/v1/classifiers` management API returns 403 with `reason: request_classifiers_feature_flag_disabled`, and the Classifiers settings page is hidden and returns 404. The gate name can be changed with `STATSIG_REQUEST_CLASSIFIERS_GATE` (gateway) and `NEXT_PUBLIC_STATSIG_REQUEST_CLASSIFIERS_GATE` (web).

- [#3029](https://github.com/phaseoteam/Phaseo/pull/3029) [`c8f3bca`](https://github.com/phaseoteam/Phaseo/commit/c8f3bcaebc6c6c6f37c5f32bef03852b3e5724f1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for request classifiers (`/v1/classifiers`), with new `classifiers:read`, `classifiers:write`, and `classifiers:delete` scopes. A classifier is a workspace taxonomy of up to 12 dimensions, a model, optional instructions, a sample rate, an optional scope (keys, apps, models), and an optional monthly budget; up to 5 per workspace. The gateway does not run classifiers yet.

- [#3066](https://github.com/phaseoteam/Phaseo/pull/3066) [`592f54a`](https://github.com/phaseoteam/Phaseo/commit/592f54a2f7fdfe9bd057c74d4373917b69c03a8b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Request classifiers can use any text or decision model. The gateway picks how to ask from what the model's providers support. Text models with structured outputs get a strict JSON schema, as before. Decision models get a `decisions` request with one choice question per dimension (one yes/no question per value for multi-value dimensions), using the model's own probabilities as confidence. Other text models are asked for the same JSON in the prompt; the answer is read even when it is wrapped in a code fence or a sentence. A schema request that is refused with a 400 or 422 is retried once as prompted JSON. The settings model picker now lists every text and decision model and shows which format the chosen model uses, and the settings test run uses the same format.

- [#3033](https://github.com/phaseoteam/Phaseo/pull/3033) [`b76ddd3`](https://github.com/phaseoteam/Phaseo/commit/b76ddd326f2aae70265e06e8e14ba049ea156ee0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the workspace Classifiers settings page: create, edit, test and delete request classifiers from presets (department, audience, task type, engineering work, agent complexity, compliance), with sampling, scope, a monthly budget and this month's spend. Owners and admins only. Classifier validation and the classification request now come from one shared module used by the gateway, the settings API and the page. A settings test run is labelled phaseo.classifier_test, and the gateway does not classify requests that carry that label.

- [#3082](https://github.com/phaseoteam/Phaseo/pull/3082) [`d8ea7d3`](https://github.com/phaseoteam/Phaseo/commit/d8ea7d3506780c44ab80a35e7db80ee8c29aaafa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Request labels are easier to read and use. The request sheet shows them first, in a Labels section laid out like the sheet's other details: each value with its classifier's confidence as a small bar, one quiet line for the classifier, model, cost and its call, and a status only when a classifier failed or reached its budget. The logs table has a Labels column with each request's labels as badges. Every label value, in the sheet or the table, opens the logs filtered to it. The Trace tab is now available to every workspace, and its payload status no longer names the storage backend.

- [#3191](https://github.com/phaseoteam/Phaseo/pull/3191) [`b29c8ac`](https://github.com/phaseoteam/Phaseo/commit/b29c8aceb82e46b76c02b20b36c7f33be4bb7a7b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the retired automated discovery review queue and its API routes. Provider catalog review remains available.

- [#3065](https://github.com/phaseoteam/Phaseo/pull/3065) [`70d0ee3`](https://github.com/phaseoteam/Phaseo/commit/70d0ee3cc9dbd6c0f41d549f2e85f3d5d3d77b22) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Cut server CPU on the compare page by about half. The model picker no longer groups and labels the whole catalogue while its dialog is closed, and display formatters are reused instead of rebuilt for every value.

- [#3006](https://github.com/phaseoteam/Phaseo/pull/3006) [`9de8991`](https://github.com/phaseoteam/Phaseo/commit/9de8991ff7e6a35301d5e821aa1e197806d22375) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add snapshot storage and paginated model data reads for Artificial Analysis token usage, benchmark and capability scores, pricing, performance, and model specifications.

- [#2499](https://github.com/phaseoteam/Phaseo/pull/2499) [`2b4afce`](https://github.com/phaseoteam/Phaseo/commit/2b4afce6bf133ce99c7bcff7921d0bcc464258fb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep long Choice and Score option lists scrollable in the Decisions composer.

- [#2532](https://github.com/phaseoteam/Phaseo/pull/2532) [`510b41c`](https://github.com/phaseoteam/Phaseo/commit/510b41c74fa8ad604aa0306e40c146fa7ce56d1e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prioritize search result titles over subtitles and show a book icon for documentation links.

- [#2773](https://github.com/phaseoteam/Phaseo/pull/2773) [`f0c2012`](https://github.com/phaseoteam/Phaseo/commit/f0c201294b5b5feffc9da8d45d6059bf0761f18d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Strengthen request policy enforcement, privacy controls, resource limits, and SDK path handling. Require a workspace privacy review before Chat resumes.

- [#2976](https://github.com/phaseoteam/Phaseo/pull/2976) [`9fee439`](https://github.com/phaseoteam/Phaseo/commit/9fee4395b43fe8a6ca8e6039ba4e431d10c5fc31) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Track Fastino separately from retired Pioneer, retain separate provider identities, and show a successor notice on retired provider pages. List verified catalogue offerings as inactive when gateway integration is unsupported.

- [#3195](https://github.com/phaseoteam/Phaseo/pull/3195) [`322d401`](https://github.com/phaseoteam/Phaseo/commit/322d401035e121ef86581a0d844e4af49ec48ba9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the manual refresh button from settings pages. Settings still refresh after every change and now reload stale data when the tab regains focus.

- [#2750](https://github.com/phaseoteam/Phaseo/pull/2750) [`5579f7d`](https://github.com/phaseoteam/Phaseo/commit/5579f7dc7ae6ccd6fa5e8166deed8fdec4ad6a50) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use compact FAQ labels in model page navigation across locales.

- [#2822](https://github.com/phaseoteam/Phaseo/pull/2822) [`2d41014`](https://github.com/phaseoteam/Phaseo/commit/2d41014cd678d2dab9e4bf1afaaf5f5cb6c3df22) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce public page transfer by loading full benchmark leaderboards when expanded, fetching the public chat catalogue in the browser, and sending only picker fields for comparison model choices. Preserve benchmark ranks, workspace policy and full selected-model comparisons.

- [#3171](https://github.com/phaseoteam/Phaseo/pull/3171) [`a62fb90`](https://github.com/phaseoteam/Phaseo/commit/a62fb9084bc9a5ee1138c61ce088ce7ad6c3c108) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Slack agent's app manifest (`apps/slack/manifest.json`), with a test that keeps its bot scopes, bot events and request URLs in step with web-api and the Worker. Add the Slack agent guide in nine languages: installing from Settings → Slack, who can use it and linking accounts, usage questions, limits, pricing, data handling, emails to owners and admins, using your own Slack app with the same manifest, uninstalling and troubleshooting. The docs search includes the new page.

- [#2824](https://github.com/phaseoteam/Phaseo/pull/2824) [`2ed382f`](https://github.com/phaseoteam/Phaseo/commit/2ed382fc48c9697c30480bea134c5826bf58ab06) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Shrink the models page payload. The catalogue streams in a compact form that the page expands back to the same model data, and the models list now receives only the translations it uses instead of every model sub-page's messages.

- [#3087](https://github.com/phaseoteam/Phaseo/pull/3087) [`d4d8dbd`](https://github.com/phaseoteam/Phaseo/commit/d4d8dbdd67e651245a51c8c1bdfc281660241c74) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Attribute workspace spend to people and departments for the coming spend rules. The 15-minute usage rollup now records who made each request (the key's creator, or the OAuth user), workspaces gain a department spend attribution setting (`all` departments a person belongs to, or the `primary` one only), and notification settings in the control API and account settings expose it as `spend.department_attribution`. Usage overview totals are unchanged.

- [#3094](https://github.com/phaseoteam/Phaseo/pull/3094) [`577c773`](https://github.com/phaseoteam/Phaseo/commit/577c773e22e75fbf0cc9e6a64dfdf9f9fb677ae3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Lay the groundwork for spend rules. Workspaces gain a billing time zone (`spend.billing_time_zone` in the control API's notification settings and in account settings, an IANA name, default `UTC`) for the calendar periods of spend rules and spend reports, and three new routable notification kinds: `spend_alert`, `spend_blocked` and `spend_report`. They can be routed to destinations now; nothing sends them yet. The database adds the spend rule tables (rules, their destinations, fired state, blocks and the evaluation queue), capped at 50 rules per workspace.

- [#2755](https://github.com/phaseoteam/Phaseo/pull/2755) [`25e03f9`](https://github.com/phaseoteam/Phaseo/commit/25e03f986440014bb8df849ebe16b8187b305b34) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep provider pricing columns stable when expanding service tiers, including grouped equal input token rates.

- [#2789](https://github.com/phaseoteam/Phaseo/pull/2789) [`d826307`](https://github.com/phaseoteam/Phaseo/commit/d826307ee571acd3aefd130425277fd77ae8b78e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Exclude staged model traffic from public reporting and let admins release prepared internal models atomically.

- [#2889](https://github.com/phaseoteam/Phaseo/pull/2889) [`b3186e3`](https://github.com/phaseoteam/Phaseo/commit/b3186e3ff27b1bec5316c02113d9b193b20e766c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hide Chat and Use this model in the main and sticky headers for subscription-only models without API providers.

- [#2887](https://github.com/phaseoteam/Phaseo/pull/2887) [`749648f`](https://github.com/phaseoteam/Phaseo/commit/749648f9b76b0f1590cdedb81e28811cae2fe1f4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show subscriptions first on models with subscription plans and no API providers, and hide their API pricing and gateway activity sections.

- [#3007](https://github.com/phaseoteam/Phaseo/pull/3007) [`a0ff238`](https://github.com/phaseoteam/Phaseo/commit/a0ff238a77aeb5ff2ffd9b9265188ad133f27214) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Build a Slopalytics-inspired Artificial Analysis dashboard with connected comparison charts, shared model filters, token usage, evaluation costs, individual benchmarks and domain capabilities.

- [#2973](https://github.com/phaseoteam/Phaseo/pull/2973) [`34764f4`](https://github.com/phaseoteam/Phaseo/commit/34764f4ce205f42b032bfa5ff6077feca4aaba3d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Group Artificial Analysis benchmarks under one search and catalog entry with metric selection and published version navigation. Publish imports atomically, retain snapshot history, and calculate model coverage in Postgres.

- [#2485](https://github.com/phaseoteam/Phaseo/pull/2485) [`5a893df`](https://github.com/phaseoteam/Phaseo/commit/5a893dfc91c77064ea40330a70ae9096158823c0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Match Decisions user message bubbles to Text Chat sizing and layout.

- [#3064](https://github.com/phaseoteam/Phaseo/pull/3064) [`03116dc`](https://github.com/phaseoteam/Phaseo/commit/03116dc164d8f7ff4a458c3bf153ec00a9143a83) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Tidy the organisation and API provider pages. Provider models now use the same card grid as other model lists, with a details sheet for full pricing, parameters and endpoints. Organisation performance shows ranked bars, the sidebar uses a short "About" label and better section icons, and sidebar entries for sections that did not render are hidden. Provider performance charts now draw their area fill and mark sparse samples. The organisation Models page now returns full catalogue cards, so statuses, providers, pricing and modalities show, and draft or internal models stay out.

- [#2450](https://github.com/phaseoteam/Phaseo/pull/2450) [`9ff8fa5`](https://github.com/phaseoteam/Phaseo/commit/9ff8fa5e3944a4d9d970bd76dd582a99b9907806) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Cache private usage dashboards, geography, and log lists in user/workspace-scoped browser memory for five minutes. Keep Live views on fresh 15-second network polling, allow manual refresh to bypass freshness, and clear private query data on sign-out and identity changes.
  
  Extend private caching to account/profile, workspace administration, keys, routing, guardrails, privacy, notifications, presets and feedback, private models, BYOK, webhooks, broadcast, audit activity and transaction history. Invalidate after writes and keep credential reveals, payment/MFA flows, and authorization checks fresh. Return only explicit display metadata from key-list endpoints.
  
  Isolate Chat and Fusion browser history, presets and preferences by user and lock storage during identity changes. Automatically migrate legacy browser history once to the first signed-in account opening Chat, preserve originals, and prevent later accounts from claiming it. Revalidate BYOK and webhook display data after mutations settle without caching revealed credentials.
  
  Revalidate broadcast destinations after creation, wait for every bulk API-key write before invalidating cached lists, and refresh transaction history using the actual refund response.
  
  Cache OAuth app lists/details, beta preferences and broadcast creation options for five minutes. Invalidate after OAuth and beta mutations, and allowlist OAuth display metadata so credentials and authorization tokens never enter the query cache.

- [#2701](https://github.com/phaseoteam/Phaseo/pull/2701) [`4ade024`](https://github.com/phaseoteam/Phaseo/commit/4ade024f61bf8dcc36f47582d7f6f8f37b1cc68b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix missing settings translations in pages and dialogs, localize the mobile settings sheet navigation, and restore the English Docs header label.

- [#2713](https://github.com/phaseoteam/Phaseo/pull/2713) [`fec7df5`](https://github.com/phaseoteam/Phaseo/commit/fec7df55bbb7585d316d6e411c4db3c3a645afad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore provider logos and links in ordered response timelines, add tool icons, and show a marker for instant tool executions.

- [#2687](https://github.com/phaseoteam/Phaseo/pull/2687) [`7738a70`](https://github.com/phaseoteam/Phaseo/commit/7738a70466773b762fa05a1b30fab73ba846dd79) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Scope browser translations to route features and bound server catalogue loading to one deadline without server retries.

- [#2571](https://github.com/phaseoteam/Phaseo/pull/2571) [`130dca2`](https://github.com/phaseoteam/Phaseo/commit/130dca2c79d131f47f544adbc1e07cefb4f08e4b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose Together Tev's Hugging Face weights and license links on model pages, and add a Tev-specific `/v1/decisions` executor with Together's published pricing.

- [#2662](https://github.com/phaseoteam/Phaseo/pull/2662) [`3f0e9ac`](https://github.com/phaseoteam/Phaseo/commit/3f0e9ac9fe22b21a92787792a6e2844e9b059f5c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Capture gateway-managed tool calls and results in opt-in R2 request logs, and show request lifecycle details in the Logs trace view.

- [#2842](https://github.com/phaseoteam/Phaseo/pull/2842) [`4623844`](https://github.com/phaseoteam/Phaseo/commit/46238440b73ddb505a542ca8f9a5a287dd3b9b96) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce model pricing page payloads by omitting unused hourly uptime data while retaining table metrics and provider inspector charts.

- [#2929](https://github.com/phaseoteam/Phaseo/pull/2929) [`520536f`](https://github.com/phaseoteam/Phaseo/commit/520536f3af2c96cb6989cc58c647a8166b773768) Thanks [@DanielButler1](https://github.com/DanielButler1)! - On touch screens, tapping the provider table's Uptime header only sorts, and tapping the provider sheet's Uptime tile only switches the chart; their hover cards now show on hover and focus only. The provider sheet shows the uptime colour key under the hourly chart.

- [#2927](https://github.com/phaseoteam/Phaseo/pull/2927) [`5ccbcb5`](https://github.com/phaseoteam/Phaseo/commit/5ccbcb51fc0b2a86046b9567572a6f4eb4509652) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Build the usage overview from exact totals summed in the database rather than a 5,000-request sample, so busy workspaces see every request in their KPI cards, charts, top lists, explore table and guardrail blocks. A new 15-minute workspace rollup, kept current by the analytics outbox, covers whole quarter hours. `get_private_usage_overview` adds the requests at the window's edges and buckets them in the reader's time zone. KPI forecasts now start from the card's exact figure, project at the last 7 days' pace under the same filters, and run to local period ends, so filtered views get forecasts too. Request labels get the same treatment: a per-label rollup backs label-filtered views, the label filter lists every label used in the range, and the logs page's label totals are exact. Cache hit rate now counts `cached_input_tokens`, which the overview previously missed.

- [#2921](https://github.com/phaseoteam/Phaseo/pull/2921) [`9de5aba`](https://github.com/phaseoteam/Phaseo/commit/9de5aba6cbaadc6614dd1310be7b57c4409b4d91) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Base the usage overview's KPI card footers on the selected range rather than the calendar month, so each footer agrees with the figure above it. Today, this week, this month, this quarter and this year project to their end. Rolling windows from 24 hours to a year project the same length ahead. Finished, custom and sub-day ranges, and filtered views, show each total's change from the previous period. The rate cards show the previous period's value. Comparisons now use the matching calendar period: today so far against yesterday at the same time, September against all of August. Footers and the delta tooltip name the dates compared with. Small dollar amounts keep their cents.

- [#2659](https://github.com/phaseoteam/Phaseo/pull/2659) [`4308c9f`](https://github.com/phaseoteam/Phaseo/commit/4308c9f506b6b377c039535fb9f8918bc80a2df8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use SKU meter metadata in public model pricing, show unfamiliar billing units in provider pricing, and derive provider table unit headers from the displayed rate.

- [#2483](https://github.com/phaseoteam/Phaseo/pull/2483) [`e4488fe`](https://github.com/phaseoteam/Phaseo/commit/e4488fef7748da754bf4cc73b7ada68cde58eabc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore request code samples when reopening saved text chats and omit internal session identifiers from generated examples.

- [#2844](https://github.com/phaseoteam/Phaseo/pull/2844) [`d0f1247`](https://github.com/phaseoteam/Phaseo/commit/d0f12473096df95594f35731006541de91fb5810) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redirect old model sub-paths, such as `/models/openai/gpt-5/benchmarks`, with a real 308 before rendering, and disallow query-string `/compare?` and `/chat?` URLs in robots.txt so crawlers stop rendering one page per model and locale.

- [#2700](https://github.com/phaseoteam/Phaseo/pull/2700) [`d79462e`](https://github.com/phaseoteam/Phaseo/commit/d79462e56e601d16a703b198d01c52d9c1e9feef) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add owner/admin-only workspace user profiles with usage, keys, top models and recent logs, plus user chip context menus.

## 1.2.0

### Minor Changes

- [#1807](https://github.com/phaseoteam/Phaseo/pull/1807) [`f632028`](https://github.com/phaseoteam/Phaseo/commit/f63202845b98c90cec966daf8e9192043727e983) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Rename organisation pages to Labs, enrich their model cards, and add model-aligned performance and link sections.

- [#1557](https://github.com/phaseoteam/Phaseo/pull/1557) [`da95013`](https://github.com/phaseoteam/Phaseo/commit/da9501340bcde7c9ad851f3e26e6c9848625f950) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add model pricing history, tier-aware effective pricing, and synchronized provider inspection.

- [#1314](https://github.com/phaseoteam/Phaseo/pull/1314) [`7a37f89`](https://github.com/phaseoteam/Phaseo/commit/7a37f8956c26affcaa792ecfbac445bf0c90f218) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add key-scoped dynamic routing flows, searchable model selection with ordered model and provider fallbacks, provider-health suggestions, and 15-minute cache-aware plus session-aware provider affinity.

- [#1754](https://github.com/phaseoteam/Phaseo/pull/1754) [`cbaf35c`](https://github.com/phaseoteam/Phaseo/commit/cbaf35cc86f7acccc6380620f9f95f9d95d8d0c8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add self-serve Enterprise subscriptions with SSO, SCIM provisioning, workspace directory management, and member-based billing.

- [#2338](https://github.com/phaseoteam/Phaseo/pull/2338) [`fdb2816`](https://github.com/phaseoteam/Phaseo/commit/fdb2816c95710fcba066908aca9021625d645367) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add GPT Live 1 to the Realtime playground with dedicated Live session APIs, all built-in voices, configurable Responses delegation and optional web search. Price voice duration, backend tokens/cache usage and native tool calls separately with snapshotted tier-aware prices. Preserve final usage across disconnects, retain holds when usage is incomplete, and show delegation usage and component costs.
  
  Verify microphone frames and resume capture/playback before opening a billable Live connection. Report first audio forwarding, microphone signal and provider audio, and stop disconnected or stalled capture. Include offline browser checks for the room's audio round trip, blocked permissions, autoplay and cleanup without paid provider calls.
  
  Show short, documented language, regional influence and presentation descriptions for 12 Live voices, with wrapping text in the voice selector.
  
  Keep the session overview scrollable above the call controls and present delegation usage in a keyboard-accessible, bounded disclosure panel, using ShadCN Scroll Area for both scrollable regions.
  
  Use ShadCN Scroll Area in the realtime/delegation settings dialog and keep the dialog within short mobile viewports.

- [#2406](https://github.com/phaseoteam/Phaseo/pull/2406) [`06f63b5`](https://github.com/phaseoteam/Phaseo/commit/06f63b5a241c3e18b7d7b470b2b099926ad614f7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Give self-serve provider accounts catalog-first navigation and reuse an owned personal workspace for new provider links. Preserve administrator navigation and existing workspaces. Requires the provider personal account database migration before enabling new submissions.

### Patch Changes

- [#2055](https://github.com/phaseoteam/Phaseo/pull/2055) [`577ec42`](https://github.com/phaseoteam/Phaseo/commit/577ec42a1a73a46e54287c878f2ed948a48a682e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Statsig-gated Alpha for the `phaseo/auto` model router with a separately metered low-cost classifier request, complexity-aware capability scoring, a managed text-model universe, workspace spend profiles and pattern restrictions, routing diagnostics, retryable model fallbacks, and a dedicated Auto Routing settings page.

- [#2297](https://github.com/phaseoteam/Phaseo/pull/2297) [`0c9c1aa`](https://github.com/phaseoteam/Phaseo/commit/0c9c1aa70c6bc526023576001eeab21737dfa1b0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add BYOK-only provider policy, BYOK-aware batch files and lifecycle operations, fee-only batch reservations and settlement, and model-page BYOK-only indicators.

- [#2281](https://github.com/phaseoteam/Phaseo/pull/2281) [`73fe9a1`](https://github.com/phaseoteam/Phaseo/commit/73fe9a1e6b3ecc8c11a9e6d67da8e61ca5bc6dda) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add ISO 3166-2 primary location metadata for catalogue organisations and API providers, including named-location display in the public catalogue and admin editing support.

- [#2262](https://github.com/phaseoteam/Phaseo/pull/2262) [`760d38c`](https://github.com/phaseoteam/Phaseo/commit/760d38c70b36522ab600c22e6929a69d0a4b7a9d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the CrofAI brand logo to provider and model surfaces.

- [#2408](https://github.com/phaseoteam/Phaseo/pull/2408) [`2de2338`](https://github.com/phaseoteam/Phaseo/commit/2de233890551050e161cf7d621920b65a6029215) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Epoch AI Capabilities Index as a first-class benchmark with confidence intervals, leaderboards, progress filters, and daily source synchronization.

- [#1729](https://github.com/phaseoteam/Phaseo/pull/1729) [`8667fee`](https://github.com/phaseoteam/Phaseo/commit/8667feef9f2bdea5de534666352c6cc26f2af2cc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an SEO-focused OpenRouter migration guide with agent instructions, validation steps, and free migration support.

- [#2117](https://github.com/phaseoteam/Phaseo/pull/2117) [`6eaf82e`](https://github.com/phaseoteam/Phaseo/commit/6eaf82e5981127d8d23822fe950f8b6520d97919) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add RunInfra as a catalogue API provider with its eight currently supported hosted models and verified text-generation pricing.

- [#2029](https://github.com/phaseoteam/Phaseo/pull/2029) [`ebfc0ee`](https://github.com/phaseoteam/Phaseo/commit/ebfc0ee29f29f7ea0062ad34b3623bd30b47758e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Register Tencent Cloud TokenHub as an OpenAI-compatible text provider with the current international model scope, capture USD pricing, and expose its API-key onboarding metadata. Exclude vendor-direct, Kinfra, and media routes; keep the scoped routes disabled pending live API-key smoke testing.

- [#1796](https://github.com/phaseoteam/Phaseo/pull/1796) [`ed53721`](https://github.com/phaseoteam/Phaseo/commit/ed537215181130cdc164c6c1a9c906aca39549bc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace notification settings with encrypted Email, Discord, Slack, Microsoft Teams, and custom webhook destinations, synchronous connection tests, mentions, retries, and model deprecation alerts.

- [#2216](https://github.com/phaseoteam/Phaseo/pull/2216) [`18939f5`](https://github.com/phaseoteam/Phaseo/commit/18939f558b73f2d6e383c8614f8a5e64596ae210) Thanks [@DanielButler1](https://github.com/DanielButler1)! - List Video and Batch as invite-only Feature Previews with gate-based availability and links to the beta documentation and job logs.

- [#2050](https://github.com/phaseoteam/Phaseo/pull/2050) [`f519fd6`](https://github.com/phaseoteam/Phaseo/commit/f519fd6224c5de39bd2e93dc0ce1f07e664c1a3b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Support dropping files onto the Chat composer, including HEIC and AVIF images whose MIME type is missing or reported generically by the browser.

- [#2412](https://github.com/phaseoteam/Phaseo/pull/2412) [`f3101b1`](https://github.com/phaseoteam/Phaseo/commit/f3101b16bffcefa38209bde58cabfed58acb4dd0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Run Cloudflare model discovery with bounded in-invocation concurrency, deliver optional Slack alerts with Discord model embeds, and route detections into an admin-only review queue without publishing or enabling models automatically.

- [#1968](https://github.com/phaseoteam/Phaseo/pull/1968) [`ee21942`](https://github.com/phaseoteam/Phaseo/commit/ee219420268a1e92caaee2192c61f9d6b9f87d83) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add independent light and dark logo previews to the brand menu.

- [#2280](https://github.com/phaseoteam/Phaseo/pull/2280) [`0a7d732`](https://github.com/phaseoteam/Phaseo/commit/0a7d73266c2dbc1f0dde0ddd5077ae09626a9460) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Let model pages switch between Artificial Analysis configurations and compare index results inline.

- [#1656](https://github.com/phaseoteam/Phaseo/pull/1656) [`933df4c`](https://github.com/phaseoteam/Phaseo/commit/933df4ce3dd63a93a55a88b50623cab5441f09a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral OCR 4.1 with active gateway routing and verified standard and Batch API pricing.

- [#2264](https://github.com/phaseoteam/Phaseo/pull/2264) [`6b955c0`](https://github.com/phaseoteam/Phaseo/commit/6b955c0b9aa947ff451c2076103c92d7ef7865db) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Feature Artificial Analysis Intelligence, Coding, Agentic and evaluation cost across model pages, the benchmark directory, detail pages, and rankings. Add searchable results, explicit index versions, official attribution, and a daily catalog sync with configurable source-model mappings. Preserve other benchmark results and rank evaluation cost lower-first.

- [#1266](https://github.com/phaseoteam/Phaseo/pull/1266) [`0674f8b`](https://github.com/phaseoteam/Phaseo/commit/0674f8b85f05f707a423d69c1e368be9b020cafc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit previous, next, and family navigation to model About sections, attach model licence sources directly to licence metadata, modernise dedicated family pages with recent-first ordering, consolidate codename variants into their canonical generation families, and enforce model lineage integrity during catalog validation.

- [#1889](https://github.com/phaseoteam/Phaseo/pull/1889) [`4724cdf`](https://github.com/phaseoteam/Phaseo/commit/4724cdfbe84481f22e563bdc4e088b3dbbaa05cd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Complete the STACKIT shared-model catalogue with verified EU01 availability, limits, exact provider identifiers, and EUR pricing.

- [#2257](https://github.com/phaseoteam/Phaseo/pull/2257) [`376cb01`](https://github.com/phaseoteam/Phaseo/commit/376cb011bd12bf7d63ec4d621d1e1ad365afd122) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redesign async webhook settings with a guided endpoint editor, friendly event subscriptions, endpoint ID handoff, secret rotation safeguards, and validated endpoint updates.

- [#1299](https://github.com/phaseoteam/Phaseo/pull/1299) [`b8c68b2`](https://github.com/phaseoteam/Phaseo/commit/b8c68b2e65bc6ed4be6cfae14e65a80cd852e1c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Increase the monthly BYOK allowance to one million requests and reduce the service fee after the allowance to 2.5%.

- [#1736](https://github.com/phaseoteam/Phaseo/pull/1736) [`2192bd0`](https://github.com/phaseoteam/Phaseo/commit/2192bd0bd0c0fa7abaa780a47e3f5fbfd639a105) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align non-text chat rooms with consistent generating states, response timestamps, and optimistic prompt handling.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record normalized request client attribution, declare official SDK identities, and show request sources in workspace usage logs.

- [#1286](https://github.com/phaseoteam/Phaseo/pull/1286) [`7be11cd`](https://github.com/phaseoteam/Phaseo/commit/7be11cd461a2cb5243c8e5c3db376cdee879a113) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit discounted data contribution with up to 100% redacted prompt/response retention, independently sampled upstream classification, private R2 storage, persistent task rollups, audited consent controls, and matching CLI and web management surfaces. The feature ships fail-closed behind an admin-only Statsig preview gate. Failed, incomplete, and empty upstream generations are not billed.

- [#1484](https://github.com/phaseoteam/Phaseo/pull/1484) [`6a6e243`](https://github.com/phaseoteam/Phaseo/commit/6a6e24367329cc959dd21939855f38439edaa9aa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent cross-site cookie sessions from being upgraded to bearer credentials by the web proxy, and require explicit persistence for workspace selection.

- [#1499](https://github.com/phaseoteam/Phaseo/pull/1499) [`c8b8032`](https://github.com/phaseoteam/Phaseo/commit/c8b8032c64a412b47daa4debd25db0be2750fb12) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Display provider duration in readable seconds or minutes, record ITL from observed provider stream cadence, and chart cached input percentage by provider over time.

- [#2090](https://github.com/phaseoteam/Phaseo/pull/2090) [`649dc00`](https://github.com/phaseoteam/Phaseo/commit/649dc00ee648c17349807a2c77628b7c66f55537) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show model performance as hourly provider trends over seven days, validate tool calls and structured responses by failure reason, calculate cache reuse from cached-read and input tokens, surface ordinary performance and uptime observations from the first request, and compact the model uptime presentation. Cache-derived metrics retain their larger telemetry threshold.

- [#1529](https://github.com/phaseoteam/Phaseo/pull/1529) [`ecfc043`](https://github.com/phaseoteam/Phaseo/commit/ecfc04377cbaf19285e3747368dccb6240d875e8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a public image and audio provenance checker backed by OpenAI, surface verification guidance on relevant model pages, and reorganise the public tools collection.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add inherited provider and route geographic availability policies, request-origin country and subdivision enforcement, published upstream restrictions for OpenAI, Anthropic, Gemini API, ElevenLabs, Z.AI, and LongCat, fallback diagnostics, and a dedicated unavailable-region API response. Require users to confirm their location and acknowledge the displayed restrictions before purchasing credits, serve the creator-branded model preview through a short-lived edge-cached web API projection, and collect full billing addresses for new-card checkouts.

- [#1725](https://github.com/phaseoteam/Phaseo/pull/1725) [`b54fc93`](https://github.com/phaseoteam/Phaseo/commit/b54fc93129a30d7f5145a81d20f453d70432471a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix unwanted settings page overflow and use consistent horizontal scroll areas across usage log tables.

- [#2315](https://github.com/phaseoteam/Phaseo/pull/2315) [`711adc6`](https://github.com/phaseoteam/Phaseo/commit/711adc6fda54907123ca0c9353752b79364fa532) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Link public catalog correction buttons to prefilled GitHub issues and document database-backed catalog contributions.

- [#2341](https://github.com/phaseoteam/Phaseo/pull/2341) [`958c322`](https://github.com/phaseoteam/Phaseo/commit/958c322ed2e932c49f2d96c57c1d5e7d090fcd36) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show cache rates by provider in model performance charts and use percentile bands for single-provider models.

- [#1459](https://github.com/phaseoteam/Phaseo/pull/1459) [`ebdb856`](https://github.com/phaseoteam/Phaseo/commit/ebdb856688b1fae92b54f26fed1f719d34e93370) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Thinking Orb activity indicators to chat and introduce an acknowledgements page for the open-source projects and design work behind Phaseo.

- [#2357](https://github.com/phaseoteam/Phaseo/pull/2357) [`b5c98c2`](https://github.com/phaseoteam/Phaseo/commit/b5c98c267eb2ac9134da7a099ffa5e5ee3a73991) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add per-model service tier selection to the chat room and pass explicit Priority or Flex choices to the gateway.

- [#2079](https://github.com/phaseoteam/Phaseo/pull/2079) [`def2b18`](https://github.com/phaseoteam/Phaseo/commit/def2b187ceca2dbb0530a2ae0062cfa9f8b5df2b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Clarify documented, partial, and unknown parameter support in provider sheets.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep Phaseo Chat in App attribution and enforce an exhaustive Source taxonomy for Direct HTTP, SDKs, agent SDKs, coding agents, and recognized HTTP clients.

- [#1488](https://github.com/phaseoteam/Phaseo/pull/1488) [`884620f`](https://github.com/phaseoteam/Phaseo/commit/884620fb27d03addda84aa76d67d8752b67d255f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the AI SDK provider Node requirement with AI SDK 7, harden malformed catalogue 404 paths, and correct catalogue manifest and importer-state validation gaps.

- [#2358](https://github.com/phaseoteam/Phaseo/pull/2358) [`85713c3`](https://github.com/phaseoteam/Phaseo/commit/85713c3f33c85424a82b7d7cfe9506943f408871) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep Flex provider pricing rows labeled by their service tier without adding opt-in text to the provider name.

- [#2100](https://github.com/phaseoteam/Phaseo/pull/2100) [`7bf8a09`](https://github.com/phaseoteam/Phaseo/commit/7bf8a09b3ccddd37e4f78a2a4514743a32205e02) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show actionable, status-specific recovery guidance for failed Chat requests.

- [#2318](https://github.com/phaseoteam/Phaseo/pull/2318) [`ceafdab`](https://github.com/phaseoteam/Phaseo/commit/ceafdab7a3e708ad644233cacac9e2afb827e4c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve pricing history tooltips and connect pricing table row hover to the matching chart series.

- [#1954](https://github.com/phaseoteam/Phaseo/pull/1954) [`f6c9ea0`](https://github.com/phaseoteam/Phaseo/commit/f6c9ea0d9dd99a6c2c7412b90060e2f281d1c564) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Simplify public provider privacy metadata into Data Policy, ZDR, and location fields, while exposing the canonical policy metadata in model pricing responses.

- [#2415](https://github.com/phaseoteam/Phaseo/pull/2415) [`7daaaa7`](https://github.com/phaseoteam/Phaseo/commit/7daaaa7e393754ec0d8ef1d6ebe6c84e0473e1f7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record Phaseo routing time in request logs and show a response timeline with separate provider waiting and streaming generation durations. Simplify routing decisions while retaining technical diagnostics in expandable sections.
  
  Add configurable Requests table columns with saved visibility, ordering, pinned columns and row density, including Phaseo overhead, token throughput, provider time to first token and API key names.
  
  Align responsive settings navigation and log toolbars, and share the compact Table Settings controls for future log tables.
  
  Extend saved table settings to upstream generations, sessions, videos and batches. Show final providers and attempt totals per generation, and pair session primary models with their actual providers.
  
  Align realtime sessions with shared table settings, scrolling, and pagination, including bounded page sizes.

- [#2057](https://github.com/phaseoteam/Phaseo/pull/2057) [`f3bc535`](https://github.com/phaseoteam/Phaseo/commit/f3bc535bdd1a04df05ba1ada2220526fbd5da9e3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep model discovery limited to routable Gateway models by default and clarify catalog, telemetry-window, status, and reliability claims across the public site and documentation.

- [#2260](https://github.com/phaseoteam/Phaseo/pull/2260) [`c9d8d34`](https://github.com/phaseoteam/Phaseo/commit/c9d8d3482e94f8b6b191faf75d4943260c6d1bfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make dynamic routing a compact workspace with a viewport-sized flow editor and searchable API key selection.

- [#2313](https://github.com/phaseoteam/Phaseo/pull/2313) [`ad1c2c9`](https://github.com/phaseoteam/Phaseo/commit/ad1c2c93316321acd810d1314f09a7f4caa05a6d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Complete database-backed catalog management with registry editors and a reviewed provider pricing queue. Retire JSON imports, sync benchmarks directly to the database, and generate catalog enums from daily public database exports.

- [#2331](https://github.com/phaseoteam/Phaseo/pull/2331) [`224de9f`](https://github.com/phaseoteam/Phaseo/commit/224de9feb623c4e9877f47e71df6e603fc10a7d5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh both the Worker data cache and the website page cache from the developer menu, then reload the page to discard stale section state. Include effective pricing in model and catalogue purges, and make browser requests for model sections recheck the shared cache.

- [#1386](https://github.com/phaseoteam/Phaseo/pull/1386) [`6844207`](https://github.com/phaseoteam/Phaseo/commit/6844207e1d784289fb85150bca0b7557fec248e6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the complete official DeepSeek V4 Flash 0731 agent benchmark set and expose the newly catalogued benchmark identifiers through the API and generated SDKs.

- [#1379](https://github.com/phaseoteam/Phaseo/pull/1379) [`cc07f80`](https://github.com/phaseoteam/Phaseo/commit/cc07f808d2bc79305ad06ba2d0a982ddb01d0379) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Model DeepSeek V4 Flash 0731 as a separate catalogue and callable model, preserve the original V4 Flash and its third-party deployments, and move only DeepSeek's current direct route and pricing to the 0731 revision.

- [#1373](https://github.com/phaseoteam/Phaseo/pull/1373) [`ae8874c`](https://github.com/phaseoteam/Phaseo/commit/ae8874cc0c9cba19c774b63aa15cb35d788dfa77) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route official DeepSeek V4 Flash requests through DeepSeek's native Responses API, keep V4 Pro on Chat Completions, refresh V4 Flash metadata and pricing verification, and retire the discontinued direct DeepSeek legacy aliases.

- [#1974](https://github.com/phaseoteam/Phaseo/pull/1974) [`a45e0c4`](https://github.com/phaseoteam/Phaseo/commit/a45e0c46b08b2186765ac4f9de7589cd2c35de55) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Rank global search results purely by relevance while preserving newest-first model ordering for tied matches.

- [#2346](https://github.com/phaseoteam/Phaseo/pull/2346) [`23b6c5a`](https://github.com/phaseoteam/Phaseo/commit/23b6c5a40117bdbc1d6e0f5ff6590332f9552454) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh public model caches after catalogue edits, shorten mutable Cloudflare freshness windows, recheck catalogue and model pages when a tab resumes, and stream model detail sections after the overview. Make gateway model responses immediately revalidate in client caches. The manual model purge now expires the entire model route, while search uses a short Cloudflare cache and refetches directly on return instead of requiring a browser generation counter.

- [#2392](https://github.com/phaseoteam/Phaseo/pull/2392) [`4b3dcf0`](https://github.com/phaseoteam/Phaseo/commit/4b3dcf0a4b4d40db5c47dc321c049df6e2a7b05b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix account country changes by using a scoped profile update instead of an upsert that attempts to write the protected user ID.

- [#2389](https://github.com/phaseoteam/Phaseo/pull/2389) [`446241d`](https://github.com/phaseoteam/Phaseo/commit/446241d6e2c0ea81fd512899ef578b901c33eb00) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enforce account and workspace guardrails in the chat model picker and support modifier-click multi-model selection.

- [#2405](https://github.com/phaseoteam/Phaseo/pull/2405) [`d67b44d`](https://github.com/phaseoteam/Phaseo/commit/d67b44dd5217c6ff1a95f00a4cb3a2106692e160) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use the canonical website URL configuration for Stripe checkout redirects.

- [#2343](https://github.com/phaseoteam/Phaseo/pull/2343) [`1beb1e7`](https://github.com/phaseoteam/Phaseo/commit/1beb1e7e10b975cd4cdcf1f97e58d0633b4930c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Return aggregated cost totals needed for effective pricing, add performance fetches with 30-minute one-day, hourly three-day, and daily seven-day rollups, restore TTFT and end-to-end latency in daily provider trends, treat requests without reported cache usage as a zero cache rate, improve sparse charts, and evenly distribute model-section controls across mobile widths.

- [#2324](https://github.com/phaseoteam/Phaseo/pull/2324) [`c0ca8fc`](https://github.com/phaseoteam/Phaseo/commit/c0ca8fc97a07bb66ad8f8e1ca0ecc2c733e5389a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh model Open Graph and Twitter card images with balanced long-title wrapping, logo-aware spacing, anchored stats/footer layout, and Standard list pricing with promotion labels.

- [#2268](https://github.com/phaseoteam/Phaseo/pull/2268) [`47131a1`](https://github.com/phaseoteam/Phaseo/commit/47131a1167cf2fdbd328c15105943842457d0daf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent duplicate Phaseo branding in page titles and count distinct providers instead of route and capability records in model metadata.

- [#2403](https://github.com/phaseoteam/Phaseo/pull/2403) [`2c95fd3`](https://github.com/phaseoteam/Phaseo/commit/2c95fd3091d7de7bfd120f71d888cd969a826d77) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix workspace privacy controls so policy, provider, model, and log-storage changes save through the authenticated settings action.

- [#1655](https://github.com/phaseoteam/Phaseo/pull/1655) [`9b40c6f`](https://github.com/phaseoteam/Phaseo/commit/9b40c6f502cc12c6258e2bcdf60b509494d53433) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Baseten as a provider for DeepSeek V4 Pro 0813 while preserving the previous V4 Pro route and pricing history.

- [#1748](https://github.com/phaseoteam/Phaseo/pull/1748) [`e4f3bc3`](https://github.com/phaseoteam/Phaseo/commit/e4f3bc3f11edd1acc5fa0b62b346402f7af5cadb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose provider lifecycle status on the public provider index and label external providers with the model-page status treatment.

- [#2397](https://github.com/phaseoteam/Phaseo/pull/2397) [`f534528`](https://github.com/phaseoteam/Phaseo/commit/f53452829aa3d1c85ed8e99a87ebec45a90eff00) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add independent Batch and Video webhook event subscriptions, enforce supported event names, prevent cross-job-type fallback delivery, emit distinct batch expired, status-change, and progress events, and support signed one-shot test deliveries for saved endpoints.

- [#2216](https://github.com/phaseoteam/Phaseo/pull/2216) [`18939f5`](https://github.com/phaseoteam/Phaseo/commit/18939f558b73f2d6e383c8614f8a5e64596ae210) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden asynchronous video settlement and terminal webhook recovery, preserve batch pricing conditions, and add scoped video provider options and explicit frame inputs. Align AtlasCloud Seedance mappings and expose LTX status and content recovery.
  
  Journal video submissions across adapters, retain holds on uncertain outcomes, validate and enable MiniMax H3 Max after native lifecycle checks, and flag unexpected zero-cost completion of paid jobs. Persist webhook attempts before releasing delivery claims and expose provider submission state in job logs.
  
  Correct MiniMax V1 resolution validation and Google REST video requests, isolate provider identity during content retrieval, recheck webhook state after claiming delivery, and preserve terminal completion timestamps on repeated reads.

- [#2364](https://github.com/phaseoteam/Phaseo/pull/2364) [`f08527b`](https://github.com/phaseoteam/Phaseo/commit/f08527b6b344376421555d280a4c177121e0602d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hide zero-volume provider service tiers from observed pricing usage metrics.

- [#1930](https://github.com/phaseoteam/Phaseo/pull/1930) [`ec92a10`](https://github.com/phaseoteam/Phaseo/commit/ec92a1013fb4072d25e0b072cf446bf2319395a9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Canonicalize model slugs when importing model links, details, and page notices so aliased canonical ids no longer produce orphaned child rows that violate foreign keys during import.

- [#2136](https://github.com/phaseoteam/Phaseo/pull/2136) [`d686a0b`](https://github.com/phaseoteam/Phaseo/commit/d686a0bd3fe9025f6befac3172d563c1b5ff9031) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve model deprecation notifications, delivery routing, and lifecycle email presentation.

- [#2091](https://github.com/phaseoteam/Phaseo/pull/2091) [`1e0b959`](https://github.com/phaseoteam/Phaseo/commit/1e0b959a4f11767a97c581d1d907af36ad904637) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align homepage model prices with the lowest active standard route available through the Phaseo gateway.

- [#2160](https://github.com/phaseoteam/Phaseo/pull/2160) [`c029f44`](https://github.com/phaseoteam/Phaseo/commit/c029f4455b3a2d0fff6948544cbd9108095ed234) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Migrate shared class-name merging from clsx and tailwind-merge to cn.

- [#2095](https://github.com/phaseoteam/Phaseo/pull/2095) [`3df7fc9`](https://github.com/phaseoteam/Phaseo/commit/3df7fc997253b1395e7d00e1a5bb4c104bc5c3e3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add shareable provider inspector URL state to model pages.

- [#1768](https://github.com/phaseoteam/Phaseo/pull/1768) [`176468a`](https://github.com/phaseoteam/Phaseo/commit/176468a0c01787268c2147bde62faaf0f9590386) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce model-watcher noise and storage: disable Discord alerts for internal Phaseo pricing-rule edits by default, drop Kilo Gateway, NanoGPT, and Hugging Face Router from discovery registries, store compact per-model watch snapshots instead of raw provider payloads, persist only cross-run diff state in run summaries, report official pricing-page changes as added/removed price lines, and enrich the catalog exclusively from live provider fetches.

- [#2299](https://github.com/phaseoteam/Phaseo/pull/2299) [`d6df87f`](https://github.com/phaseoteam/Phaseo/commit/d6df87ff81adae912b5551848ff1446fe1c08961) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Revalidate the models catalogue when a stale browser tab becomes active again, while preserving the selected filters and sorting.

- [#2270](https://github.com/phaseoteam/Phaseo/pull/2270) [`aeadbd1`](https://github.com/phaseoteam/Phaseo/commit/aeadbd1e5fc584cdfb401377510645c48d9bd6f8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh country and subscription plan pages with consistent corners, shared UI components, and Lucide icons.

- [#1755](https://github.com/phaseoteam/Phaseo/pull/1755) [`daa1b56`](https://github.com/phaseoteam/Phaseo/commit/daa1b5606da7c1a67910542350d95e080c18e506) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider sidebar filters for BYOK availability, legal policy links, prompt training, and data retention.

- [#1732](https://github.com/phaseoteam/Phaseo/pull/1732) [`3a5549e`](https://github.com/phaseoteam/Phaseo/commit/3a5549e0fa0ba9e8d07d6721fc4aa509a5c07591) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Organize footer decision resources into a dedicated section and tighten mobile column spacing.

- [#2366](https://github.com/phaseoteam/Phaseo/pull/2366) [`e3bf8b2`](https://github.com/phaseoteam/Phaseo/commit/e3bf8b2f5cf303c363ffc154259a968e68529ea3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep zero-volume provider tiers expandable in Effective pricing details.

- [#2220](https://github.com/phaseoteam/Phaseo/pull/2220) [`368318f`](https://github.com/phaseoteam/Phaseo/commit/368318f96ef2d28f80c42997e0037f75ba8658e5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject malformed pricing units, unsupported currencies, unsafe debit amounts and incomplete priced subtotals. Preserve reference-input charges for per-clip video pricing and correct stable Vertex Veo rates to bill output seconds.
  
  Retire obsolete catalog-owned billing meters when a SKU's billing unit changes, preserving historical meter references and protected pricing overrides.
  
  Preserve LTX audio-to-video billing during terminal status/content reads and exclude retired meters from public pricing projections.

- [#2004](https://github.com/phaseoteam/Phaseo/pull/2004) [`e877553`](https://github.com/phaseoteam/Phaseo/commit/e877553e68bb1477d071cf2b56cf2db8d131d7cf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Protect database-owned stealth routes from catalogue reconciliation and expose their provider identity as `stealth` across public model and pricing surfaces.

- [#2387](https://github.com/phaseoteam/Phaseo/pull/2387) [`a4badb2`](https://github.com/phaseoteam/Phaseo/commit/a4badb298a46539fa08bdb4ae371d0dbe3b4ebaf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Move public data issue reporting into a contextual page-level feedback strip.

- [#1648](https://github.com/phaseoteam/Phaseo/pull/1648) [`949cb67`](https://github.com/phaseoteam/Phaseo/commit/949cb67df3675d0610b89f7e670abe7685aebcfd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare Gemini 3.7 Flash with the published Google Cloud SKU pricing matrix for Google AI Studio and Vertex AI, add cached video-token pricing support, and mark recent Gemini Flash models as closed weight.

- [#1721](https://github.com/phaseoteam/Phaseo/pull/1721) [`1559d64`](https://github.com/phaseoteam/Phaseo/commit/1559d6495adf3fa7e08f1ad1372e0c928ef465c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add optional user-defined app attribution while keeping SDK client identity separate from workspace apps.

- [#2411](https://github.com/phaseoteam/Phaseo/pull/2411) [`d2f0045`](https://github.com/phaseoteam/Phaseo/commit/d2f0045c4addeefde82e71d8c01916e4a858b165) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the Epoch benchmark presentation with Artificial Analysis on model pages.

- [#2401](https://github.com/phaseoteam/Phaseo/pull/2401) [`0c81e79`](https://github.com/phaseoteam/Phaseo/commit/0c81e793790bd6605751c296d583ee12c8f17b3f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require explicit risk acknowledgement before enabling Auto Top-Up without two-factor authentication, and surface a security warning for existing configurations.

- [#1731](https://github.com/phaseoteam/Phaseo/pull/1731) [`5208ad7`](https://github.com/phaseoteam/Phaseo/commit/5208ad75a02165d3c64b8013b1be46643ee99f1c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hide unsupported document, file, and action modalities from model catalogue filters.

- [#1487](https://github.com/phaseoteam/Phaseo/pull/1487) [`3b7bc28`](https://github.com/phaseoteam/Phaseo/commit/3b7bc285ad0bcf49638553b12eca3056cf9477df) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep private workspace search results out of persistent command-palette pins and remove legacy workspace pins from browser storage.

- [#1739](https://github.com/phaseoteam/Phaseo/pull/1739) [`2386165`](https://github.com/phaseoteam/Phaseo/commit/23861652aedfdb8e1100bfba01145d6d48a21c35) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a Providers page filter for inactive providers with no routable models.

- [#2256](https://github.com/phaseoteam/Phaseo/pull/2256) [`7867966`](https://github.com/phaseoteam/Phaseo/commit/7867966ca6bbb573b2930dab5d6cae5e37cee78c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use Stripe-hosted receipts for wallet credit purchases instead of presenting the action as an invoice download.

- [#2259](https://github.com/phaseoteam/Phaseo/pull/2259) [`ba2bbe7`](https://github.com/phaseoteam/Phaseo/commit/ba2bbe725a1c88a8c4a7262bfeb2a2b3c8286d94) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add settings sidebar filtering, expand global search page coverage and contextual suggestions, and show notification destination logos in dropdown options and selections.

- [#2340](https://github.com/phaseoteam/Phaseo/pull/2340) [`9c96fa7`](https://github.com/phaseoteam/Phaseo/commit/9c96fa760b456c62a16138654b1b5512580b024d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an admin review queue for unresolved realtime billing with evidence-based capture, audited hold decisions, and separate access restoration.

- [#2227](https://github.com/phaseoteam/Phaseo/pull/2227) [`feb2404`](https://github.com/phaseoteam/Phaseo/commit/feb240478dba08ee271150f8ede65d41493ff54b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix Realtime Chat authentication and session setup, preserve cached-token billing across normalization, and show database-backed session holds and final charges in Chat and Realtime Sessions logs.
  
  Correct the current OpenAI Realtime price cards and refresh generated model suggestions to remove expired MiniMax free routes. Model request fields continue to accept arbitrary string IDs; this catalogue refresh does not remove request operations or change their wire format.

- [#2239](https://github.com/phaseoteam/Phaseo/pull/2239) [`d4e1284`](https://github.com/phaseoteam/Phaseo/commit/d4e1284a0920e738aca0a07bbcda6c7006bbef99) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Allow Phaseo to request microphone permission for Realtime and Chat audio recording. Previously the site-wide Permissions-Policy blocked capture before the browser could ask for consent. Camera and location access remain disabled, and microphone access remains restricted to the same origin.

- [#2242](https://github.com/phaseoteam/Phaseo/pull/2242) [`aae218a`](https://github.com/phaseoteam/Phaseo/commit/aae218a8b6ba2d7fcff1d6d119403c68e1aa37d2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable tested OpenAI Realtime 1.5, 2, 2.1 and 2.1 Mini, and Grok Voice Think Fast 2.0 for the gated Realtime preview. Use provider acknowledgements to settle OpenAI's uncommitted audio, preserve quiet speech, keep missing final usage unresolved, meter Grok PCM precisely, and correct model-specific cost estimates.

- [#2243](https://github.com/phaseoteam/Phaseo/pull/2243) [`09201e3`](https://github.com/phaseoteam/Phaseo/commit/09201e32b25ddbbc748645ab581f9a6ed8761026) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace realtime session cards with a compact usage table and a detail side sheet for billing, lifecycle, and usage.

- [#2241](https://github.com/phaseoteam/Phaseo/pull/2241) [`a0ebaae`](https://github.com/phaseoteam/Phaseo/commit/a0ebaaeb497c0ee7a820f5f915425f92eaa65894) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix Google Realtime silence handling and turn completion so completed conversations settle their usage and release unused holds. Authenticate Chat billing polling and distinguish estimates, final charges, and released credit in the session display.

- [#2099](https://github.com/phaseoteam/Phaseo/pull/2099) [`60a383f`](https://github.com/phaseoteam/Phaseo/commit/60a383f0061238b17c0f092ed8f49ddc1883507a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redirect legacy model subroutes to their canonical model pages.

- [#2391](https://github.com/phaseoteam/Phaseo/pull/2391) [`71f2104`](https://github.com/phaseoteam/Phaseo/commit/71f21048eec5c01584ea30eb0386e80c517c27f9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh landing-page model showcases, gateway fallbacks, and integration examples to current model IDs.

- [#2394](https://github.com/phaseoteam/Phaseo/pull/2394) [`fa3f1ce`](https://github.com/phaseoteam/Phaseo/commit/fa3f1ceb990ecd3676f1f192eecaf5e4e436fe73) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the illustrative qualifier from the landing-page model card latency and throughput labels.

- [#2356](https://github.com/phaseoteam/Phaseo/pull/2356) [`654f8d3`](https://github.com/phaseoteam/Phaseo/commit/654f8d31da3638efa95816269127671a572ad8a8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Treat omitted and `default` text service tiers as Standard when choosing providers, require explicit Flex for dedicated Flex offers, and label Flex pricing as opt-in on model pages.

- [#1728](https://github.com/phaseoteam/Phaseo/pull/1728) [`a10b097`](https://github.com/phaseoteam/Phaseo/commit/a10b0974ceea8d04a2a6bf38a1ebb8158976d902) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore unsent Chat prompts after authentication redirects.

- [#2393](https://github.com/phaseoteam/Phaseo/pull/2393) [`b0de7d6`](https://github.com/phaseoteam/Phaseo/commit/b0de7d6c6ea0e2beab22fcdf12cfeb57d1fcf03f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore per-model illustrative latency and throughput values in the animated landing-page model card.

- [#1720](https://github.com/phaseoteam/Phaseo/pull/1720) [`394f893`](https://github.com/phaseoteam/Phaseo/commit/394f89351773becb2adb3cf4e53aa6b3c68ceb6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep request-log details recoverable when historical fields are missing or loading fails, and attribute Phaseo Chat gateway requests to the Phaseo Chat app.

- [#2388](https://github.com/phaseoteam/Phaseo/pull/2388) [`b79d3ea`](https://github.com/phaseoteam/Phaseo/commit/b79d3ea6b4ecb22e69523e75b3d411590f55d6cc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retire CrofAI from active routing, discovery, and provider surfaces while preserving its identity, pricing history, request history, and logo for historical records.

- [#1830](https://github.com/phaseoteam/Phaseo/pull/1830) [`7626284`](https://github.com/phaseoteam/Phaseo/commit/7626284bedd85de7c5ad34e0792e384a17143fa5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Let workspace administrators choose notification destinations separately for each alert type.

- [#1881](https://github.com/phaseoteam/Phaseo/pull/1881) [`56aa0d4`](https://github.com/phaseoteam/Phaseo/commit/56aa0d46971aa75b88c0238dc77ee7cf0fba0161) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expand the Runway provider catalog across its current video, image, audio, upscaling, and real-time APIs, preserve retired model history, and add complete official credit pricing including per-frame video upscaling.

- [#1733](https://github.com/phaseoteam/Phaseo/pull/1733) [`83fbddf`](https://github.com/phaseoteam/Phaseo/commit/83fbddf9fe7fca0153b0b553e56dbe696344b849) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep model-card metadata and modality badges on horizontally scrollable lines without visible scrollbars.

- [#2328](https://github.com/phaseoteam/Phaseo/pull/2328) [`708d1b9`](https://github.com/phaseoteam/Phaseo/commit/708d1b9f488c77217554b31ee30e963db60fe9ac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden pricing, batch credentials and downloads, directory administration, telemetry privacy, public metadata, release tooling, and catalogue routing against the latest cloud security findings.

- [#1616](https://github.com/phaseoteam/Phaseo/pull/1616) [`fb7df5e`](https://github.com/phaseoteam/Phaseo/commit/fb7df5ea84775c12b41a592a66c166a15159d63f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject oversized Stripe checkout webhook request bodies with HTTP 413.

- [#937](https://github.com/phaseoteam/Phaseo/pull/937) [`390a840`](https://github.com/phaseoteam/Phaseo/commit/390a8405b3c560fc2f3f4210e42bbb2e86b2430d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add BytePlus Seedream 5.0 Pro catalog, pricing, and gateway image generation/edit support.

- [#1651](https://github.com/phaseoteam/Phaseo/pull/1651) [`c03f9c6`](https://github.com/phaseoteam/Phaseo/commit/c03f9c659e8de088bf27a474f2872809d68b90ba) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forward DeepSeek V4 Pro 0813 reasoning efforts and show recurring time-window pricing changes in model history charts.

- [#2097](https://github.com/phaseoteam/Phaseo/pull/2097) [`f24db49`](https://github.com/phaseoteam/Phaseo/commit/f24db49d4ed8617f84493c34c3a80c4ae960cb22) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show workspace names instead of workspace IDs in the CLI activation selector.

- [#2303](https://github.com/phaseoteam/Phaseo/pull/2303) [`c5bbd5d`](https://github.com/phaseoteam/Phaseo/commit/c5bbd5dd9f2a203336380dff0d958e8c3f536291) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show BYOK-only status on model provider rows and add provider-key setup to Quickstart when no managed route is available.

- [#2359](https://github.com/phaseoteam/Phaseo/pull/2359) [`2c1f497`](https://github.com/phaseoteam/Phaseo/commit/2c1f49720c72b5f4a558f02942ce85a6e108766d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show streamed reasoning in the chat room before the provider starts sending answer text.

- [#2196](https://github.com/phaseoteam/Phaseo/pull/2196) [`8f93b5b`](https://github.com/phaseoteam/Phaseo/commit/8f93b5be0558102e2a555573b81581b30671dda2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show mapped model providers and published pricing even before their Phaseo gateway route is active, including Astra's coming-soon OpenAI pricing. Attribute runtime health and performance to individual provider service tiers and sort each tier independently.

- [#1777](https://github.com/phaseoteam/Phaseo/pull/1777) [`4c82fc8`](https://github.com/phaseoteam/Phaseo/commit/4c82fc8e544dc3c75a97ce28e7243bd90629f099) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show active promotional pricing as discounts, including promotions without a fixed end date.

- [#2052](https://github.com/phaseoteam/Phaseo/pull/2052) [`3f5e095`](https://github.com/phaseoteam/Phaseo/commit/3f5e09520577af5a33705e9e68cf55be7f9abaa6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show copyable provider-qualified model IDs and explain their routing behavior in provider details.

- [#1730](https://github.com/phaseoteam/Phaseo/pull/1730) [`b7fb6a1`](https://github.com/phaseoteam/Phaseo/commit/b7fb6a1faa315a68ed4b39a230711c0ae3cbc613) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove redundant OpenRouter-specific links from the global footer navigation.

- [#2200](https://github.com/phaseoteam/Phaseo/pull/2200) [`79490ed`](https://github.com/phaseoteam/Phaseo/commit/79490ed7b6c215837e1b140c05b2d8039d0e8c61) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve mobile catalog navigation, attention filters, persistent save controls, and failed-save reporting. Preserve all catalog records in midnight UTC exports, including rows without update timestamps.
  
  Match catalog searches by display name and ID regardless of punctuation. Replace native editor controls with shared ShadCN components and simplify pricing into provider price groups with focused editing panels, guided charge selection, billing-unit conversion, and discardable drafts.
  
  Make long catalog dropdowns searchable and replace the provider grid and expanded forms with compact connected-route rows and a tabbed editor.
  
  Replace categorical text inputs with searchable choices. Preserve saved prices as dated versions, end-date catalogue relationships, and record baseline plus append-only row history across all catalogue tables. Keep ended records out of current public results and expose recent model changes in the internal editor.
  
  Create and edit regional offers from Providers, with parent families, region labels, residency settings and separate API endpoints. Show labelled offers in model selectors and preserve existing gateway routing flags.
  
  Warn before leaving unfinished catalog edits, including browser history navigation. Restore admin model notice saves with validation and complete history, reject malformed clear requests, and distinguish cache refresh failures from successful saves.
  
  Manage stealth provider routes from the catalog editor, with anonymous route IDs, preserved pricing history, and explicit public identity controls.

- [#2002](https://github.com/phaseoteam/Phaseo/pull/2002) [`7e74943`](https://github.com/phaseoteam/Phaseo/commit/7e7494325af6fe7cb3a5c3ca60da88c0c638bfd9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Support standalone free API model identities and migrate free-only catalogue entries away from synthetic base rows.

- [#2192](https://github.com/phaseoteam/Phaseo/pull/2192) [`db6655d`](https://github.com/phaseoteam/Phaseo/commit/db6655d67f421c5da80e6113f8e1b94a58f2149c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Correct GPT-6 Astra parameter metadata, preserve OpenAI Responses async tool settings, and pass OpenAI prompt cache options through the gateway.

- [#2351](https://github.com/phaseoteam/Phaseo/pull/2351) [`50f3b9c`](https://github.com/phaseoteam/Phaseo/commit/50f3b9c1b3fccd3844130a729a29d6b51f833b31) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Revalidate SWR data when a tab regains focus and every fifteen minutes while visible and online. Apply the same interval to model catalogue, provider pricing, and uptime data.

- [#2261](https://github.com/phaseoteam/Phaseo/pull/2261) [`a71f061`](https://github.com/phaseoteam/Phaseo/commit/a71f061a06efd8c5aee68af4fb6c098e79fa2e9d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Organise API keys by status and last use, add status filters, and avoid rerendering unchanged rows when selecting keys.

- [#2277](https://github.com/phaseoteam/Phaseo/pull/2277) [`5c491b4`](https://github.com/phaseoteam/Phaseo/commit/5c491b4d57d4ca730e6778f558b04590cc1a6ee2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retain removed catalogue records with end dates during import, retire obsolete route capabilities and aliases, and hide retired subscription plans from public reads.

- [#1489](https://github.com/phaseoteam/Phaseo/pull/1489) [`5f2183d`](https://github.com/phaseoteam/Phaseo/commit/5f2183d99d262baedab7b7e9e4902c0598342571) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve model performance filters on smaller screens, clarify empty chart states, add detailed chart tooltips, and give every percentile series a distinct colour.

- [#1874](https://github.com/phaseoteam/Phaseo/pull/1874) [`dda4e28`](https://github.com/phaseoteam/Phaseo/commit/dda4e2856e13d88e2b1be3ac9272db244e320e76) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile OrcaRouter's live model catalog, modalities, lifecycle state, protocol support, and published pricing.

- [#1751](https://github.com/phaseoteam/Phaseo/pull/1751) [`8dd51b8`](https://github.com/phaseoteam/Phaseo/commit/8dd51b82a33e14a7e4b78365a7aebba6bbc0cd71) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the provider-count header line and preserve 4:3 flag proportions in the Headquarters filter.

- [#1758](https://github.com/phaseoteam/Phaseo/pull/1758) [`06ba3d1`](https://github.com/phaseoteam/Phaseo/commit/06ba3d15134ab82dba4e275cdf52ea4cb9418273) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider datacenter filtering and align the Providers table controls with the Models page.

- [#2265](https://github.com/phaseoteam/Phaseo/pull/2265) [`8d5efa6`](https://github.com/phaseoteam/Phaseo/commit/8d5efa6d101e80636eb7644c76e1c6d52870fc31) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve regional provider names in request routing traces, usage views, provider catalogues, model availability and comparisons, pricing inspectors, playground models, and routing settings.

- [#2034](https://github.com/phaseoteam/Phaseo/pull/2034) [`03a1020`](https://github.com/phaseoteam/Phaseo/commit/03a10205c963bb5f119ff88f90896af42872318f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve capability- and service-tier-specific provider policy metadata in pricing responses and displays.

- [#1724](https://github.com/phaseoteam/Phaseo/pull/1724) [`16032a6`](https://github.com/phaseoteam/Phaseo/commit/16032a66724c7225ead621e7aee79e5c6a1607f7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve usage-log inspection with layered side sheets, session headline details, request navigation, generation lookup, and contextual row actions.

- [#2290](https://github.com/phaseoteam/Phaseo/pull/2290) [`28e193a`](https://github.com/phaseoteam/Phaseo/commit/28e193a56b8de33b9824c133aca81ba71d68d0ed) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update the Chat UI's default favourite models to the latest featured model versions.

- [#2219](https://github.com/phaseoteam/Phaseo/pull/2219) [`ed5b49f`](https://github.com/phaseoteam/Phaseo/commit/ed5b49f5bd212e27da58c45f00383049b5bc55a3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add missing LTX audio and resolution prices, correct BytePlus Seedance token tiers and OrcaRouter video units, and prevent automatic discovery from flattening conditional video prices into request fees. Document video billing dimensions.

- [#2201](https://github.com/phaseoteam/Phaseo/pull/2201) [`0d58d7d`](https://github.com/phaseoteam/Phaseo/commit/0d58d7dc0f9a894ce1438b9487f30c4286cd2039) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace-scoped Private Models with encrypted OpenAI-compatible endpoint credentials, management APIs, model discovery, and gateway routing.

- [#2266](https://github.com/phaseoteam/Phaseo/pull/2266) [`65ce750`](https://github.com/phaseoteam/Phaseo/commit/65ce7502a5b00c9b397a2e62b16d3ff4c7eac002) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Include a Resend-managed unsubscribe link in the welcome email's HTML and plain text.

- [#2400](https://github.com/phaseoteam/Phaseo/pull/2400) [`cb88438`](https://github.com/phaseoteam/Phaseo/commit/cb88438f5fd93ccbb49aedc55bbf918e3c7298bf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Scope privacy controls and provider guardrails to the active workspace, and initialize the active workspace cookie when it is missing.

## 1.1.0

### Minor Changes

- [#1172](https://github.com/phaseoteam/Phaseo/pull/1172) [`506bd06`](https://github.com/phaseoteam/Phaseo/commit/506bd066513418f19dd4c20b73b98637f035742b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose the asynchronous video API and playground behind coordinated, fail-closed rollout gates while preserving access to already accepted jobs.

### Patch Changes

- [#1021](https://github.com/phaseoteam/Phaseo/pull/1021) [`4f48229`](https://github.com/phaseoteam/Phaseo/commit/4f482299cc1db375ce04827c2e2fb0ed70f66c53) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an admin-gated passkey rollout and harden MFA sign-in, enrollment, session refresh, and account-management flows.

- [#966](https://github.com/phaseoteam/Phaseo/pull/966) [`482968d`](https://github.com/phaseoteam/Phaseo/commit/482968d7d66408b0af1c7683176db8a65a1e4601) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Gate PostHog and Google Analytics collection behind explicit analytics consent and add privacy-safe product milestone events for signup, onboarding, API keys, and credit purchases.

- [#1023](https://github.com/phaseoteam/Phaseo/pull/1023) [`703ca96`](https://github.com/phaseoteam/Phaseo/commit/703ca96f835deaac0b6c277b12cb8be84ec0e73f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Collapse the desktop settings sidebar to an accessible icon rail with navigation tooltips and an explicit expand control.

- [#1192](https://github.com/phaseoteam/Phaseo/pull/1192) [`a385a4b`](https://github.com/phaseoteam/Phaseo/commit/a385a4b93862b964964e099ee105c96cb7c0a279) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Import provider data-policy metadata into the public provider records used by the model catalogue.

- [#794](https://github.com/phaseoteam/Phaseo/pull/794) [`114713d`](https://github.com/phaseoteam/Phaseo/commit/114713dadf93fe7e722f08f9b31a21324d01daf5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Fireworks model discovery and catalog data to use the serverless-only models feed.

  This updates scheduled discovery to read the serverless Fireworks models route, handle paginated responses, and ignore any non-serverless rows defensively. It also refreshes the Fireworks catalog and pricing data to match the current live serverless inventory.

- [#1190](https://github.com/phaseoteam/Phaseo/pull/1190) [`b369191`](https://github.com/phaseoteam/Phaseo/commit/b369191ad0de6de2ec4850c558b06f2ee72fdbee) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route Gemini 3.6 Flash and Gemini 3.5 Flash-Lite through Google's current Interactions request shape, reject zero-output provider responses for failover, and show a structured error instead of persisting blank chat messages.

- [#948](https://github.com/phaseoteam/Phaseo/pull/948) [`c420a38`](https://github.com/phaseoteam/Phaseo/commit/c420a389be727d45daa13713658cd341081a5d3b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add GPT-5.6 Luna Pro, Sol Pro, and Terra Pro model IDs, routing them to OpenAI with `reasoning.mode=pro` while preserving separate public slugs.

- [#1032](https://github.com/phaseoteam/Phaseo/pull/1032) [`c8cd44c`](https://github.com/phaseoteam/Phaseo/commit/c8cd44cfcc7d6d48eb608dc19635266526a72468) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require explicit gateway consent before third-party OAuth can mint or use a user-funded delegated key, revoke previously issued low-scope keys, make the inference permission clear in the consent and client-management interfaces, and align refresh-token locking with immediate workspace revocation.

  Harden CLI OAuth token validation, local credential storage, Windows authorization URL launching, one-time OAuth client secret output, and backwards-compatible key-cache invalidation during the Phaseo environment-variable transition.

- [#1120](https://github.com/phaseoteam/Phaseo/pull/1120) [`b74b0da`](https://github.com/phaseoteam/Phaseo/commit/b74b0da67485853fc3dcc1f0152422da81b15221) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make time-windowed provider billing use the successful upstream fetch timestamp, persist the exact billing timestamp in pricing lines, avoid request-start fallback when authoritative timing is missing, and expire cached price cards at effective-date boundaries. Prepare DeepSeek V4 pricing rules to use upstream-send timing once official time windows become active. Show the currently active time-window rate in model provider tables and place it ahead of alternate period pricing in provider sheets.

- [#799](https://github.com/phaseoteam/Phaseo/pull/799) [`7d8ee28`](https://github.com/phaseoteam/Phaseo/commit/7d8ee28f7f6bef548111be15caa4de7bcc2c8147) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hook up the Meituan LongCat provider in scheduled model discovery and catalog data.

  This adds LongCat to the API model watcher, accepts the existing `MEITUAN_API_KEY` env alias in the API layer, and adds LongCat provider mapping and pricing data for `meituan/longcat-2.0-preview`.

- [#972](https://github.com/phaseoteam/Phaseo/pull/972) [`75a2493`](https://github.com/phaseoteam/Phaseo/commit/75a2493decb405a29a1fa29348ce8d6da3d601de) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden CLI OAuth sessions, key-pepper rotation, redirect handling, and abuse controls while moving the CLI to `api.phaseo.app`.

  Add filtered, workspace-scoped, redacted request log listing and per-request inspection to the Phaseo CLI.

- [#1042](https://github.com/phaseoteam/Phaseo/pull/1042) [`9e3749b`](https://github.com/phaseoteam/Phaseo/commit/9e3749bfdd06b2d10278787f7c0cfa67cfa4a56a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden OAuth and gateway-adjacent data access, webhook SSRF validation, error serialization, local credential handling, dependency security, and database RPC permissions following a repository-wide security audit.

- [#1018](https://github.com/phaseoteam/Phaseo/pull/1018) [`37656d9`](https://github.com/phaseoteam/Phaseo/commit/37656d9705173422b4a8e788134827989721c657) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Normalize the configured Gateway API URL to the versioned `/v1` base before publishing discovery and health endpoint metadata.

- [#1015](https://github.com/phaseoteam/Phaseo/pull/1015) [`8144b6c`](https://github.com/phaseoteam/Phaseo/commit/8144b6c7a9f4436345fb25c90de409b801007153) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Unify Amazon Bedrock on the Bedrock Mantle OpenAI-compatible provider, remove the Converse adapter path, and add GPT-5.6 Sol, Terra, and Luna catalog coverage.

- [#1123](https://github.com/phaseoteam/Phaseo/pull/1123) [`8209df0`](https://github.com/phaseoteam/Phaseo/commit/8209df0ed6a72ecf06fddb1f5fa029d73b6b7a20) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Unify and harden Phaseo OAuth discovery, consent, identity, revocation, PKCE, protected-resource binding, and confidential MCP-to-API token exchange across the first-party CLI, user-created applications, and dynamically registered MCP clients.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the web app, docs, and AI SDK provider with the coordinated major release.

  This captures breaking/structural updates tied to the gateway and SDK overhaul,
  including endpoint surface changes and updated integration expectations.

## 0.1.2

### Patch Changes

- [#6](https://github.com/phaseoteam/Phaseo/pull/6) [`4322886`](https://github.com/phaseoteam/Phaseo/commit/4322886327dde92030846969718c9131a2a30431) Thanks [@DanielButler1](https://github.com/DanielButler1)! - New Feature: Dark Mode!

## 0.1.1

### Patch Changes

- [`d322b30`](https://github.com/phaseoteam/Phaseo/commit/d322b30bbe33cde56ca80f17c5612c4609d58f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix minor issues with links, update country pages and add dynamic OG images
