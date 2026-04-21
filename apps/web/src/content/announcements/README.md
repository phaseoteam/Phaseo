# Announcements Content

Create announcement posts by adding `.mdx` files in this folder.

View them in the app at `/announcements`.

## Frontmatter

Each file should start with YAML frontmatter:

```md
---
title: Your Announcement Title
description: A short summary shown in announcement cards.
publishedAt: 2026-04-19
updatedAt: 2026-04-20
author: AI Stats Team
tags:
  - Release
  - Web
coverImage: /announcements/your-image.png
draft: false
---
```

## Images

Put images in `apps/web/public/announcements/` and reference them in MDX with:

```md
![Alt text](/announcements/your-image.png)
```

## React Components In MDX

These components are available directly inside MDX:

- `<Callout title="..." tone="info|success|warning">...</Callout>`
- `<Counter initial={3} />`

Inline JSX expressions are also supported:

```mdx
{["One", "Two", "Three"].map((item) => (
  <li key={item}>{item}</li>
))}
```
