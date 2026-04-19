# Docker & CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production Docker deployment and automated CI/CD pipeline for zhr-ksef.

**Architecture:** Multi-stage Dockerfile builds the app once; docker-compose.prod.yml runs it as two services (API + worker) with Redis. GitHub Actions runs tests then deploys via SSH to VPS.

**Tech Stack:** Docker, Docker Compose, GitHub Actions, appleboy/ssh-action, pnpm, Node.js 22 Alpine

**Spec:** `docs/superpowers/specs/2026-04-19-docker-cicd-design.md`

---

### Task 1: .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
node_modules
dist
.env
.env.production
.git
.claude
.idea
.vscode
bruno
tests
docs
data
logs
*.log
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore"
```

---

### Task 2: Dockerfile

**Files:**
- Create: `Dockerfile`

**Context:** The app has two entrypoints: `dist/index.js` (API server) and `dist/jobs/worker.js` (BullMQ worker). The build step is `tsc` + copy assets. `bcrypt` requires native compilation tools. Migration script at `dist/db/migrate.js` reads SQL files from `./src/db/migrations` (CWD-relative), so the migrations directory must be present in the prod image at `/app/src/db/migrations/`.

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

# bcrypt native addon needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# -------------------------------------------------------------------
FROM deps AS build

COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm run build

# -------------------------------------------------------------------
FROM node:22-alpine AS prod

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache curl

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist/ ./dist/

# Fonts for @react-pdf/renderer (copied by build script: tsc && cp -r src/assets dist/)
# Already in dist/assets/ from the build stage — no extra copy needed.

# SQL migration files — migrate.js references ./src/db/migrations (CWD-relative)
COPY src/db/migrations/ ./src/db/migrations/

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Verify the build locally**

```bash
docker build -t zhr-ksef:test .
```

Expected: successful build, image tagged `zhr-ksef:test`.

- [ ] **Step 3: Verify the image contents**

```bash
docker run --rm zhr-ksef:test ls -la dist/
docker run --rm zhr-ksef:test ls -la dist/assets/fonts/
docker run --rm zhr-ksef:test ls -la src/db/migrations/
```

Expected: `dist/index.js`, `dist/jobs/worker.js` exist; fonts directory has `.ttf` files; migrations directory has `.sql` files.

- [ ] **Step 4: Verify no build tools in prod image**

```bash
docker run --rm zhr-ksef:test which python3 || echo "no python3 - good"
docker run --rm zhr-ksef:test which make || echo "no make - good"
```

Expected: both commands print the "no ... - good" message.

- [ ] **Step 5: Verify non-root user**

```bash
docker run --rm zhr-ksef:test whoami
```

Expected: `node`

- [ ] **Step 6: Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage production Dockerfile"
```

---

### Task 3: docker-compose.prod.yml

**Files:**
- Create: `docker-compose.prod.yml`

**Context:** Redis is internal (no ports exposed to host). App and worker use the same built image. PostgreSQL is external — `DATABASE_URL` in `.env.production` points to the managed DB. The existing `docker-compose.yml` is for dev only (runs Postgres + Redis for host-based dev). The prod compose replaces it with app + worker + redis.

- [ ] **Step 1: Create docker-compose.prod.yml**

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command:
      - redis-server
      - --requirepass
      - ${REDIS_PASSWORD:?REDIS_PASSWORD is required}
      - --appendonly
      - "yes"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "$$REDIS_PASSWORD", "PING"]
      interval: 5s
      timeout: 5s
      retries: 10
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}

  app:
    build: .
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    env_file: .env.production
    depends_on:
      redis:
        condition: service_healthy

  worker:
    build: .
    restart: unless-stopped
    command: ["node", "dist/jobs/worker.js"]
    env_file: .env.production
    depends_on:
      redis:
        condition: service_healthy

volumes:
  redisdata:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat: add production docker-compose with app, worker, and redis"
```

---

### Task 4: GitHub Actions CI/CD workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Context:** Two jobs: `test` runs on ubuntu-latest (checkout → pnpm install → build → test), `deploy` runs after test passes and SSHs into VPS to pull, build, migrate, and restart. The deploy job uses `appleboy/ssh-action` which takes host/username/key from GitHub Secrets. Migration runs inside the app container before starting services: `docker compose run --rm app node dist/db/migrate.js`.

- [ ] **Step 1: Create the workflow directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create .github/workflows/deploy.yml**

```yaml
name: Test & Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test

  deploy:
    name: Deploy
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script_stop: true
          script: |
            cd /opt/zhr-ksef
            git pull origin main
            docker compose -f docker-compose.prod.yml build
            docker compose -f docker-compose.prod.yml run --rm app node dist/db/migrate.js
            docker compose -f docker-compose.prod.yml up -d
            sleep 5
            curl -f http://localhost:${PORT:-3000}/health || (docker compose -f docker-compose.prod.yml logs --tail=50 && exit 1)
            docker image prune -f
```

Key details:
- `concurrency.group: deploy-production` prevents overlapping deploys
- `cancel-in-progress: false` ensures a running deploy finishes before the next one starts
- `script_stop: true` makes the script fail on first error
- Healthcheck waits 5 seconds for the app to boot, then curls `/health`
- On healthcheck failure, prints last 50 log lines for debugging before failing

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions CI/CD workflow"
```

---

### Task 5: .env.production template and documentation

**Files:**
- Create: `.env.production.example`

**Context:** `.env.production` is already in `.gitignore`. An example file helps set up new VPS instances. The `REDIS_URL` must use `redis` (Docker service name) instead of `localhost`.

- [ ] **Step 1: Create .env.production.example**

```bash
# ==========================================================================
# zhr-ksef production environment — copy to .env.production on VPS
#   cp .env.production.example .env.production
#
# REDIS_URL uses "redis" (Docker service name), not localhost.
# DATABASE_URL must point to the external PostgreSQL instance.
# ==========================================================================

NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# --- External PostgreSQL ---------------------------------------------------
DATABASE_URL=postgres://user:password@pg-host:5432/ksef

# --- Redis (internal Docker service) ---------------------------------------
REDIS_PASSWORD=CHANGE_ME_TO_STRONG_RANDOM
REDIS_URL=redis://default:CHANGE_ME_TO_STRONG_RANDOM@redis:6379

# --- Encryption (envelope encryption KEK) ----------------------------------
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY=

# --- Admin API key ----------------------------------------------------------
# Generate: openssl rand -base64 36
ADMIN_API_KEY=

# --- CORS -------------------------------------------------------------------
CORS_ORIGINS=https://your-domain.com
```

- [ ] **Step 2: Commit**

```bash
git add .env.production.example
git commit -m "docs: add .env.production.example template"
```

---

### Task 6: Local Docker smoke test

**Files:** none (validation only)

**Context:** Before pushing, verify the entire stack works locally. This requires a temporary `.env.production` with a real `DATABASE_URL` (can use the dev database). This task is manual validation — no files to commit.

- [ ] **Step 1: Create a temporary .env.production for local testing**

```bash
cp .env.example .env.production
```

Edit `.env.production`:
- Set `REDIS_URL=redis://default:ksef@redis:6379` (use Docker service name `redis`)
- Keep `DATABASE_URL` pointing to the dev Postgres (make sure it's reachable from Docker — use host IP, not `localhost`)
- Set `ENCRYPTION_KEY` and `ADMIN_API_KEY` to valid values

- [ ] **Step 2: Build and start the stack**

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Expected: all three services start (redis, app, worker).

- [ ] **Step 3: Check service health**

```bash
docker compose -f docker-compose.prod.yml ps
```

Expected: redis is healthy, app and worker are running.

- [ ] **Step 4: Test the healthcheck endpoint**

```bash
curl -f http://localhost:3000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Check logs for errors**

```bash
docker compose -f docker-compose.prod.yml logs app --tail=20
docker compose -f docker-compose.prod.yml logs worker --tail=20
```

Expected: no errors; app shows "zhr-ksef listening" on port 3000; worker shows "worker started".

- [ ] **Step 6: Tear down**

```bash
docker compose -f docker-compose.prod.yml down
rm .env.production
```
