# Architecture

TP QR CN is a single-origin web application. Caddy serves the Vite bundle and
proxies `/api/*` to the Hono API. The API owns authentication, validation,
publishing, analytics, and the private asset proxy.

```text
browser ── HTTPS ──> Caddy ── /api/* ──> Hono/Node
                         └─ static ──> Vite dist
                                      ├─ SQLite /data/tpqr/tpqr.sqlite
                                      └─ private OSS (optional production)
```

Published QR versions are immutable. Seven content types are validated by the
shared packages: image, video, audio, file, URL, contact, and text. The
Cloudflare implementation is a separate repository and is not a dependency
of this project.
