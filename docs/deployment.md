# Production configuration

## Netlify

The repository's `netlify.toml` supplies the build command, publish directory and Node 24 build version. Set the base directory to the repository root and package directory to `apps/web`. Netlify supplies `NETLIFY=true`, selecting the Netlify adapter.

Set environment variables for the **Production** deploy context through Netlify's UI, CLI or API. Runtime values need the **Functions** scope. Giving application values both **Builds** and **Functions** scope is the simplest configuration; the direct database connection needs only **Builds**. Redeploy after changing variables. See [Netlify's environment-variable documentation](https://docs.netlify.com/build/functions/environment-variables/).

| Variable                   | Production value                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`             | Production Neon pooled connection string, including its SSL options. Available to Builds and Functions.            |
| `DATABASE_URL_UNPOOLED`    | Direct connection string to the same production database for migrations. Builds scope. Do not set an empty string. |
| `APP_URL`                  | `https://satsrecord.org`, or the actual canonical origin of this deployment.                                       |
| `BETTER_AUTH_SECRET`       | Existing strong random auth secret; use at least 32 characters when first generating it.                           |
| `ENCRYPTION_KEY`           | Existing base64-encoded 32-byte encryption key.                                                                    |
| `INDEX_KEY`                | Existing separate base64-encoded 32-byte HMAC key.                                                                 |
| `RESEND_API_KEY`           | Production Resend API key. Without it, mail only goes to server logs.                                              |
| `MAIL_FROM`                | For example `SatsRecord <hello@satsrecord.org>`, using your verified Resend sending domain.                        |
| `OPERATOR_EMAILS`          | Comma-separated operator email addresses for `/admin`.                                                             |
| `NOTIFY_EMAIL`             | Optional mailbox for access-request alerts. This is separate from charity donation notification preferences.       |
| `OPEN_SIGNUP`              | `false` for invite-only hosted access.                                                                             |
| `DEV_OUTBOX`               | `false`.                                                                                                           |
| `SIMULATE_DONATIONS`       | `false`. Production simulation routes remain disabled regardless of this flag.                                     |
| `NOTIFICATION_CRON_SECRET` | Optional until scheduling notification delivery; a separate random secret of at least 32 characters.               |

Leave `DEV_OUTBOX_PASSWORD` and `SATSRECORD_DEMO` unset. `NODE_VERSION=24` is already in `netlify.toml`; no extra `NETLIFY` variable is needed.

Preserve the existing encryption and index keys when redeploying. Replacing the encryption key makes stored descriptors and donor details unreadable; replacing the index key breaks existing email lookups. For a new installation, generate each secret separately with `openssl rand -base64 32`. Do not copy local demo keys into production.

Use a separate database and matching secrets for deploy previews, or disable those builds: the checked-in build command runs migrations for whichever database the deploy context provides.

## Deploying the demo-polish changes

The normal Netlify build applies migration `0008_donation_notifications.sql` (and any other unapplied migrations) before the updated app deploys. No manual SQL or production seed is required. The new notification settings default to off for existing organisations.

This release does **not** enable real payment detection: production still uses a fake chain source and has no live rate adapter or worker. Address issuance, verification and the dashboard work, but real incoming payments will not yet create settlements, acknowledgements or charity notices. `pnpm demo` and its simulation controls are local development features.

## Donation-notification scheduling

There is a protected delivery endpoint, but **no Netlify Scheduled Function is currently included**. Setting a secret does not create a schedule.

When notification delivery is needed, set `NOTIFICATION_CRON_SECRET`, redeploy, and configure a trusted scheduler to POST every 15 minutes to:

```text
https://satsrecord.org/api/internal/notifications
Content-Type: application/json
Authorization: Bearer <NOTIFICATION_CRON_SECRET>
```

No request body is required. A valid request returns JSON containing sent and failed counts; a delivery failure returns HTTP 503 so the scheduler can report it. Queued individual notices are retried; daily digests become eligible after midnight UTC. Each organisation opts in and selects its recipient through Settings.

A Netlify Scheduled Function could provide this trigger, or the forthcoming worker can own scheduling. Native scheduled functions require function code/configuration and run only on published deploys; see [Netlify's scheduling documentation](https://docs.netlify.com/build/functions/scheduled-functions/).

The scheduler currently covers charity notices, not failed donor acknowledgements. Automatic acknowledgement retries, provider idempotency/reconciliation and delivery monitoring belong in the live settlement worker before launch.
