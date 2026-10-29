# Build stage: install dependencies and compile the app into dist/
FROM node:22-slim AS build

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
WORKDIR /app

# Prisma 7 engines are fetched by postinstall scripts. Skip the client
# generation in postinstall: the schema is copied after this layer, and the
# explicit `prisma generate` below runs once the schema is present.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
# `prisma generate` only needs a syntactically valid URL; the runtime gets the
# real one from docker-compose.yml and never uses this placeholder.
ENV DATABASE_URL=postgresql://ferry:ferry@localhost:5432/ferry
RUN yarn prisma generate && yarn build

# Runtime stage: slim image with the compiled app, node_modules and migrations.
# `prisma migrate deploy` runs at startup, so a fresh compose stack is
# migrated on the first boot with no extra command.
FROM node:22-slim AS runtime

ENV NODE_ENV=production
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# `prisma db seed` runs prisma/seed.ts, which imports the generated client.
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/package.json ./

EXPOSE 3000

CMD ["sh", "-c", "yarn db:migrate:deploy && node dist/main.js"]
