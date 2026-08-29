# Open-source boundary

The public repository contains only source that another developer can rebuild:

- TypeScript/React/Hono source and repeatable SQLite migrations;
- fictional deterministic fixtures and small redistributable screenshots;
- placeholder configuration using `replace-with-*` values;
- tests, documentation, and license notices.

Never commit:

- `.env`, `.dev.vars`, OAuth/Resend/OSS secrets, ECS addresses, or private
  bucket names;
- SQLite files, uploaded media, personal QR codes, real submissions, logs,
  browser traces, or generated reports;
- production cookies, access tokens, API keys, or private keys.

Run `npm run check:opensource` before every release. Generated directories
(`tmp/`, `output/`, `dist/`, `coverage/`, `playwright-report/`, and
`test-results/`) are ignored. The Cloudflare implementation lives in the
separate `TPB003/TP_QRCODE` repository and is not copied into this one.
