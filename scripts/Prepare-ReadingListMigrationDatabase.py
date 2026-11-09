"""Create the disposable migration fixture only in the independent test container.

No database is dropped here. Re-running verifies the existing database owner.
The migration tests clean ONLY public in this explicitly disposable database.
Administrator credentials remain inside the test container, never in test JVMs.
"""
import json
import subprocess


CONTAINER = "mi-biblioteca-postgres-tests"
DATABASE = "bookdb_tests_reading_list_migration"


def run(args, statement=None):
    result = subprocess.run(args, input=statement, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError("Test database preparation failed; no development fallback is allowed")
    return result.stdout.strip()


def sql(statement):
    return run(["docker", "exec", "-i", CONTAINER, "sh", "-c",
                'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -A -t -v ON_ERROR_STOP=1 -U booktest_admin -d bookdb_tests'], statement)


def main():
    container = json.loads(run(["docker", "inspect", CONTAINER]))[0]
    bindings = container["HostConfig"]["PortBindings"]["5432/tcp"]
    if bindings != [{"HostIp": "127.0.0.1", "HostPort": "5433"}]:
        raise RuntimeError("Unexpected test port binding")
    volumes = [mount.get("Name") for mount in container["Mounts"] if mount["Type"] == "volume"]
    if volumes != ["mi-biblioteca-tests_postgres-tests-data"]:
        raise RuntimeError("Unexpected test volume")
    identity = json.loads(sql("""BEGIN READ ONLY;
      SELECT json_build_object('database',current_database(),'user',current_user,
        'forbidden',EXISTS(SELECT FROM pg_database WHERE datname IN ('bookdb','bookdb_restore_test')),
        'originalRole',EXISTS(SELECT FROM pg_roles WHERE rolname='booksvc'),
        'ownerSafe',EXISTS(SELECT FROM pg_roles WHERE rolname='booktest'
          AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication));
      COMMIT;""").splitlines()[1])
    if identity != {"database": "bookdb_tests", "user": "booktest_admin",
                    "forbidden": False, "originalRole": False, "ownerSafe": True}:
        raise RuntimeError("Test cluster identity check failed")
    owner = sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='" + DATABASE + "';")
    if owner and owner != "booktest":
        raise RuntimeError("Fixture database has an unexpected owner")
    if not owner:
        sql("CREATE DATABASE " + DATABASE + " OWNER booktest;")
    print("Verified isolated migration fixture: 127.0.0.1:5433/" + DATABASE + " (owner booktest)")


if __name__ == "__main__":
    main()
