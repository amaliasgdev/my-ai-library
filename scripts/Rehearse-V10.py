"""One-shot, fail-closed V9 -> V10 rehearsal; never migrates bookdb.

Run from the repository root after building the Spring Boot jar with -DskipTests.
Evidence is written to a NEW backups/stage-b-v10 directory, never overwritten.
The only application process started here uses explicit restore-test connection
settings, binds to loopback:18081 and is stopped in finally. All API probes are GET.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
CONTAINER = "mi-biblioteca-postgres"
DESTINATION = "bookdb_restore_test"
URL = "jdbc:postgresql://127.0.0.1:5432/bookdb_restore_test"
BACKUP_HASH = "09F97A9219AFF16D3F2299375D20A9E7E440B26A2ACF238DB158D067FDBCBE27"
EVIDENCE = ROOT / "backups/stage-b-v10"
JAR = ROOT / "backend/book-service/target/book-service-0.0.1-SNAPSHOT.jar"
REMOVED = ["room", "bookcase", "shelf", "shelf_id"]


def run(args, data=None):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=True).stdout


def sql(database, statement, container=CONTAINER, user="booksvc"):
    # Even the identity/snapshot connections cannot write.
    prefix = ["docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on", container]
    if container == 'mi-biblioteca-postgres-tests':
        variable = 'TEST_DB_PASSWORD' if user == 'booktest' else 'POSTGRES_PASSWORD'
        prefix += ['sh', '-c', 'export PGPASSWORD="$' + variable + '"; exec psql "$@"', 'sh']
    else:
        prefix += ['psql']
    return run(prefix + ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                "-U", user, "-d", database], statement.encode()).decode().strip()


def dump(database, schema=None):
    args = ["docker", "exec", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
            CONTAINER, "pg_dump", "-U", "booksvc", "-d", database]
    if schema:
        args += ["--schema", schema]
    # Recent pg_dump releases randomize these safety markers, not database data.
    return b"\n".join(line for line in run(args).splitlines()
                       if not line.startswith((b"\\restrict ", b"\\unrestrict ")))


def snapshot(database):
    statement = """
    SELECT json_build_object(
      'database', current_database(),
      'books', (SELECT json_agg(v ORDER BY (v->>'id')::bigint) FROM
        (SELECT to_jsonb(b) - ARRAY['room','bookcase','shelf','shelf_id'] AS v FROM public.book b) q),
      'rowVersions', (SELECT json_agg(json_build_array(id,xmin::text,ctid::text) ORDER BY id) FROM public.book),
      'history', (SELECT json_agg(to_jsonb(h) ORDER BY installed_rank) FROM public.flyway_schema_history h),
      'columns', (SELECT json_agg(to_jsonb(c) ORDER BY ordinal_position) FROM information_schema.columns c
        WHERE table_schema='public' AND table_name='book' AND column_name NOT IN ('room','bookcase','shelf','shelf_id')),
      'constraints', (SELECT json_agg(json_build_array(conname,contype,convalidated,condeferrable,condeferred,
        pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint
        WHERE conrelid='public.book'::regclass AND conname NOT IN ('fk_book_shelf','ck_book_location')),
      'indexes', (SELECT json_agg(json_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes
        WHERE schemaname='public' AND tablename='book' AND indexname <> 'ix_book_shelf'),
      'sequence', (SELECT json_build_object('last_value',last_value,'log_cnt',log_cnt,'is_called',is_called) FROM public.book_id_seq),
      'sequenceDefinition', (SELECT to_jsonb(s) - 'last_value' FROM pg_sequences s
        WHERE schemaname='public' AND sequencename='book_id_seq'),
      'tables', (SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'),
      'sequences', (SELECT json_agg(sequencename ORDER BY sequencename) FROM pg_sequences WHERE schemaname='public'),
      'physicalColumns', (SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='book' AND column_name IN ('room','bookcase','shelf','shelf_id'))
    );
    """
    return json.loads(sql(database, statement))


def save(name, value):
    with (EVIDENCE / name).open("x", encoding="utf-8") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    require(Path.cwd().resolve() == ROOT, "Run from repository root")
    require(run(["git", "branch", "--show-current"]).decode().strip() == "fix/remove-location-schema", "Wrong branch")
    historical = sorted((ROOT / "backend/book-service/src/main/resources/db/migration").glob("V[1-9]__*.sql"))
    require(len(historical) == 9, "Expected nine historical migrations")
    for path in historical:
        require(path.read_bytes().replace(b'\r\n', b'\n') == run(["git", "show", "HEAD:" + path.relative_to(ROOT).as_posix()]).replace(b'\r\n', b'\n'),
                "Historical migration changed: " + path.name)
    backup = (ROOT / "backups/bookdb_antes_retirar_ubicaciones.dump").read_bytes()
    require(hashlib.sha256(backup).hexdigest().upper() == BACKUP_HASH, "Backup changed")
    toc = run(["docker", "exec", "-i", CONTAINER, "pg_restore", "--list"], backup)
    # Parse and decompress the whole archive without connecting to any database.
    run(["docker", "exec", "-i", CONTAINER, "pg_restore", "--file=-"], backup)
    require(JAR.exists(), "Build the executable jar first")
    require(sql(DESTINATION, "SELECT current_database();") == DESTINATION, "Ambiguous destination")
    test_identity = json.loads(sql("bookdb_tests", """SELECT json_build_object('database',current_database(),
      'originals',EXISTS(SELECT FROM pg_database WHERE datname IN ('bookdb','bookdb_restore_test')),
      'admin',(SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname=current_user));""",
      "mi-biblioteca-postgres-tests", "booktest"))
    require(test_identity == {"database": "bookdb_tests", "originals": False, "admin": False}, "Tests not isolated")
    original_cluster = sql(DESTINATION, "SELECT system_identifier FROM pg_control_system();")
    test_cluster = sql("bookdb_tests", "SELECT system_identifier FROM pg_control_system();",
                       "mi-biblioteca-postgres-tests", "booktest_admin")
    require(original_cluster != test_cluster, "Clusters must differ")
    before = snapshot(DESTINATION)
    require([h['version'] for h in before['history']] == [str(i) for i in range(1, 10)]
            and all(h['success'] for h in before['history']), "Destination is not exactly V1-V9")
    require(len(before['books']) == 4, "Expected four restored books")
    require(set(before['physicalColumns']) == set(REMOVED), "Unexpected physical columns")
    original_before = dump("bookdb")
    extra_schemas = json.loads(sql(DESTINATION, """SELECT coalesce(json_agg(nspname ORDER BY nspname),'[]')
      FROM pg_namespace WHERE nspname <> 'public' AND nspname <> 'information_schema' AND nspname NOT LIKE 'pg_%';"""))
    extra_before = {schema: dump(DESTINATION, schema) for schema in extra_schemas}
    EVIDENCE.mkdir(exist_ok=False)
    save("restore-before.json", before)
    (EVIDENCE / "original-before.sql").write_bytes(original_before)
    (EVIDENCE / "backup-toc.txt").write_bytes(toc)
    save("historical-migrations.json", {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in historical})
    inspect = json.loads(run(["docker", "inspect", CONTAINER]))[0]
    settings = dict(entry.split("=", 1) for entry in inspect['Config']['Env'] if '=' in entry)
    # Do not inherit any Spring/DB/Java overrides from the interactive session.
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(
        ("SPRING_", "DB_", "TEST_DB_", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS"))}
    env['DB_PASSWORD'] = settings['POSTGRES_PASSWORD']
    # Bypass Windows javapath launchers that spawn a child JVM and retain the jar
    # after terminating only the launcher process.
    java_settings = subprocess.run(['java', '-XshowSettings:properties', '-version'],
                                   capture_output=True, check=True).stderr.decode()
    java_home = re.search(r'^\s*java.home = (.+)$', java_settings, re.MULTILINE)
    require(java_home is not None, 'Cannot determine actual Java executable')
    java = Path(java_home.group(1).strip()) / 'bin' / ('java.exe' if os.name == 'nt' else 'java')
    args = [str(java), "-jar", str(JAR), "--server.address=127.0.0.1", "--server.port=18081",
            "--spring.datasource.url=" + URL, "--spring.datasource.username=booksvc",
            "--spring.flyway.url=" + URL, "--spring.flyway.user=booksvc",
            "--spring.flyway.password=${DB_PASSWORD}", "--spring.flyway.default-schema=public",
            "--spring.flyway.schemas=public", "--spring.flyway.clean-disabled=true",
            "--spring.jpa.hibernate.ddl-auto=validate"]
    # Last read-only check immediately before the only process allowed to migrate.
    require(sql(DESTINATION, "SELECT current_database();") == DESTINATION, "STOP: wrong migration target")
    print("Verified target: " + URL + "; starting loopback-only rehearsal", flush=True)
    with (EVIDENCE / "backend.log").open("x", encoding="utf-8") as log:
        process = subprocess.Popen(args, cwd=ROOT / "backend/book-service", env=env, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 120
            while True:
                require(process.poll() is None, "Backend exited; inspect evidence/backend.log")
                try:
                    with urllib.request.urlopen("http://127.0.0.1:18081/actuator/health", timeout=2) as response:
                        require(json.load(response)['status'] == 'UP', "Health not UP")
                    break
                except (OSError, ValueError):
                    require(time.monotonic() < deadline, "Startup timed out")
                    time.sleep(1)
            after = snapshot(DESTINATION)
            save("restore-after.json", after)
            for field in ['books', 'rowVersions', 'columns', 'constraints', 'indexes', 'sequence', 'sequenceDefinition']:
                require(before[field] == after[field], "Preserved field differs: " + field)
            require(after['history'][:-1] == before['history'], "V1-V9 history changed")
            require(after['history'][-1]['version'] == '10' and after['history'][-1]['success'], "V10 not registered")
            require(set(after['tables']) == set(before['tables']) - {'inventory_session', 'shelf', 'bookcase', 'room'}, "Unexpected tables")
            require(set(after['sequences']) == set(before['sequences']) - {'inventory_session_id_seq', 'shelf_id_seq', 'bookcase_id_seq', 'room_id_seq'}, "Unexpected sequences")
            require(after['physicalColumns'] is None, "Physical columns remain")
            probes = {}
            paths = ['/api/books', '/api/books?genre=' + urllib.parse.quote(before['books'][0]['genres'][0])
                     if before['books'][0]['genres'] else '/api/books?ratingMin=1', '/v3/api-docs']
            for book in before['books']:
                paths += ['/api/books/' + str(book['id'])]
                if book['isbn']:
                    paths += ['/api/books/search?isbn=' + urllib.parse.quote(book['isbn'])]
            for path in paths:
                with urllib.request.urlopen('http://127.0.0.1:18081' + path, timeout=15) as response:
                    body = json.load(response)
                    require(response.status == 200, "API probe failed")
                    probes[path] = body
                    if path.startswith('/api/books/') and not path.startswith('/api/books/search'):
                        expected = next(b for b in before['books'] if b['id'] == body['id'])
                        for key in ['title','author','isbn','description','coverUrl','publisher','publicationYear',
                                    'pageCount','language','genres','rating','readingStatus','startedOn','finishedOn']:
                            # PostgreSQL snake_case vs API camelCase.
                            column = re.sub(r'(?<!^)(?=[A-Z])', '_', key).lower()
                            require(body[key] == expected[column], "API data differs: " + key)
            save("api-probes.json", probes)
        finally:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
    original_after = dump("bookdb")
    require(original_before == original_after, "Original database changed during rehearsal")
    for schema in extra_schemas:
        require(extra_before[schema] == dump(DESTINATION, schema), "Non-public schema changed")
    save("result.json", {"target": URL, "books": 4, "preservedDifferences": 0,
        "originalDumpSha256": hashlib.sha256(original_after).hexdigest(),
        "originalUnchanged": True, "extraSchemasUnchanged": extra_schemas,
        "originalCluster": original_cluster, "testCluster": test_cluster,
        "backupSha256": BACKUP_HASH, "v10": after['history'][-1], "apiProbes": len(probes)})
    print("PASS: V10 recorded, four books unchanged, constraints/indexes/sequence preserved; bookdb unchanged.")


if __name__ == '__main__':
    main()
