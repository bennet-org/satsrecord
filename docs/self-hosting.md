# Self-hosting

Hosted and self-hosted installations run the same source. The configuration below provides a deployment foundation, but **the application is still under development and is not ready for live donation operations**. Live chain detection, a real fresh-wallet history check, historical rates and the continuously running settlement worker are not implemented. Issuing a real address does not mean incoming payments will be detected or acknowledged.

Use [the isolated demo](demo.md) to evaluate the product without real funds or outgoing email.

## Configure an installation

You need Docker with Compose, a hostname, an HTTPS reverse proxy on the host, and a Resend account with a verified sending domain. SMTP delivery is not implemented yet.

From the repository root:

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill in the file before starting any services:

- Generate `POSTGRES_PASSWORD` with `openssl rand -hex 32`. The Compose file embeds it in a database URL, so use hex to avoid URL-encoding problems.
- Run `openssl rand -base64 32` separately for `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` and `INDEX_KEY`. Do not reuse values. Encryption and index keys must each decode to 32 bytes.
- Set `APP_URL` to your public HTTPS origin, for example `https://donations.example.org`, without a path or trailing slash. Authentication links and passkeys use this origin.
- Set `RESEND_API_KEY` and `MAIL_FROM` using your verified domain. This configuration requires email delivery so sign-in links do not silently go to server logs.
- Set `OPERATOR_EMAILS` to your own email address (or a comma-separated list). Public signup is disabled. Operators sign in at `/login` and issue organisation invites at `/admin`.

The populated `.env.production` is ignored by Git and excluded from Docker builds. Compose passes the selected values at container runtime. Keep that file and backups private. Shell environment variables override the env file; remove unintended exported values before running Compose.

## Start behind HTTPS

Use the production file **on its own**, with the same project name for every command. Do not merge it with the development `compose.yaml`.

```sh
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml up -d --build
```

Missing required values stop Compose before services start. `config --quiet` validates without printing resolved secrets. The `satsrecord-production` project has its own persistent database volume, separate from local development and the demo.

Postgres has no published host port. The web port binds only to `127.0.0.1:4321`. Configure your host's reverse proxy to forward your HTTPS hostname there, preserving the original host and scheme. For example, a host-installed Caddy can use:

```caddyfile
donations.example.org {
    reverse_proxy 127.0.0.1:4321
}
```

Replace the hostname with your own and point its DNS at the server. Only expose the reverse proxy publicly. A proxy in another container needs a deliberately configured private network; its own loopback address does not reach this host binding.

Migrations run automatically when the web container starts. Check the service status and logs, then verify login, organisation invitations and email delivery through the HTTPS origin. Development outbox and donation simulation flags are disabled in this configuration.

## Backups and upgrades

Back up both the database and the existing `.env.production` secrets to private, encrypted storage. Test restoration to an isolated installation. A database backup without its original encryption and index keys is insufficient to recover normal operation.

For a database dump (the command uses the container's local Postgres connection):

```sh
umask 077
docker compose --env-file .env.production -f compose.production.yaml exec -T db pg_dump -U satsrecord -d satsrecord -Fc > /path/outside/repository/satsrecord.dump
```

Choose an existing private destination outside the repository. Do not commit or add backups to container build contexts.

Before upgrading, take a backup and review migrations and release notes. Check out the intended version, then rerun the `up -d --build` command above. Preserve all existing secrets across rebuilds. Changing `POSTGRES_PASSWORD` in the file does not change the password of an already-initialized Postgres volume; credential rotation needs a coordinated database update. Encryption/index-key rotation also requires a data migration and is not implemented.

`docker compose --env-file .env.production -f compose.production.yaml down` stops the installation while preserving its data. Do not add `--volumes` unless you intend to destroy the database. Rolling back an image does not roll back database migrations.

## Current packaging limits

- Resend is the only implemented external mail provider.
- The public marketing pages, canonical URLs, branding and policy pages still describe the hosted SatsRecord service. Adapt them before exposing an installation under your own organisation's identity. This is not a white-label release.
- Marketing analytics use hosted Netlify proxy routes. The Node deployment does not provide those routes; it does not become a configured analytics installation automatically.
- Charity-notification scheduling is a separate setup step; see [deployment](deployment.md#donation-notification-scheduling). It does not supply the missing live settlement worker.

Report security issues privately using [SECURITY.md](../SECURITY.md).
