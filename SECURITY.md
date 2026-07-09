# Security Policy

We take the security of this project seriously. This document explains how to report vulnerabilities and what you can expect from us when you do.

> **Important:** Please do **not** publicly disclose security issues (e.g. in GitHub Issues or Discussions) before we’ve had a chance to investigate and release a fix.

---

## Supported versions

Only actively maintained versions receive security updates.

| Version                              | Status        |
| ------------------------------------ | ------------- |
| `main`                               | Supported     |
| Tagged releases in the last 6 months | Supported     |
| Older releases                       | Not supported |

If you are running an older version, you may be asked to upgrade before we can fully investigate or provide a fix.

---

## Reporting a vulnerability

If you believe you’ve found a security vulnerability, please report it via **one** of the following methods:

1. **GitHub Security Advisory (preferred)**

    - Go to the repository page on GitHub
    - Click **Security → Report a vulnerability**
    - Follow the prompts to submit a private report

2. **Email**
    - Email: `security@phaseo.ai`
    - Subject: `SECURITY: <short summary>`

### What to include

To help us triage and fix issues quickly, please include as much of the following as possible:

-   A clear description of the issue and its impact
-   Steps to reproduce the problem
-   Any proof-of-concept code, screenshots, or logs
-   The version/commit you tested against
-   Your environment (OS, runtime, configuration, etc.)
-   Any suggested remediation ideas, if you have them

If you are unsure whether something is a vulnerability, report it anyway and we will clarify.

---

## Our commitment / response process

When you report a vulnerability responsibly, you can expect:

1. **Initial acknowledgement**  
   We aim to acknowledge reports within **3 business days**.

2. **Triage and validation**  
   We will verify the issue, assess impact and severity, and determine affected components/versions.

3. **Fix and release**

    - We will work on a fix as quickly as is practical, prioritising higher-impact vulnerabilities.
    - Where appropriate, we will create a private fix branch and prepare a security release.
    - We may ask you for additional details during this process.

4. **Disclosure**
    - By default, we will publish a short security note in the changelog or release notes when a fix is released.
    - Where a GitHub Security Advisory is used, we will publish it once a fix is available.
    - We will credit you for the discovery if you’d like, subject to your permission and any legal constraints.

---

## Scope

This policy covers:

-   The code in this repository
-   Any configuration files, scripts, or examples shipped as part of this project

It **does not** cover:

-   Third-party dependencies that we do not maintain
-   Services or projects that merely consume this code
-   Your own deployment configuration and infrastructure

If you believe an issue lies in a dependency, we may redirect you to the upstream project while we consider any mitigations required on our side.

---

## Safe harbour

We support good-faith security research.

-   As long as you act responsibly and within the law, we will not initiate legal action against you for:
    -   Reporting vulnerabilities to us
    -   Testing against your own instances of the project
-   Do **not**:
    -   Attempt to access data that is not yours
    -   Perform denial-of-service or destructive testing
    -   Breach privacy or disrupt other users

If you are unsure whether a particular type of testing is acceptable, contact us privately first.

---

Thank you for helping to keep this project and its users secure.
