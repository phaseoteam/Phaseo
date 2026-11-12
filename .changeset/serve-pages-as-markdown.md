---
"@phaseo/web": patch
---

Serve every page as Markdown to AI agents. Requests that prefer `Accept: text/markdown`, and any page URL with `.md` added, now get the page's main content as Markdown with its title, description and canonical URL in front matter, instead of a 406. HTML pages advertise their Markdown version in a `Link` header. AI assistants fetching a page for a user (Claude-User, ChatGPT-User, Perplexity-User, MistralAI-User) now get the page's real title and description in the first HTML.
