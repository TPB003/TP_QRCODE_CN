# Aliyun deployment

The Aliyun edition runs as a small Docker Compose stack on an Ubuntu 24.04
ECS instance. It uses Node.js 22, Hono, SQLite, private Object Storage
Service (OSS), and Caddy. The repository never contains an ECS address,
bucket name, OAuth secret, or Resend key.

## Local smoke test

```powershell
Copy-Item .env.example .env
npm run setup:local
npm run build
docker compose -f infra/aliyun/docker-compose.yml -f infra/aliyun/docker-compose.local.yml up --build
```

The local gateway listens on `http://127.0.0.1:8080`. Keep the generated
`.env`, SQLite files, and uploaded assets out of Git.

## ECS setup

Install Docker and Compose on Ubuntu, then create `/opt/tpqr` with mode 700:

```bash
sudo mkdir -p /opt/tpqr/{data,backups,releases}
sudo chown -R "$USER":"$USER" /opt/tpqr
chmod 700 /opt/tpqr
```

Copy the release source and copy `infra/aliyun/env.example` to
`/opt/tpqr/.env`. Replace every
`replace-with-*` value, set `APP_ORIGIN` and `PUBLIC_QR_ORIGIN` to the
备案后的 HTTPS domain, then run `chmod 600 /opt/tpqr/.env`.

Only expose ports 80 and 443 in the ECS security group. Keep port 8787
internal to Compose and allow SSH only with a key. Caddy terminates TLS after
DNS points to the ECS address. Set `TPQR_DOMAIN` in the server-only `.env`,
then start the production override:

```bash
docker compose --env-file .env \
  -f infra/aliyun/docker-compose.yml \
  -f infra/aliyun/docker-compose.production.yml up -d --build
```

Do not commit the server `.env` or a domain-specific Caddy configuration.

## OSS

Create a private bucket and a dedicated RAM user with only object read/write/
delete permissions for that bucket. Set `OSS_REGION`, `OSS_BUCKET`,
`OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, and (if needed) `OSS_ENDPOINT`
in the server-only `.env`. The API proxies assets, so clients never receive
OSS credentials or object keys.

## Resend and GitHub

Verify the sending domain in Resend before using production email. Set
`AUTH_DELIVERY_MODE=resend`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL`; never
set `AUTH_TEST_CODE` in production. Configure the GitHub App callback as:

```text
https://replace-with-your-domain/api/auth/github/callback
```

The Google OAuth backend remains available for a future UI toggle, but its
button is intentionally hidden in the current web app.

## Backup and rollback

Stop the API before copying `/opt/tpqr/data/tpqr.sqlite` to a dated file in
`/opt/tpqr/backups`, and upload that backup to a private OSS prefix. Keep the
previous application image/release until the new version passes `/api/health`
and the browser smoke test. Restoring the previous image does not delete the
database or OSS objects.
