# 📚 BookShelf — Plateforme de lecture collaborative API

BookShelf est une API NestJS robuste conçue pour gérer des **clubs de lecture collaboratifs**. Elle permet aux utilisateurs de créer des clubs, d'inviter des membres avec des rôles spécifiques, de partager des bibliothèques de livres, de suivre leur progression de lecture page par page, d'ajouter des avis et notes moyennes sur les livres, et de gérer le tout via une console d'administration.

---

## 🚀 Stack Technique

- **NestJS** : Framework Node.js progressif et modulaire.
- **Prisma ORM** : ORM pour interagir proprement avec la base de données PostgreSQL.
- **Better Auth** : Authentification globale et sécurisée.
- **Docker** : Conteneurisation de PostgreSQL pour le développement et les tests.
- **Swagger / OpenAPI** : Documentation interactive et typée de l'ensemble de l'API.
- **Jest & Supertest** : Suite complète de tests unitaires et tests d'intégration E2E.

---

## 📂 Modules Applicatifs de l'API

L'application est structurée de manière modulaire :

1. **`Authentification`** : Inscription, connexion, déconnexion et gestion des sessions gérées nativement par Better Auth.
2. **`Administration`** :
   - Activation et désactivation de comptes utilisateurs.
   - Importation en masse de livres au format CSV (transactionnelle et validée).
   - Importation en masse de membres de clubs au format CSV.
3. **`Clubs`** : CRUD complet des clubs avec filtrage de recherche et pagination, et gestion de la visibilité des clubs inactifs.
4. **`Membres de Club`** : Gestion des rôles internes (`OWNER`, `EDITOR`, `READER`) et exclusion de membres.
5. **`Livres`** : CRUD des livres d'un club, avec filtrage multi-critères, pagination et contrôle de visibilité selon les rôles.
6. **`Pages de Livre`** : Gestion dynamique et ordonnée (gapless) des pages de livres avec shifting automatique (transactionnel) lors des écritures ou déplacements, et upload d'images.
7. **`Progression de Lecture`** : Marque-page individuel par livre avec calcul de pourcentage, et tableau de bord global pour les propriétaires/éditeurs.
8. **`Critiques / Avis`** : Notation des livres (1 à 5 étoiles) avec contrainte d'unicité (un seul avis par livre et par utilisateur) et mise à jour de la note moyenne globale du livre.

---

## ⚙️ Configuration & Setup

### 1. Variables d'Environnement
Copiez le fichier d'exemple et configurez vos secrets :
```bash
cp .env.example .env
```
*(Le fichier `.env.example` contient déjà les configurations par défaut prêtes pour le développement en local via Docker).*

### 2. Lancement des bases de données PostgreSQL
BookShelf utilise deux bases de données distinctes (une pour le développement et une dédiée aux tests E2E) conteneurisées dans Docker.
Lancez-les en arrière-plan :
```bash
docker compose up -d db db-test
```

### 3. Exécution des Migrations de Base de Données
Appliquez le schéma de données Prisma et chargez les tables sur les deux instances PostgreSQL (dev et test) :
```bash
npm run db:migrate:all
```

### 4. Démarrage de l'API
Lancez le serveur NestJS en mode développement (avec rechargement automatique) :
```bash
npm run start:dev
```
L'application écoute par défaut sur le port `3000`.

---

## 📝 Documentation interactive de l'API (Swagger UI)

Une interface Swagger interactive est accessible localement à l'adresse :
👉 **`http://localhost:3000/api`**

Vous y trouverez :
- L'ensemble des 8 modules documentés avec leurs routes.
- Les schémas de données requis pour les requêtes (DTOs validés).
- Le support Bearer Token (`Authorize`) pour tester directement les routes authentifiées depuis votre navigateur.

---

## 🔧 Scripts Disponibles

| Commande | Action |
| :--- | :--- |
| `npm install` | Installe les dépendances du projet. |
| `npm run start:dev` | Démarre le serveur NestJS local en mode observation (`watch`). |
| `npm run db:migrate:all` | Applique les migrations Prisma sur les bases de données de dev et de test. |
| `npm run build` | Compile le projet TypeScript en JavaScript prêt pour la production. |
| `npm run test` | Exécute les tests unitaires sur les services métier. |
| `npm run test:e2e` | Exécute la suite complète de tests d'intégration E2E. |
| `npm run test:cov` | Mesure et affiche la couverture globale du code par les tests. |

---

## 🧪 Validation & Suite de Tests

Tous les composants de l'application sont validés par 110 tests d'intégration E2E et des tests unitaires :
```bash
# Lancer les tests d'intégration
npm run test:e2e

# Lancer la couverture de code
npm run test:cov
```
*(La couverture actuelle de code est supérieure à 90% sur l'ensemble de la codebase).*
