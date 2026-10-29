---
"@phaseo/slack-agent": minor
"@phaseo/web-api": minor
"@phaseo/web": minor
"@phaseo/docs": patch
---

The Slack agent can post charts and images in the thread, and read images and PDFs shared with it. `make_chart` draws a bar, line or pie chart from a small spec and uploads it as a PNG; `generate_image` makes an image with GPT Image 2 through the installation's key, its cost counted in the answer's $0.50 limit and footer. Images (up to 5 MB) and PDFs (up to 10 MB) shared with the message or earlier in the thread are downloaded for the answer and sent to the model when it reads them, and never stored. The app asks for the new `files:read` and `files:write` scopes; `slack_installations.bot_scopes` records what Slack granted, each feature checks it, and Settings → Slack offers **Update Slack permissions**, which reruns the install for the same installation and keeps its key, settings and data. The Slack agent guide describes it in every language.
