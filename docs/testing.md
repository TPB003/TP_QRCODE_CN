# Testing

Run the complete local gate from the repository root:

```powershell
npm ci
npm run setup:local
npm run check:all
npm run check:opensource
git diff --check
```

The integration and security suites use a temporary SQLite database and the
local filesystem object-store adapter. Browser tests start the Node API on
`127.0.0.1:8787` and Vite on `127.0.0.1:5173`, then exercise Chromium desktop
and mobile viewports. CI never connects to ECS, OSS, Resend, or OAuth
providers.
