---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
"@phaseo/web": minor
"@phaseo/sdk": patch
---

Add a routable `broadcast_destination_failing` notification. When a Broadcast destination has failed five requests in a row with nothing delivered for 15 minutes, workspaces that route this alert get one message per failing streak, at most once an hour, by email, Slack, Discord, Teams or webhook.
