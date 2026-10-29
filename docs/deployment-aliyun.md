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

For an installation that already has local uploads, copy every asset to OSS
under the same object key and verify the objects before setting the OSS values.
The application does not migrate or fall back to local files after OSS is
enabled, so switching without this copy makes existing uploads unavailable.

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

## GitHub production releases

`.github/workflows/release-aliyun.yml` prepares a release after the `CI`
workflow succeeds for a push to `main`. It also has a manual dispatch entry;
manual releases must run from `main` and explicitly select `yes`. Both paths
build immutable API and gateway images from the same commit. The deployment job
is serialized and targets the protected GitHub `production` environment.

Production deployment stays disabled until the one-time server baseline,
restricted account, public smoke QR, and GitHub environment settings have all
been checked. Set repository variable `ALIYUN_DEPLOY_ENABLED` to `true` only
after those steps. If it is unset or false, the workflow builds the release
artifact and reports that production deployment is disabled.

### Restricted deployment account

Create a dedicated Ed25519 key pair on a trusted workstation. Keep the private
key out of the repository and out of the root account's key file:

```bash
ssh-keygen -t ed25519 -a 64 -N '' -f tpqr-aliyun-deploy
```

Verify the ECS SSH host fingerprint through the Alibaba Cloud console before
adding it to `known_hosts`. The public key is installed with the one-time root
bootstrap. Copy these four files to a temporary directory on the server:

```text
infra/aliyun/install-deploy-user.sh
infra/aliyun/tpqr-deploy-ssh
infra/aliyun/tpqr-deploy-root
tpqr-aliyun-deploy.pub
```

Before installation, read the image tag from both live containers and confirm
that they use the same 40-character release SHA:

```bash
docker inspect --format '{{.Config.Image}}' aliyun-api-1
docker inspect --format '{{.Config.Image}}' aliyun-tpqr-gateway-1
```

The matching release directory under `/var/lib/tpqr-deploy/releases/<sha>`
must contain a root-owned `docker-compose.release.yml`. Run
`install-deploy-user.sh tpqr-aliyun-deploy.pub <sha>` as root from the temporary
directory, replacing `<sha>` with the verified image tag. The installer checks
the live images, Compose file, health, data mount, and Caddy volumes before it
creates `/var/lib/tpqr-deploy/current` as the rollback baseline. It reuses the
existing deployment-state directory without replacing its release files.

The installer creates `tpqr-deploy`, locks its password, keeps it out of the
Docker group, restricts the public key to one fixed command, and allows that
command to call only the root-owned deployment helper. The helper accepts an
image bundle and a commit SHA; it does not accept a shell command. Remove the
temporary copy after installation. The root login key remains on the
administrator's workstation and is never added to GitHub.

### GitHub settings

Create a GitHub Environment named `production` and restrict deployments to the
`main` branch. Required reviewers can be added for a manual approval gate; if
they are configured, automatic releases will wait for that approval. Add these
repository variables:

| Variable | Value |
| --- | --- |
| `ALIYUN_DEPLOY_ENABLED` | `false` until the first manual release succeeds; `true` to enable automatic releases |
| `ALIYUN_PUBLIC_BASE_URL` | Public HTTPS origin, for example `https://qr.example.com` |

Add these variables to the `production` environment:

| Variable | Value |
| --- | --- |
| `ALIYUN_DEPLOY_HOST` | ECS host name or address |
| `ALIYUN_DEPLOY_USER` | `tpqr-deploy` |
| `ALIYUN_DEPLOY_PORT` | SSH port, normally `22` |
| `ALIYUN_PUBLIC_SMOKE_SLUG` | Slug of a published, non-personal smoke QR code |

Add these environment secrets:

| Secret | Value |
| --- | --- |
| `ALIYUN_DEPLOY_KEY` | Private half of the dedicated Ed25519 deployment key |
| `ALIYUN_DEPLOY_KNOWN_HOSTS` | Verified SSH host key line for the configured host and port |

The public smoke slug must resolve to a published test QR code. After release,
the server helper checks `/api/health`, the `/s/<slug>` page, and
`/api/public/<slug>`. It discards response bodies so public QR content is not
written to Actions logs. A failed check restores the previous managed image;
the first managed release falls back to the existing Compose images.

### First-release baseline check

Before setting `ALIYUN_DEPLOY_ENABLED=true`:

1. Record the server repository's current `HEAD` and compare it with GitHub
   `main`.
2. Review and preserve all tracked modifications and untracked files. Do not
   run `git reset --hard`, `git clean`, or copy a checkout over the server tree.
3. Confirm the current live containers use the expected Compose project and
   persistent volumes. The release helper uses `/opt/tpqr/.env` and
   `/opt/tpqr/data` as inputs, keeps Caddy's named volumes, and stores versioned
   release material under `/var/lib/tpqr-deploy`; it does not replace the
   server checkout, `.env`, database, assets, backups, or OSS objects.
4. Confirm the smoke slug is a published synthetic QR code, then run the
   manual release from `main` with `confirm_production=yes` while watching the
   preflight, deploy, and health-check jobs.
5. Only after that release succeeds, set `ALIYUN_DEPLOY_ENABLED=true` for
   unattended releases after successful `main` CI runs.

The release Compose file runs the repository's committed database migrations
against the existing SQLite file; it never replaces the file or asset
directory. Keep migrations backward-compatible with the previous image. Plan
and back up data before any future migration that cannot be rolled back by
restoring the prior application image.