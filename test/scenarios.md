# 📋 ReaDBrary Test Scenarios Summary

This document presents a comprehensive summary of all existing test suites and scenarios in the **ReaDBrary** codebase. You can use this checklist to verify that all required features and edge cases are covered.

---

## 🔍 Overview of Test Suites

ReaDBrary tests are split into two main categories:
1. **E2E / Integration Tests** (located in the [`test/`](file:///c:/Users/rydra/Documents/ReaDBrary/test) directory): Verify complete API routes, role-based authorization, database interactions, and business constraints using an active test database.
2. **Unit Tests** (located in the [`src/`](file:///c:/Users/rydra/Documents/ReaDBrary/src) directory): Verify individual services and controllers in isolation with mocked dependencies.

---

## 🛡️ E2E & Integration Tests (`test/` directory)

### 1. 🔑 [Authentication Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/auth.integration.e2e-spec.ts)
* **Suite Name**: `Authentication (e2e)`
* **Description**: Verifies the correct bootstrap of the application with a mocked `Better Auth` system.

| Test Scenario | Expected Result | Status |
| :--- | :--- | :---: |
| Should start the server with mocked Better Auth | Application bootstraps successfully without auth failures |  |

---

### 🚀 2. [App Router Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/app.e2e-spec.ts)
* **Suite Name**: `AppController (e2e)`
* **Description**: Simple health check verification.

| HTTP Method & Route | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| `GET /` | Should return root message | Status `200` with text `"Hello World!"` |  |

---

### 🗄️ 3. [Prisma Connection Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/prisma.integration.e2e-spec.ts)
* **Suite Name**: `Prisma Integration & Database Connection`
* **Description**: Ensures the connection to the PostgreSQL test database is healthy and database cleaning/writing is working.

| Test Scenario | Expected Result | Status |
| :--- | :--- | :---: |
| Should be able to create a club in the test database | Club is successfully created and verified by reading it back |  |

---

### 👥 4. [Club Members Management Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/club-members.integration.e2e-spec.ts)
* **Suite Name**: `Club Members Module (e2e)`
* **Description**: Verifies membership association, roles (`OWNER`, `EDITOR`, `READER`), listing members, and updating/removing members.

| HTTP Method & Route | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| `POST /clubs/:clubSlug/members` | Add a member with a specified role | Status `201`, member role is set correctly (e.g. `EDITOR`) |  |
| `POST /clubs/:clubSlug/members` | Add a member with default role | Status `201`, role defaults to `READER` |  |
| `POST /clubs/:clubSlug/members` | Add duplicate member | Status `409 Conflict`, error: `"déjà membre"` |  |
| `POST /clubs/:clubSlug/members` | Add member to non-existent club | Status `404 Not Found` |  |
| `POST /clubs/:clubSlug/members` | Add non-existent user to club | Status `404 Not Found` |  |
| `GET /clubs/:clubSlug/members` | List members of a club | Status `200`, returns list of members with user profiles |  |
| `GET /clubs/:clubSlug/members` | List members of non-existent club | Status `404 Not Found` |  |
| `PATCH /clubs/:clubSlug/members/:userId` | Update member role | Status `200`, member role is updated in the database |  |
| `PATCH /clubs/:clubSlug/members/:userId` | Update role of non-member user | Status `404 Not Found` |  |
| `PATCH /clubs/:clubSlug/members/:userId` | Update member role with invalid role name | Status `400 Bad Request` |  |
| `DELETE /clubs/:clubSlug/members/:userId` | Remove member from the club | Status `200`, membership relation is deleted |  |
| `DELETE /clubs/:clubSlug/members/:userId` | Remove non-member user from club | Status `404 Not Found` |  |

---

### 🏛️ 5. [Clubs Management Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/club.integration.e2e-spec.ts)
* **Suite Name**: `Clubs Module (e2e)`
* **Description**: Handles club creation, slug auto-generation, filtering active/inactive clubs depending on authorization, updating names, changing club status, and deleting clubs.

| HTTP Method & Route | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| `POST /clubs` | Create club with custom slug | Status `201`, slug is exactly what was requested |  |
| `POST /clubs` | Create club without slug | Status `201`, auto-generates slug from club name |  |
| `POST /clubs` | Create club with special characters in name | Status `201`, name is slugified properly (e.g. `Café...` ➔ `cafe...`) |  |
| `POST /clubs` | Create club with conflicting slug | Status `409 Conflict`, message: `"est déjà utilisé"` |  |
| `GET /clubs` | List all clubs | Status `200`, returns array of clubs |  |
| `GET /clubs` | List clubs - Anonymous Visitor | Status `200`, hides inactive clubs (`isActive: false`) |  |
| `GET /clubs` | List clubs - Global Administrator | Status `200`, displays all active and inactive clubs |  |
| `GET /clubs` | List clubs - Club Owner | Status `200`, displays inactive clubs owned by this user |  |
| `GET /clubs` | List clubs - Non-Owner User | Status `200`, hides inactive clubs not owned by this user |  |
| `GET /clubs` | List clubs - Filter by name | Status `200`, case-insensitive search by name |  |
| `GET /clubs` | List clubs - Pagination | Status `200`, correct limit and offsets applied |  |
| `GET /clubs/:id` | Get club by ID | Status `200`, returns club details |  |
| `GET /clubs/:id` | Get club by ID - Non-existent ID | Status `404 Not Found` |  |
| `GET /clubs/:id` | Get inactive club - Visitor / Standard Member | Status `404 Not Found` |  |
| `GET /clubs/:id` | Get inactive club - Owner / Admin | Status `200`, allows access to inactive club |  |
| `PATCH /clubs/:id` | Update club name and slug | Status `200`, updates details, auto-slugifies new slug |  |
| `PATCH /clubs/:id` | Update non-existent club | Status `404 Not Found` |  |
| `PATCH /clubs/:id` | Update slug causing conflict | Status `409 Conflict` |  |
| `PATCH /clubs/:id` | Update `isActive` status - Unauth / Editor | Status `403 Forbidden` |  |
| `PATCH /clubs/:id` | Update `isActive` status - Owner / Admin | Status `200`, status updated successfully |  |
| `DELETE /clubs/:id` | Delete club | Status `200`, club deleted from database |  |
| `DELETE /clubs/:id` | Delete non-existent club | Status `404 Not Found` |  |

---

### 📚 6. [Books Management Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/books.integration.e2e-spec.ts)
* **Suite Name**: `Books Module (e2e)`
* **Description**: Verifies creation, listing, updating, deleting, and CSV exporting of books, along with role validations and book visibility depending on active status.

| HTTP Method & Route | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| `POST /clubs/:clubSlug/books` | Create book - Owner | Status `201`, book created under specified club |  |
| `POST /clubs/:clubSlug/books` | Create book - Editor | Status `201` |  |
| `POST /clubs/:clubSlug/books` | Create book - Reader | Status `403 Forbidden` |  |
| `POST /clubs/:clubSlug/books` | Create book - Unauthenticated | Status `401 Unauthorized` |  |
| `POST /clubs/:clubSlug/books` | Create book - Global Admin (Non-member) | Status `201`, Admin bypasses club membership |  |
| `POST /clubs/:clubSlug/books` | Create book - Validation failures | Status `400 Bad Request` with field validation errors |  |
| `GET /clubs/:clubSlug/books` | List books - Reader | Status `200`, returns list of books |  |
| `GET /clubs/:clubSlug/books` | List books - Filter by author | Status `200`, returns only matched author |  |
| `GET /clubs/:clubSlug/books` | List books - Filter by genre | Status `200`, case-insensitive genre match |  |
| `GET /clubs/:clubSlug/books` | List books - Pagination | Status `200`, correct slice of books returned |  |
| `GET /clubs/:clubSlug/books` | List books - Inactive books visibility | `Reader`/`Editor` see only active books; `Owner`/`Admin` see inactive books |  |
| `GET /clubs/:clubSlug/books` | List books - Non-member access | Status `403 Forbidden` |  |
| `GET /clubs/:clubSlug/books/:id` | Get book details - Club Member | Status `200`, returns single book data |  |
| `GET /clubs/:clubSlug/books/:id` | Get book details - Non-existent ID | Status `404 Not Found` |  |
| `GET /clubs/:clubSlug/books/:id` | Get book details - Inactive book | `Reader`/`Editor` receive `404`; `Owner`/`Admin` receive `200` |  |
| `PATCH /clubs/:clubSlug/books/:id` | Update book - Editor | Status `200`, updates title/pages |  |
| `PATCH /clubs/:clubSlug/books/:id` | Update book - Reader | Status `403 Forbidden` |  |
| `PATCH /clubs/:clubSlug/books/:id` | Update `isActive` status - Editor | Status `403 Forbidden` |  |
| `PATCH /clubs/:clubSlug/books/:id` | Update `isActive` status - Owner / Admin | Status `200`, updates status successfully |  |
| `PATCH /clubs/:clubSlug/books/:id` | Update inactive book - Editor | Status `404 Not Found` (inactive book is invisible) |  |
| `DELETE /clubs/:clubSlug/books/:id` | Delete book - Owner | Status `200`, book is deleted |  |
| `DELETE /clubs/:clubSlug/books/:id` | Delete book - Reader | Status `403 Forbidden` |  |
| `GET /clubs/:clubSlug/books/export` | CSV Export - Club Member | Status `200`, returns CSV file formatted data |  |
| `GET /clubs/:clubSlug/books/export` | CSV Export - Non-member | Status `403 Forbidden` |  |
| `GET /clubs/:clubSlug/books/export` | CSV Export - Inactive book visibility | `Reader` doesn't see inactive books; `Owner` sees them in CSV |  |

---

### 📄 7. [Book Pages Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/pages.integration.e2e-spec.ts)
* **Suite Name**: `Pages Module (e2e)`
* **Description**: Verifies creation, ordering, updating, deleting, image upload, and index shifting of book pages.

| HTTP Method & Route | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| `POST /clubs/:clubSlug/books/:bookId/pages` | Create page - Editor / Owner | Status `201`, page created |  |
| `POST /clubs/:clubSlug/books/:bookId/pages` | Insert page causing index shift | Status `201`, subsequent pages shifted up (e.g. `1➔2`, `2➔3`) |  |
| `POST /clubs/:clubSlug/books/:bookId/pages` | Create page - Reader | Status `403 Forbidden` |  |
| `POST /clubs/:clubSlug/books/:bookId/pages` | Create page with out-of-bounds index | Status `400 Bad Request` |  |
| `POST /clubs/.../pages/upload` | Upload page image file | Status `201`, uploads file and returns its URL path |  |
| `GET /clubs/:clubSlug/books/:bookId/pages` | List pages with pagination | Status `200`, returns paginated pages list and metadata |  |
| `GET /clubs/:clubSlug/books/:bookId/pages/:index` | Get specific page by index | Status `200` if exists, `404` if index doesn't exist |  |
| `GET /clubs/:clubSlug/books/:bookId/pages/:index` | Get page of deactivated book | `Reader` receives `404`; `Owner` receives `200` |  |
| `PATCH /clubs/:clubSlug/books/:bookId/pages/:index` | Update page index (with shifting) | Status `200`, updates text and shifts other pages' indices |  |
| `DELETE /clubs/:clubSlug/books/:bookId/pages/:index` | Delete page and shift subsequent down | Status `200`, page deleted, other page indices decremented |  |
| `GET /clubs/:clubSlug/books/:bookId/progression` | Get progression with page details | Progression payload includes `currentPageDetails` object |  |

---

### 📈 8. [Reader Progression Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/progression.integration.e2e-spec.ts)
* **Suite Name**: `Progression Module (e2e)`
* **Description**: Checks how reading progression is saved and fetched, page index bounds verification, and permissions.

| HTTP Method & Route | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| `PATCH /clubs/.../progression` | Create new reading progression | Status `200`, saves progression and computes percentage |  |
| `PATCH /clubs/.../progression` | Update existing progression | Status `200`, updates to new page |  |
| `PATCH /clubs/.../progression` | Update progression - Non-member | Status `403 Forbidden` |  |
| `PATCH /clubs/.../progression` | Update progression - Unauthenticated | Status `401 Unauthorized` |  |
| `PATCH /clubs/.../progression` | Update progression - Negative page | Status `400 Bad Request` |  |
| `PATCH /clubs/.../progression` | Update progression - Decimal page | Status `400 Bad Request` |  |
| `PATCH /clubs/.../progression` | Update progression - Exceeds book pages | Status `400 Bad Request` with boundary warning |  |
| `PATCH /clubs/.../progression` | Update progression - Non-existent book | Status `404 Not Found` |  |
| `PATCH /clubs/.../progression` | Update progression - Inactive book | `Reader` receives `404`; `Owner`/`Admin` receive `200` |  |
| `GET /clubs/.../progression` | Get my progression - None recorded yet | Status `200`, returns `currentPage: 0`, percentage `0` |  |
| `GET /clubs/.../progression` | Get my progression - Saved progression | Status `200`, returns accurate progress |  |
| `GET /clubs/.../progression` | Get my progression - Non-member | Status `403 Forbidden` |  |
| `GET /clubs/.../progression` | Get my progression - Inactive book | `Reader` receives `404`; `Owner`/`Admin` receive `200` |  |
| `GET /clubs/.../progressions` | Get club progressions - Owner | Status `200`, returns details for all members |  |
| `GET /clubs/.../progressions` | Get club progressions - Editor | Status `200`, returns details for all members |  |
| `GET /clubs/.../progressions` | Get club progressions - Reader | Status `403 Forbidden` |  |
| `GET /clubs/.../progressions` | Get club progressions - Non-member | Status `403 Forbidden` |  |
| `GET /clubs/.../progressions` | Get club progressions - Inactive book | `Editor` receives `404`; `Owner`/`Admin` receive `200` |  |

---

### ⭐ 9. [Book Reviews Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/reviews.integration.e2e-spec.ts)
* **Suite Name**: `Reviews Module (e2e)`
* **Description**: Verifies commenting, ratings constraints, average rating logic, and reviews visibility.

| HTTP Method & Route | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| `POST /clubs/.../reviews` | Create review - Reader | Status `201`, review successfully posted |  |
| `POST /clubs/.../reviews` | Create review - Non-member | Status `403 Forbidden` |  |
| `POST /clubs/.../reviews` | Create review - Unauthenticated | Status `401 Unauthorized` |  |
| `POST /clubs/.../reviews` | Create review - Invalid rating (0 or 6) | Status `400 Bad Request` |  |
| `POST /clubs/.../reviews` | Create review - Floating point rating (e.g. 4.5) | Status `400 Bad Request` |  |
| `POST /clubs/.../reviews` | Create review - Duplicate review | Status `409 Conflict`, message: `"déjà donné votre avis"` |  |
| `POST /clubs/.../reviews` | Create review - Non-existent book | Status `404 Not Found` |  |
| `POST /clubs/.../reviews` | Create review - Inactive book | `Reader` receives `404`; `Owner`/`Admin` receive `201` |  |
| `GET /clubs/.../reviews` | List book reviews - Club Member | Status `200`, returns review comments & user profiles |  |
| `GET /clubs/.../reviews` | List book reviews - Non-member | Status `403 Forbidden` |  |
| `GET /clubs/.../reviews` | List reviews - Inactive book | `Reader` receives `404`; `Owner`/`Admin` receive `200` |  |
| `GET /clubs/.../books/:id` | Average rating calculation - No reviews | Returns `averageRating: null` in book details |  |
| `GET /clubs/.../books/:id` | Average rating calculation - Multiple reviews | Returns arithmetic average rating (e.g. `3.5`) in details and list |  |

---

### 🛡️ 10. [Global Administration Module Tests](file:///c:/Users/rydra/Documents/ReaDBrary/test/admin.integration.e2e-spec.ts)
* **Suite Name**: `Administration Module (e2e)`
* **Description**: Verifies admin-only routes, user status moderation, and bulk imports via CSV.

| HTTP Method & Route | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| `GET /admin/users` | Admin Access check - Unauthenticated | Status `401 Unauthorized` |  |
| `GET /admin/users` | Admin Access check - Standard User | Status `403 Forbidden`, message: `"Accès réservé..."` |  |
| `GET /admin/users` | Admin Access check - Administrator | Status `200`, lists all system users |  |
| `POST /admin/users/:id/deactivate` | Deactivate user | Status `201`, marks `isActive: false` |  |
| `POST /admin/users/:id/reactivate` | Reactivate user | Status `201`, marks `isActive: true` |  |
| `GET /clubs/:clubSlug/books` | Access deactivated user check | Status `403 Forbidden`, message containing `"désactivé"` |  |
| `POST /admin/clubs/:slug/books/import` | CSV Import Books - Valid data | Status `201`, returns success count and inserts all books |  |
| `POST /admin/clubs/:slug/books/import` | CSV Import Books - Validation failure | Status `400 Bad Request`, transactional rollback (no books inserted) |  |
| `POST /admin/clubs/:slug/books/import` | CSV Import Books - Inexistent club | Status `404 Not Found` |  |
| `POST /admin/clubs/:slug/members/import` | CSV Import Members - Valid roles & users | Status `201`, inserts/updates roles (e.g. Reader ➔ Editor) |  |
| `POST /admin/clubs/:slug/members/import` | CSV Import Members - Inexistent user | Status `400 Bad Request`, transactional rollback (no updates) |  |
| `POST /admin/clubs/:slug/members/import` | CSV Import Members - Invalid role | Status `400 Bad Request`, transactional rollback (no updates) |  |
| `DELETE /admin/reviews/:id` | Delete review - Admin | Status `200`, deletes review |  |
| `DELETE /admin/reviews/:id` | Delete review - Unauthenticated | Status `401 Unauthorized` |  |
| `DELETE /admin/reviews/:id` | Delete review - Standard User | Status `403 Forbidden` |  |
| `DELETE /admin/reviews/:id` | Delete review - Inexistent review | Status `404 Not Found` |  |

---

## 🧪 Unit Tests (`src/` directory)

### 🧩 1. [App Controller Unit](file:///c:/Users/rydra/Documents/ReaDBrary/src/app.controller.spec.ts)
* **Suite Name**: `AppController`
* **Description**: Verifies the basic controller endpoint return values.

| Test Scenario | Expected Result | Status |
| :--- | :--- | :---: |
| `root` ➔ should return "Hello World!" | Controller returns exactly `"Hello World!"` |  |

---

### 🧩 2. [Clubs Controller Unit](file:///c:/Users/rydra/Documents/ReaDBrary/src/clubs/clubs.controller.spec.ts)
* **Suite Name**: `ClubsController`
* **Description**: Verifies NestJS controller instantiation.

| Test Scenario | Expected Result | Status |
| :--- | :--- | :---: |
| should be defined | Controller compiles and instantiates successfully |  |

---

### 🧩 3. [Clubs Service Unit](file:///c:/Users/rydra/Documents/ReaDBrary/src/clubs/clubs.service.spec.ts)
* **Suite Name**: `ClubsService`
* **Description**: Verifies service class initialization with mocked Prisma database client.

| Test Scenario | Expected Result | Status |
| :--- | :--- | :---: |
| should be defined | Service compiles and instantiates successfully |  |
