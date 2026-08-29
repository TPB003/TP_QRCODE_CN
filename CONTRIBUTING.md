# Contributing

## Development

Use Node.js 22.18+ and npm 10+. Install dependencies and initialise the local
SQLite database before changing the UI or API:

```powershell
npm ci
npm run setup:local
npm run dev
```

The API is Node/Hono and the browser is React/Vite. Cloudflare-specific code
belongs in the separate `TPB003/TP_QRCODE` repository and must not be copied
into this one.

## Pull requests

Keep changes focused and include a short user-facing summary. Before opening a
PR run:

```powershell
npm run check:all
npm run check:opensource
git diff --check
```

Please attach a screenshot or recording for visual changes and include the
exact test commands and results.

Review the documentation-sync checklist:

- [ ] Features and workflow describe changed behavior.
- [ ] Homepage screenshot is current when homepage/navigation changed.
- [ ] CLI docs match changed commands.
- [ ] README and example files match changed environment variables.
- [ ] Deployment/auth docs match changed domain, storage, or login behavior.
- [ ] Internal-only changes explicitly explain why README did not change.

## Security

Do not put secrets, production identifiers, personal QR payloads, or real
submissions in commits. Report vulnerabilities privately using `SECURITY.md`.
