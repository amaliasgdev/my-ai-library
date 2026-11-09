#!/bin/sh
set -eu

# Runs only when this independent cluster is initialized for the first time.
# psql quotes the password as a SQL literal; no secret is stored in this file.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv test_password TEST_DB_PASSWORD
SELECT format('CREATE ROLE booktest LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'test_password') \gexec
ALTER DATABASE bookdb_tests OWNER TO booktest;
SQL
