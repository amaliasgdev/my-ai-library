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

### Reading-list migration fixture

Before running the full suite for the first time on an existing test volume,
prepare the additional disposable migration database from the repository root:

```powershell
python scripts/Prepare-ReadingListMigrationDatabase.py
```

The script verifies the independent test container, loopback port, volume and
server identity before creating `bookdb_tests_reading_list_migration`, owned by
the non-administrative `booktest` role. It never drops or overwrites a database.
The test JVM does not receive bootstrap administrator credentials.

`ReadingListMigrationTest` verifies its fixed destination before each migration
or cleanup and cleans only `public` in that disposable database. This separate
database is necessary because historical V10 explicitly targets `public`, so
using another schema in the shared test database would not isolate its DDL.
Do not run concurrent suites sharing this fixture. See
`READING-LIST-PERSISTENCE.md` for coverage and the boundaries of this stage.

Migration, concurrency, filter, repository and cover integration tests write or
delete data and may commit. They belong exclusively in the disposable test
cluster. Cover tests use temporary directories or `target/test-covers`, not the
development cover directory. Do not run a backend with test dependencies or
destructive migrations against the original database. The full migration history,
including V10 and V11, is applied only to the guarded isolated test destinations;
the original and restore-validation databases are never test targets.

## Full reading-list validation (Stage 6)

From repository root, after verifying that the existing isolated container is healthy:

```powershell
. ./scripts/Use-TestDatabase.ps1
python scripts/Prepare-ReadingListMigrationDatabase.py
Set-Location backend/book-service
.\mvnw.cmd '-Dtest=IsolatedTestDatabaseConnectionTest,IsolatedTestDatabaseInitializerTest' test
.\mvnw.cmd clean verify
```

`verify` includes compilation, the full test phase, JAR packaging and the Maven
verification lifecycle. Do not use skip-tests flags. Do not run another suite or
an interactive application against these databases concurrently.

The new `ReadingListHttpJourneyTest` starts an embedded HTTP server on loopback
and a random port with the **test classpath** and registered fail-closed initializer.
It uses real Java HttpClient requests, independent server transactions and actual
PostgreSQL commits. Its fixtures are created through POST /api/books and removed
afterwards; existing Book data is not deleted. It verifies add/membership, duplicate
and stale-revision conflicts, ordering, status/date changes, withdrawal, Book
deletion/compaction, repeat GET persistence and OpenAPI. It is not a browser test.

To repeat only that real HTTP journey after the safety checks:

```powershell
.\mvnw.cmd '-Dtest=ReadingListHttpJourneyTest' test
```

The random HTTP port is not the Angular development proxy target. Frontend tests
use HttpTestingController without a live server. Do not point the development
proxy at a normally started backend as a shortcut for validation.

Migration coverage includes an empty database through V11, compatible V9 ->
V10 -> V11 with legacy/structured Book fixtures and inventory objects, and V10 ->
V11 with preservation of Book rows/history/constraints/indexes/sequence. V10
intentionally removes retired physical-location/inventory data, not bibliographic
data; dependencies that prevent its restrictive DDL must be resolved explicitly.
The real database is **not** an approved migration target in this workflow.

See [READING-LIST-VALIDATION.md](READING-LIST-VALIDATION.md) for evidence and
remaining manual checks. Never run Flyway clean outside the fixed disposable
migration fixture, delete volumes or restore over an existing database here.
