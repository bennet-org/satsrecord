FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/widget/package.json packages/widget/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# The server bundle imports better-auth, drizzle-orm, pg and @scure/* as bare specifiers, so the
# runtime needs a real node_modules; dist alone serves the prerendered pages and 500s on everything
# else. deploy --prod builds that tree without the dev dependencies.
RUN pnpm --filter @satsrecord/web deploy --prod /deploy

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /app/apps/web/dist ./apps/web/dist
EXPOSE 4321
# Self-host is one container, so migrations run on start. Netlify runs drizzle-kit in its build instead.
CMD ["sh", "-c", "node node_modules/@satsrecord/core/migrate.mjs && node apps/web/dist/server/entry.mjs"]
