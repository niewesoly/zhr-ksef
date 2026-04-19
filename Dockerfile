# Stage 1: deps — install all dependencies (including native build tools for bcrypt)
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

# bcrypt native addon requires build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile


# Stage 2: build — compile TypeScript and copy assets
FROM deps AS build

COPY tsconfig.json ./
COPY src/ ./src/

RUN pnpm run build


# Stage 3: prod-deps — production dependencies only (still needs build tools for bcrypt)
FROM deps AS prod-deps

RUN pnpm install --frozen-lockfile --prod


# Stage 4: prod — lean runtime image (no build tools)
FROM node:22-alpine AS prod

RUN apk add --no-cache curl

WORKDIR /app

COPY --from=prod-deps /app/node_modules/ ./node_modules/
COPY --from=prod-deps /app/package.json ./

COPY --from=build /app/dist/ ./dist/

# SQL migration files — migrate.js references ./src/db/migrations (CWD-relative)
COPY src/db/migrations/ ./src/db/migrations/

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
