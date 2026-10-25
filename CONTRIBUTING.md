# Contributing

## Repository workflow

- Search existing issues and pull requests before starting work.
- Open an Issue first for a feature or other substantial behavior change. A small typo or isolated documentation fix can go straight to a PR.
- Keep each PR focused on one Issue and one logical change. Use a branch such as `codex/123-short-description`.
- Link the Issue in the PR body with `Closes #123`. GitHub closes it when the PR is merged.
- Do not push directly to `main`. Wait for the required GitHub Actions checks to pass before merging.
- Automatic merge is opt-in through the `auto-merge` label; without it, keep the PR manual.

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

Before opening a PR, run:

```powershell
npm run check:all
git diff --check
```

Add a deterministic test for new behavior. In the PR description, report only
commands that you actually ran. GitHub Actions provides the authoritative
required check results.

Attach a screenshot or recording for visual changes and include the exact
test commands and results. Review the documentation-sync checklist:

- [ ] Features and workflow describe changed behavior.
- [ ] Homepage screenshot is current when homepage/navigation changed.
- [ ] CLI docs match changed commands.
- [ ] README and example files match changed environment variables.
- [ ] Deployment/auth docs match changed domain, storage, or login behavior.
- [ ] Internal-only changes explicitly explain why README did not change.

## Security

Do not put secrets, production identifiers, personal QR payloads, or real
submissions in commits. Report vulnerabilities privately using `SECURITY.md`.