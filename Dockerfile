# ── 1. Base stage: Dependency Installation ──────────────────────────────
FROM node:24-alpine AS base

WORKDIR /usr/src/app

# Copy package management files first
COPY package*.json ./

# npm ci is preferred over npm install in CI/CD and Docker because it respects
# strictly the package-lock.json (faster and more predictable)
RUN npm ci

# ── 2. Development stage: Used by docker-compose ─────────────────────
FROM base AS dev

# Prisma needs its schema to generate the TS client
COPY prisma ./prisma
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# No need to copy source code, docker-compose mounts it as a volume!
EXPOSE 3000

# Command to start with hot-reloading
CMD ["npm", "run", "start:dev"]

# ── 3. Build stage: Compiling the application ─────────────────────────────
FROM base AS builder

# Copy all source code
COPY . .

# Generate Prisma client and build NestJS app (creates /dist folder)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate
RUN npm run build

# Critical optimization: prune devDependencies (Jest, TS, etc.)
# to keep only what is necessary in production
RUN npm prune --production

# ── 4. Production stage: Lightweight production image ───────────────────────────
FROM node:24-alpine AS prod

WORKDIR /usr/src/app

# Copy only generated artifacts and production dependencies
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/generated ./generated
COPY --from=builder /usr/src/app/dist/prisma.config.js ./prisma.config.js

EXPOSE 3000

# Command to start the compiled and optimized version
CMD ["npm", "run", "start:prod"]