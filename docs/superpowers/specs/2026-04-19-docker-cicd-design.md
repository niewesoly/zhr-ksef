# Docker & CI/CD Design

## Context

zhr-ksef is a TypeScript microservice (Hono + Node.js) with a BullMQ worker process. Deployment target is a VPS with Docker Compose. PostgreSQL is external (managed DB). Redis runs in Docker alongside the app.

## Dockerfile (multi-stage)

Three stages:

1. **deps** (`node:22-alpine`) — installs pnpm, copies `package.json` + `pnpm-lock.yaml`, runs `pnpm install` (all deps). Includes `python3`, `make`, `g++` for bcrypt native addon compilation.
2. **build** — copies `src/`, `tsconfig.json`, runs `tsc`. Copies `src/assets/` to `dist/assets/` (fonts for PDF rendering).
3. **prod** (`node:22-alpine`) — clean image, `pnpm install --prod` (production deps only), copies `dist/` from build stage. No build tools in final image.

Runtime details:
- Non-root user: `node` (UID 1000, built into node alpine images)
- Built-in `HEALTHCHECK`: `curl http://localhost:3000/health`
- Default `CMD`: `node dist/index.js` (API server)
- Worker overrides via docker-compose `command`: `node dist/jobs/worker.js`

## docker-compose.prod.yml

Three services sharing a Docker network:

### redis
- `redis:7-alpine` with `--requirepass` and `--appendonly yes`
- No ports exposed to host — accessible only within Docker network
- Persistent volume: `redisdata:/data`
- Healthcheck: `redis-cli -a $REDIS_PASSWORD PING`

### app
- Built from Dockerfile
- Exposes `${PORT:-3000}:3000` to host
- `env_file: .env.production`
- `depends_on: redis` (healthy)
- `DATABASE_URL` points to external Postgres (not localhost — must be reachable from container)
- `REDIS_URL` uses Docker service name: `redis://default:${REDIS_PASSWORD}@redis:6379`

### worker
- Same image as app, different command: `node dist/jobs/worker.js`
- `env_file: .env.production`
- `depends_on: redis` (healthy)
- No ports exposed

## GitHub Actions CI/CD

Trigger: push to `main` branch.

### Job 1: test (ubuntu-latest)
1. Checkout repo
2. Install pnpm
3. `pnpm install`
4. `pnpm build`
5. `pnpm test`

### Job 2: deploy (needs: test)
Uses `appleboy/ssh-action` to SSH into VPS and run:
1. `cd /opt/zhr-ksef`
2. `git pull origin main`
3. `docker compose -f docker-compose.prod.yml build`
4. `docker compose -f docker-compose.prod.yml run --rm app node dist/db/migrate.js` (DB migration in container)
5. `docker compose -f docker-compose.prod.yml up -d`
6. Wait for healthcheck: `curl -f http://localhost:3000/health`
7. `docker image prune -f` (clean old images)

### GitHub Secrets required
- `VPS_HOST` — VPS IP or domain
- `VPS_USER` — SSH user (e.g., `deploy`)
- `VPS_SSH_KEY` — private SSH key

### VPS one-time setup
- Clone repo to `/opt/zhr-ksef`
- Place `.env.production` in `/opt/zhr-ksef/`
- Add deploy user's public key to `authorized_keys`

## .dockerignore

Excludes: `node_modules`, `dist`, `.env`, `.env.production`, `.git`, `.claude`, `.idea`, `.vscode`, `bruno`, `tests`, `docs`, `data`, `logs`, `*.log`

## .env.production

Not committed (already in `.gitignore` as `.env.production`). Must contain:
- `NODE_ENV=production`
- `PORT=3000`
- `LOG_LEVEL=info`
- `DATABASE_URL=postgres://user:pass@<external-pg-host>:5432/ksef`
- `REDIS_PASSWORD=<strong-random>`
- `REDIS_URL=redis://default:<REDIS_PASSWORD>@redis:6379`
- `ENCRYPTION_KEY=<base64-encoded-32-bytes>`
- `ADMIN_API_KEY=<min-24-chars>`
- `CORS_ORIGINS=<production-origins>`
