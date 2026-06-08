# 📚 BookShelf — Collaborative Reading Platform API

BookShelf is a robust NestJS API designed to manage **collaborative reading clubs**. It allows users to create clubs, invite members with specific roles, share libraries of books, track their reading progression page by page, add reviews and average ratings to books, and manage everything via an administration console.

---

## 🚀 Technical Stack

- **NestJS** : Progressive and modular Node.js framework.
- **Prisma ORM** : ORM for clean interaction with the PostgreSQL database.
- **Better Auth** : Global and secure authentication.
- **Docker** : Containerization of PostgreSQL for development and testing.
- **Swagger / OpenAPI** : Interactive and typed documentation for the entire API.
- **Jest & Supertest** : Complete suite of unit tests and E2E integration tests.

---

## 📂 API Application Modules

The application is structured in a modular way:

1. **`Authentication`** : Registration, login, logout, and session management natively handled by Better Auth.
2. **`Administration`** :
   - Activation and deactivation of user accounts.
   - Bulk import of books in CSV format (transactional and validated).
   - Bulk import of club members in CSV format.
3. **`Clubs`** : Complete CRUD of clubs with search filtering and pagination, and visibility management of inactive clubs.
4. **`Club Members`** : Management of internal roles (`OWNER`, `EDITOR`, `READER`) and member exclusion.
5. **`Books`** : CRUD of a club's books, with multi-criteria filtering, pagination, and visibility control according to roles.
6. **`Book Pages`** : Dynamic and ordered (gapless) management of book pages with automatic shifting (transactional) during writes or moves, and image upload.
7. **`Reading Progression`** : Individual bookmark per book with percentage calculation, and global dashboard for owners/editors.
8. **`Reviews`** : Rating of books (1 to 5 stars) with uniqueness constraint (only one review per book per user) and update of the book's overall average rating.

---

## ⚙️ Configuration & Setup

### 1. Environment Variables
Copy the example file and configure your secrets:
```bash
cp .env.example .env
```
*(The `.env.example` file already contains the default configurations ready for local development via Docker).*

### 2. Startup Options

You can run the application in two different modes depending on your development preferences:

#### Option A: Hybrid Mode (Recommended for Active Development)
In this mode, the databases run in Docker containers in the background, while the NestJS server runs locally on your host machine. This provides the fastest compilation times and best hot-reload feedback.

1. **Start the databases in the background:**
   ```bash
   docker compose up -d db db-test
   ```
2. **Apply migrations and seed the databases:**
   ```bash
   npm run db:migrate:all
   ```
3. **Start the NestJS API server locally:**
   ```bash
   npm run start:dev
   ```

#### Option B: Full Containerized Mode (Entire Stack in Docker)
In this mode, both the databases and the NestJS API server run inside Docker containers.

1. **Start and compile the entire stack:**
   ```bash
   docker compose up -d --build
   ```
2. **Apply migrations to the databases:**
   ```bash
   npm run db:migrate:all
   ```

The application listens by default on port `3000`.

---

## 📝 Interactive API Documentation (Swagger UI)

An interactive Swagger interface is accessible locally at:
👉 **`http://localhost:3000/api`**

There you will find:
- All 8 documented modules with their routes.
- The data schemas required for requests (validated DTOs).
- Bearer Token support (`Authorize`) to directly test authenticated routes from your browser.

---

## 🔧 Available Scripts

| Command | Action |
| :--- | :--- |
| `npm install` | Installs project dependencies. |
| `npm run start:dev` | Starts the local NestJS server in watch mode. |
| `npm run db:migrate:all` | Applies Prisma migrations on the dev and test databases. |
| `npm run build` | Compiles the TypeScript project into production-ready JavaScript. |
| `npm run test` | Runs unit tests on business services. |
| `npm run test:e2e` | Runs the full suite of E2E integration tests. |
| `npm run test:cov` | Measures and displays global test coverage of the code. |

---

## 🧪 Validation & Test Suite

All components of the application are validated by 110 E2E integration tests and unit tests:
```bash
# Run integration tests
npm run test:e2e

# Run code coverage
npm run test:cov
```
*(Current code coverage is above 90% across the entire codebase).*

---

## 🌐 Production Deployment (VPS)

To deploy BookShelf on a VPS using Docker:

### 1. Build the Production Image
From the root of the project, run the build using the `prod` target:
```bash
docker build --target prod -t readbrary-api:latest .
```

### 2. Configure Persistent Volumes
Since uploaded images for chapters are stored in `/usr/src/app/uploads`, you **must** mount a persistent volume from the host VPS to prevent losing assets when the container restarts.

### 3. Run Database Migrations
Before launching the application container, run the database migrations on your production database:
```bash
docker run --rm \
  -e DATABASE_URL="postgresql://user:password@db-host:5432/dbname" \
  readbrary-api:latest \
  npx prisma migrate deploy
```

### 4. Running via Docker Compose
Here is an example `docker-compose.prod.yml` configuration:

```yaml
version: '3.8'

services:
  api:
    image: readbrary-api:latest
    container_name: readbrary-api-prod
    restart: always
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:password@db-host:5432/dbname
      - BETTER_AUTH_SECRET=your_better_auth_secret
      # ... other environment variables
    volumes:
      - /var/lib/readbrary/uploads:/usr/src/app/uploads
```

## FRONTEND

The Frontend of the application can be found at this Github repository :

> [https://github.com/Axcerii/Heritage-Silencieux](https://github.com/Axcerii/Heritage-Silencieux)