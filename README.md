# SatsRecord

Non-custodial bitcoin donations for charities and non-profits. Product brief in [project-brief.md](project-brief.md), technical design in [docs/design.md](docs/design.md), stack in [docs/stack.md](docs/stack.md), plan in [ROADMAP.md](ROADMAP.md), brand in [brand/README.md](brand/README.md).

## Layout

```
apps/web         Astro site and app (Node adapter)
packages/core    Domain logic, schema, adapters. No framework imports.
packages/widget  Embeddable web component
```

## Develop

```
corepack enable            # pnpm
pnpm install
cp .env.example .env       # then edit
docker compose up -d db    # Postgres on :5432
pnpm --filter @satsrecord/core db:migrate
pnpm dev                   # http://localhost:4321
pnpm test                  # core tests, in-process Postgres, no Docker needed
pnpm build && pnpm start   # production server
```

## Licence

Application: AGPL-3.0. Widget (`packages/widget`): MIT. Licence files land with the first release.
