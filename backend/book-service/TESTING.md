# Isolated PostgreSQL tests

The development Compose service and datasource are unchanged. Test resources are
loaded only on the test classpath; no active profile is required. Every current
Spring Boot test context (including JPA and MVC slices) loads the registered
`IsolatedTestDatabaseInitializer`. Missing configuration fails closed. Pure unit
tests do not need PostgreSQL.

## Local setup

The independent `docker-compose.tests.yml` uses project `mi-biblioteca-tests`,
container `mi-biblioteca-postgres-tests`, host `127.0.0.1:5433`, and volume
`mi-biblioteca-tests_postgres-tests-data`. It never mounts the main data volume.
It initializes `bookdb_tests` and a non-superuser owner `booktest`; the separate
bootstrap administrator is not used by application tests.

Local random credentials live in the Git-ignored `.env.test-db` at repository
root. Never commit it or print `docker compose config` with interpolated secrets.
Passwords must be two independent 64-character lowercase hexadecimal strings:

```text
TEST_DB_PASSWORD=<local generated secret>
TEST_DB_ADMIN_PASSWORD=<different local generated secret>
```

From repository root, load the local credentials and start only the test service:

```powershell
. ./scripts/Use-TestDatabase.ps1
docker compose -f docker-compose.tests.yml --env-file .env.test-db up -d --pull never --wait
```

Before first startup, check project/container/volume names and port 5433 for
collisions. Do not overwrite an existing secrets file or reuse an unrelated
volume. Initialization runs only on an empty volume: editing the secrets file
later does not rotate database passwords. Never remove volumes to fix a failure.

## Safety checks before running integration tests

Verify mounts, localhost-only port binding, and that the test server contains no
`bookdb` or `bookdb_restore_test` database and no `booksvc` role. Confirm that the
two clusters have different system identifiers. Tests must never use the bootstrap
administrator or the original server. Do not restore the library backup into the
test database: use the separate restore-validation database for comparisons.

The guard accepts only `jdbc:postgresql://127.0.0.1:5433/bookdb_tests` and `booktest`,
checks datasource/Flyway/Hikari overrides again before beans are instantiated,
and performs a read-only server-identity check before Flyway/Hibernate. It rejects
servers containing the original/restore databases or an administrative test role.
Production `DB_URL` variables cannot supply missing `TEST_DB_*` settings.

Once isolation has been independently verified, run from `backend/book-service`
in the same shell:

```powershell
./mvnw.cmd clean test
```

Migration, concurrency, filter, repository and cover integration tests write or
delete data and may commit. They belong exclusively in the disposable test
cluster. Cover tests use temporary directories or `target/test-covers`, not the
development cover directory. Do not run a backend with test dependencies or
destructive migrations against the original database. No V10 is part of this setup.
