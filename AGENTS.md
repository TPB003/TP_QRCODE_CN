# TP QR CN repository guidelines

This repository is the independent Alibaba Cloud edition of TP QR. Do not add
Cloudflare Workers, D1, R2, Wrangler, or references to the other repository's
production resources here.

## Structure

```text
apps/web/                 React/Vite browser app
apps/api/                 Node.js 22/Hono API
packages/domain/          shared API and version contracts
packages/content/         seven content models and validators
packages/qr/              rendering, download, and decoding primitives
packages/ui/              visual tokens and reusable interface primitives
infra/aliyun/             Docker Compose, Caddy, Dockerfile, env template
infra/database/           SQLite migrations and fictional local seed
tests/                    unit, integration, browser, security, fixtures
docs/                     architecture, operations, testing, security
scripts/                  deterministic fixtures and repository checks
assets/open/              redistributable screenshots/assets only
```

The public repository contains reproducible source only. Never commit `.env`,
`.dev.vars`, production identifiers, OAuth/Resend/OSS secrets, ECS addresses,
personal QR payloads, real submissions, generated reports, or local SQLite and
asset files. Generated output belongs under ignored `tmp/`, `output/`,
`coverage/`, or `dist/`.

## Commands

Use Node.js 22.18+ and npm 10+:

```powershell
npm ci
npm run setup:local
npm run dev
```

Required gates are `npm run lint`, `npm run typecheck`, `npm run test:unit`,
`npm run test:integration`, `npm run test:security`, `npm run build`,
`npm run test:browser`, `npm run check:all`, `npm run check:opensource`, and
`git diff --check`.

Do not claim a command was tested unless it completed successfully. Browser
tests require a local Chromium/Chrome installation and cover desktop and mobile
viewports.

## Code and security conventions

Use strict TypeScript, spaces, focused modules, and existing formatter/linter
settings. Add a deterministic test for new behavior. Validate normal, empty,
Unicode, malicious, and boundary input. Treat all uploaded files and public
URLs as untrusted; enforce MIME/header/size checks, safe URL schemes,
authorization, rate limits, immutable published versions, and private OSS
access through the API.

Keep shared contracts in `packages/domain`, content validation in
`packages/content`, and browser-independent QR behavior in `packages/qr`.

## Pull requests

Use short imperative commit subjects. A PR must explain user-visible behavior,
tests run, compatibility decisions, documentation updates, and known limits.
Update README Features/Workflow for behavior changes, homepage screenshots for
visual/navigation changes, CLI docs for command changes, and deployment docs
for environment/domain/storage changes.
