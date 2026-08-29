# Maintainer CLI

Run the CLI without a global install:

```powershell
npm run tpqr -- doctor
npm run tpqr -- local setup
npm run tpqr -- check
npm run tpqr -- domain inspect tpqrcode.xyz
npm run tpqr -- oauth check
npm run tpqr -- deploy --environment staging --config tmp/env.staging --dry-run
npm run tpqr -- release verify
```

`doctor` reports tool availability without printing tokens. `local setup`
runs repeatable SQLite migrations and the fictional seed. `check` runs the
complete local gate. `domain inspect` performs DNS and HTTPS health checks.
`oauth check` reports only whether required variables exist.

`deploy` builds the application and starts the Compose stack. Production
requires `--confirm-production` and a server-only configuration with no
placeholders or fixed verification code. The CLI never edits registrar DNS or
writes private values to Git.
