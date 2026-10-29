# Aliyun deployment

The Aliyun edition runs as a small Docker Compose stack on an Ubuntu 24.04
ECS instance. It uses Node.js 22, Hono, SQLite, persistent local asset storage,
and Caddy. Private Object Storage Service (OSS) is optional. The repository
never contains an ECS address, bucket name, OAuth secret, or Resend key.

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

By default, uploaded assets are stored in the persistent local directory set
by `TPQR_ASSET_PATH` (`/data/tpqr/assets` in the container, backed by
`/opt/tpqr/data/assets` on the ECS host). Keep this directory when updating or
rolling back the application. The API proxies assets, so clients never receive
storage credentials or internal object keys.

OSS can be enabled later without changing the asset API. Create a private
bucket and a dedicated RAM user with only object read/write/delete permissions
for that bucket, then set all four `OSS_REGION`, `OSS_BUCKET`,
`OSS_ACCESS_KEY_ID`, and `OSS_ACCESS_KEY_SECRET` values in the server-only
`.env`. `OSS_ENDPOINT` is optional. Leave all four credentials empty to use
local storage; a partial OSS configuration fails startup before database
migrations run.

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

Stop the API before copying `/opt/tpqr/data/tpqr.sqlite` and the matching
`/opt/tpqr/data/assets` directory to a dated backup under
`/opt/tpqr/backups`. Keep the database and assets from the same backup point.
If using OSS, back up its objects separately. Keep the previous application
image/release until the new version passes `/api/health` and the browser smoke
test. Restoring the previous image does not delete the database or local asset
directory.
