# ── 1. Base stage : Installation des dépendances ──────────────────────────────
FROM node:24-alpine AS base

WORKDIR /usr/src/app

# On copie uniquement les fichiers de gestion de paquets d'abord
COPY package*.json ./

# npm ci est préférable à npm install dans les CI/CD et Docker car il respecte 
# strictement le package-lock.json (plus rapide et prédictible)
RUN npm ci

# ── 2. Development stage : Utilisé par ton docker-compose ─────────────────────
FROM base AS dev

# Prisma a besoin de son schéma pour générer le client TS
COPY prisma ./prisma
RUN npx prisma generate

# Pas besoin de copier le code source, docker-compose le monte en volume !
EXPOSE 3000

# Commande pour démarrer avec le hot-reloading
CMD ["npm", "run", "start:dev"]

# ── 3. Build stage : Compilation de l'application ─────────────────────────────
FROM base AS builder

# On copie tout le code source
COPY . .

# On génère Prisma et on build l'app NestJS (crée le dossier /dist)
RUN npx prisma generate
RUN npm run build

# Optimisation critique : on supprime les devDependencies (Jest, TS, etc.)
# pour ne garder que ce qui est nécessaire en production
RUN npm prune --production

# ── 4. Production stage : Image finale ultra-légère ───────────────────────────
FROM node:20-alpine AS prod

WORKDIR /usr/src/app

# On copie uniquement les artefacts générés et les dépendances propres
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

EXPOSE 3000

# Commande pour démarrer la version compilée et optimisée
CMD ["npm", "run", "start:prod"]