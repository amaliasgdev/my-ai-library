# AGENTS.md

## Project overview

Project name: My AI Library

Repository root:
C:\mis-proyectos\mi-biblioteca

This project is a personal library management application that will later include AI-assisted functionality.

The project is being built incrementally. Do not introduce functionality that has not been explicitly requested.

---

## Current architecture

Backend:
- Java 21
- Spring Boot 3.5.16
- Maven Wrapper
- Spring Web
- Spring Data JPA
- Jakarta Validation
- Spring Boot Actuator
- Flyway
- PostgreSQL 16

Containerization:
- Docker Compose

Current backend service:
- book-service

book-service location:
- backend/book-service

book-service port:
- 8081

Database:
- PostgreSQL 16
- Database name: bookdb
- Development user: booksvc

---

## Project structure

Current expected structure:

```text
mi-biblioteca/
├── AGENTS.md
├── README.md
├── .gitignore
├── docker-compose.yml
└── backend/
    └── book-service/
        ├── .mvn/
        ├── mvnw
        ├── mvnw.cmd
        ├── pom.xml
        └── src/
            ├── main/
            │   ├── java/
            │   │   └── com/mibiblioteca/bookservice/
            │   └── resources/
            │       ├── application.yml
            │       └── db/migration/
            └── test/
```

Do not reorganize the project structure unless explicitly requested.

---

## Java package rules

Base package:

```text
com.mibiblioteca.bookservice
```

All new Java packages must remain under this base package.

Use clear package names based on responsibility.

For example:

```text
com.mibiblioteca.bookservice.book
com.mibiblioteca.bookservice.book.api
com.mibiblioteca.bookservice.book.dto
com.mibiblioteca.bookservice.book.persistence
com.mibiblioteca.bookservice.book.service
com.mibiblioteca.bookservice.common.exception
```

Do not create empty packages unnecessarily.

---

## Coding guidelines

Use:
- constructor injection
- Spring Data JPA repositories
- DTOs at the REST API boundary
- Jakarta Validation
- clear naming
- small focused classes
- thin controllers
- business logic in services
- persistence logic in repositories

Avoid:
- field injection with @Autowired
- exposing JPA entities directly from controllers
- unnecessary abstractions
- premature generic frameworks
- unnecessary inheritance
- static utility classes when normal services are clearer
- duplicated logic

Do not add Lombok unless explicitly requested.

Prefer simple and readable code over clever code.

---

## REST API conventions

REST endpoints should use:

```text
/api/...
```

Controllers should:
- receive request DTOs
- validate input
- delegate business logic to services
- return response DTOs

Controllers must not contain persistence logic.

Use appropriate HTTP status codes.

Examples:
- 200 OK
- 201 Created
- 204 No Content
- 400 Bad Request
- 404 Not Found

---

## DTO rules

Do not expose JPA entities directly through REST endpoints.

Use dedicated request and response DTOs.

Prefer Java records for simple immutable DTOs when appropriate.

Validation belongs on request DTOs.

Examples:
- @NotBlank
- @Size
- @Pattern

---

## JPA and persistence rules

Use JPA/Hibernate for application persistence.

Hibernate must not create or modify the database schema.

Keep:

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate
```

Schema changes must be managed only through Flyway migrations.

Do not change ddl-auto to:
- create
- create-drop
- update

unless explicitly requested.

---

## Flyway rules

All database schema changes must use Flyway.

Migration directory:

```text
backend/book-service/src/main/resources/db/migration
```

Use Flyway naming conventions such as:

```text
V1__create_book_table.sql
V2__add_book_status.sql
V3__add_book_index.sql
```

Never edit an already-applied migration to change database history.

Create a new migration instead.

---

## Database conventions

Database:
- PostgreSQL 16

Prefer:
- snake_case table names
- snake_case column names
- explicit constraints
- appropriate indexes
- NOT NULL where the domain requires it

Do not add tables or relationships outside the requested feature.

---

## Git workflow

Branches:

```text
main
develop
feature/*
chore/*
fix/*
```

Rules:

- main is the stable branch.
- develop is the integration branch.
- New functionality starts from develop.
- Configuration or maintenance work uses chore/*.
- Bug fixes use fix/*.
- Do not commit feature work directly to main.
- Do not commit feature work directly to develop.
- Merge feature and chore branches into develop through Pull Requests.
- Later, stable releases move from develop to main through a Pull Request.

Before starting new work:
1. verify the current branch
2. verify that it was created from develop when appropriate

Do not create or rename branches unless the user requests it.

Do not push or merge unless explicitly requested.

---

## Commit conventions

Use concise Conventional Commit style messages.

Examples:

```text
feat: add book creation endpoint
feat: implement book CRUD
fix: handle missing book
chore: initialize book-service environment
test: add book service tests
refactor: simplify book mapping
docs: update project documentation
```

Do not create commits unless explicitly requested.

---

## Testing rules

New functionality should include appropriate automated tests.

At minimum:
- service-level tests for business logic
- controller tests when REST behavior needs verification
- repository/integration tests when persistence behavior needs verification

Before considering implementation complete, run:

```text
mvnw clean test
```

On Windows:

```text
.\mvnw.cmd clean test
```

Report:
- test count
- failures
- errors
- skipped tests

Do not claim tests pass unless they were actually executed.

---

## Docker rules

Docker Compose file:

```text
docker-compose.yml
```

Current service:
- PostgreSQL 16

Do not add new Docker services unless explicitly requested.

Before running commands that:
- download Docker images
- delete volumes
- remove containers
- destroy persistent data

ask for permission.

Never run:

```text
docker compose down -v
```

without explicit permission because it deletes persistent database data.

---

## External downloads and destructive actions

Ask for permission before:
- downloading new Docker images
- adding large or unexpected dependencies
- deleting files
- deleting Git branches
- force pushing
- deleting Docker volumes
- resetting Git history
- modifying files outside the repository root

Do not modify anything outside:

```text
C:\mis-proyectos\mi-biblioteca
```

unless explicitly requested.

---

## Dependency rules

Do not change:
- Java version
- Spring Boot version
- PostgreSQL version
- Maven build setup
- major dependencies

unless explicitly requested.

Current versions:

```text
Java 21
Spring Boot 3.5.16
PostgreSQL 16
```

Do not migrate to Spring Boot 4 unless explicitly requested.

---

## Scope restrictions

Do not add the following unless explicitly requested:

- Angular frontend
- authentication
- authorization
- users
- API gateway
- AI integration
- external AI providers
- messaging systems
- Kafka
- Redis
- Elasticsearch
- loans
- lending workflow
- genres as separate entities
- authors as separate entities
- microservices beyond the current scope

Do not over-engineer future requirements.

Implement only the current requested scope.

---

## Current completed state

The environment setup is complete.

Verified:
- Java 21 works
- Maven Wrapper works
- Spring Boot 3.5.16 builds successfully
- PostgreSQL 16 runs with Docker Compose
- PostgreSQL healthcheck is healthy
- book-service starts on port 8081
- Actuator health endpoint returns UP
- JPA is configured
- Flyway is configured
- Git repository is configured
- main and develop branches exist
- Basic Book CRUD is implemented
- Book search is implemented
- Book reading status is implemented
- Book rating is implemented
- Book reading dates are implemented
- Flyway migrations: V1 (book table), V2 (reading status), V3 (rating), V4 (reading dates)
- OpenAPI documentation is available

---

## Current planned feature

Book CRUD is completed.

Book search is completed.

Book reading status is completed.

Book rating is completed.

Book reading dates are completed.

OpenAPI documentation is completed.

The current planned functionality is book pagination.

Initial Book fields:

```text
id
title
author
isbn
description
createdAt
updatedAt
readingStatus
rating
startedOn
finishedOn
```

Current CRUD endpoints:

```text
POST   /api/books
GET    /api/books?page=0&size=20&sortBy=title&direction=ASC
GET    /api/books/{id}
PUT    /api/books/{id}
DELETE /api/books/{id}
PATCH  /api/books/{id}/reading-status
PUT    /api/books/{id}/rating
DELETE /api/books/{id}/rating
POST   /api/books/{id}/start-reading
POST   /api/books/{id}/finish-reading
PUT    /api/books/{id}/reading-dates
DELETE /api/books/{id}/reading-dates
```

Search endpoints:

```text
GET /api/books/search?title=...
GET /api/books/search?author=...
GET /api/books/search?isbn=...
GET /api/books/search?title=...&author=...
```

Search rules planned:

```text
- title and author: partial + case-insensitive
- title + author combined with AND
- isbn: exact match over normalized value
- isbn cannot be combined with title/author
- no search criteria returns 400
```

Search components:

```text
BookRepository
BookService
BookController
search request DTO
validation
tests
```

Reading status rules:

```text
TO_READ (default)
READING
READ
ABANDONED
```

Update endpoint:

```text
PATCH /api/books/{id}/reading-status
```

Rating rules:

```text
- Optional integer from 1 to 5
- null means not rated
- PUT /api/books/{id}/rating sets a rating
- DELETE /api/books/{id}/rating clears it
- The rating is independent of reading status
```

Persist enums as STRING. When the allowed values need database enforcement, add a CHECK constraint through a new Flyway migration.
Optional constrained fields such as rating should also be protected with a database CHECK constraint.

Reading dates rules:

```text
- startedOn and finishedOn are LocalDate values persisted as DATE
- finishedOn cannot be earlier than startedOn
- start-reading: TO_READ -> READING
- finish-reading: TO_READ or READING -> READ
- PATCH /reading-status does not change dates
- ABANDONED preserves existing dates
```

Pagination rules:

```text
- GET /api/books returns BookPageResponse, not a JSON array
- Defaults: page=0, size=20, sortBy=title, direction=ASC
- page is zero-based; size must be 1 to 100
- sortBy is limited to id, title, author, createdAt, updatedAt, readingStatus, rating, startedOn, finishedOn
- id ASC is used as a secondary sort except when sortBy=id
```

Do not implement additional fields or relationships unless requested.

---

## API documentation

- Swagger UI: `/swagger-ui.html`
- OpenAPI JSON: `/v3/api-docs`
- Spring Boot 3.x uses `springdoc-openapi-starter-webmvc-ui` 2.x. Do not use springdoc 3.x unless Spring Boot is migrated to 4.x.
- Add `@Operation` and the relevant error `@ApiResponse` annotations to every new REST endpoint.
- Do not duplicate validation constraints or obvious parameter metadata that springdoc infers from Spring MVC and Jakarta Validation.
- Update `OpenApiDocumentationTest` when API routes change.

---

## Agent working rules

Before modifying files:

1. Read this AGENTS.md.
2. Inspect the current Git branch.
3. Inspect the existing project structure.
4. Inspect relevant existing files before overwriting anything.
5. Preserve working code.
6. Stay within the requested scope.
7. Explain significant architectural decisions.
8. Ask before destructive operations.
9. Ask before unexpected external downloads.
10. Do not silently change versions or architecture.

When a task is complete, report:

- files created
- files modified
- important implementation decisions
- commands executed
- test results
- any remaining issues

Do not automatically start the next feature.

Wait for explicit user instruction.
