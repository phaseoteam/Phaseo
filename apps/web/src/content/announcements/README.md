# Blog Content

Create blog posts by adding `.mdx` files in this folder.

View them in the app at `/blog`.

## Frontmatter

Each file should start with YAML frontmatter:

```md
---
title: Your Blog Post Title
shortTitle: Optional shorter title for homepage cards.
description: A short summary shown in blog cards.
publishedAt: 2026-04-19
updatedAt: 2026-04-20
author: Phaseo Team
tags:
  - Release
  - Web
coverImage: /blog-images/your-image.png
draft: false
---
```

## Images

Put images in `apps/web/public/blog-images/` and reference them in MDX with:

```md
![Alt text](/blog-images/your-image.png)
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
