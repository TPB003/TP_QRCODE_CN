# Security model

- Validate all seven content types and uploaded file headers before storage.
- Store sessions and OAuth state server-side; never store provider tokens.
- Use PKCE and one-time, expiring OAuth state values.
- Keep OSS private and proxy assets through authorization-aware API routes.
- Use `HttpOnly`, `SameSite=Lax`, and `Secure` cookies in production.
- Rate-limit verification codes and public events.
- Do not put `.env`, credentials, production identifiers, personal QR codes,
  or real submissions in the public repository.

Report vulnerabilities privately using `SECURITY.md`; do not include working
exploit payloads in public issues.
