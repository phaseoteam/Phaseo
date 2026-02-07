# 🤝 Contributing to AI Stats

Thank you for your interest in contributing!  
AI Stats is a community-driven project — built in public, by people who believe that AI should be **open**, **transparent**, and **accessible** to everyone.

This guide explains how you can get involved.

---

## 🧠 Our Philosophy

AI is reshaping the world — but access to it is increasingly closed off behind paywalls, restrictions, and vendor lock-ins.  
AI Stats exists to change that, by providing an **open, unified layer** that connects to every model, everywhere.

Whether you write code, improve docs, share ideas, or report bugs — you are helping keep AI open.

---

## 🛠️ Ways to Contribute

There are many ways to help — big or small:

### 🧩 1. Code Contributions

-   Fix a bug or refactor an existing function.
-   Add new routes, features, or utilities to the Gateway.
-   Improve the frontend or data visualisations on the website.
-   Write tests or performance improvements.

> 💡 Start with “good first issue” tags in [Issues](https://github.com/AI-Stats/AI-Stats/issues).

---

### 🧾 2. Data Contributions

-   Add or update **model metadata** (JSON files).
-   Contribute benchmark results or new provider integrations.
-   Help verify or validate existing data for accuracy.

---

### 🖋️ 3. Documentation

-   Improve clarity, add examples, or write new guides.
-   Translate or simplify sections for wider understanding.
-   Fix typos, broken links, or structure issues in Mintlify docs.

---

### 💬 4. Community & Ideas

-   Share feature suggestions or feedback in [Discussions](https://github.com/AI-Stats/AI-Stats/discussions).
-   Help onboard new contributors.
-   Spread awareness about the mission of AI openness.

---

## 🧰 Project Structure

```
ai-stats/
├── apps/
│ ├── web/ → Public Next.js website
│ ├── docs/ → Mintlify documentation
│ └── api/ → Cloudflare Workers Gateway
├── packages/ → Shared libraries & configs
└── data/ → JSON model and benchmark data
```

Each folder contains its own README with relevant context.

---

## ⚙️ Development Basics

To work on the project locally:

```bash
# Clone the repository
git clone https://github.com/AI-Stats/AI-Stats.git
cd AI-Stats

# Install dependencies
pnpm install

# Run all apps
pnpm dev
```

> You don’t need to run everything at once — work on the part that excites you most.

---

## ✅ Pull Request Guidelines

Fork the repository and create a new branch:
git checkout -b feature/my-improvement

Make your changes.

Write clear commit messages and PR descriptions.

Reference any related issues.

Open a PR for review.

We prefer small, focused PRs over giant ones ― they’re easier to review and merge.

---

## Release workflow

The monorepo now uses [changesets](https://github.com/changesets/changesets) to track releases for the SDK packages, the gateway API, and the web UI. To publish a release:

-   Run `pnpm changeset` and select the workspaces you want to release (for example `@ai-stats/ts-sdk`, `@ai-stats/gateway-api`, `@ai-stats/web`, or `@ai-stats/py-sdk`). The Python workspace exists solely for tooling and stays private.
    -   Run `pnpm changeset:version` to bump every affected `package.json`, emit changelog entries, and automatically sync `pyproject.toml`. The Mintlify docs site uses its own version selector, so `apps/docs/docs.json` (and its `api.version` entry) are maintained separately.
-   Use `pnpm sdk-py:sync-version` whenever you need to resync `pyproject.toml` (for example if you roll back a change or edit the file manually) before publishing to PyPI.

## Code of Conduct

AI Stats follows the Contributor Covenant
.
Be kind, respectful, and open-minded. This project thrives on good intent and shared curiosity.

## 🌍 Built in Public

Every line of code, every discussion, and every idea contributes to a movement:
keeping AI accessible, understandable, and transparent for all.

Thank you for being part of it.
— The AI Stats Team
