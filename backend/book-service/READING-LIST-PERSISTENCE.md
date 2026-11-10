# Lista de lectura — Etapa 1: persistencia

## Alcance

V11, dos entidades JPA, dos repositorios y pruebas PostgreSQL. No hay servicios
de negocio, DTOs REST, controladores ni cambios Angular/ISBN/catálogo.
No se modifican V1–V10, Book, la base original ni los backups.

## Modelo e integridad

- `public.reading_list`: única fila `id=1`, insertada por Flyway con revisión 0.
  PK y CHECK impiden listas adicionales; revisión BIGINT obligatoria y no negativa.
- `public.reading_list_entry`: identidad, FK a lista, FK a Book, posición INTEGER
  positiva y fecha de incorporación TIMESTAMPTZ obligatoria. No hay copias de los
  datos bibliográficos, estado, fechas de lectura o portada.
- Unicidad por `(reading_list_id, book_id)` y `(reading_list_id, position)`.
  La segunda es `DEFERRABLE INITIALLY IMMEDIATE`: por defecto rechaza duplicados;
  una futura operación atómica podrá diferirla, desplazar posiciones y comprobarla
  antes del commit. No se usan posiciones negativas o fraccionarias.
- FK de lista `ON DELETE RESTRICT`; FK de Book `ON DELETE CASCADE` para impedir
  referencias huérfanas incluso al borrar directamente un libro.
- Las relaciones JPA son LAZY, sin cascadas de persistencia/eliminación hacia
  Book o la lista. Sus referencias y `addedAt` no se actualizan mediante JPA.
- La incorporación recibe un `Instant` explícito: no existe otro reloj/default
  que compita con el instante que asigne el futuro servicio.
- Los índices únicos cubren las consultas por lista/orden. El índice adicional
  sobre `book_id` permite resolver eficientemente la FK al eliminar Book;
  no duplica el prefijo de los índices compuestos.

## Orden, revisión y límite de esta etapa

La representación elegida es **1…N**, consecutiva y persistente, no una ordenación
por título o fecha. PostgreSQL protege positividad y unicidad, pero esos CHECKs
no pueden exigir continuidad entre filas. **Añadir al final, compactar huecos,
mover entradas e incrementar/comparar revisión corresponderán al servicio de una
etapa posterior**. No se añaden triggers ni operaciones de negocio ahora.

En particular, la cascada de Book elimina su referencia pero no compacta posiciones
ni cambia revisión. La integración transaccional futura con Book.delete tendrá
que hacerlo bajo el mismo bloqueo de lista. Las pruebas no presentan la cascada
aislada como una operación de lista completa.

Una cascada ejecutada en PostgreSQL no sincroniza objetos ya cargados en el
contexto de persistencia de Hibernate. La futura operación coordinada eliminará
la entrada explícitamente antes de Book; no debe dejar una entrada gestionada
apuntando a un Book marcado para eliminar ni reutilizar objetos obsoletos.

`ReadingListRepository.findSingletonForUpdate()` prepara un bloqueo pesimista de
escritura. Debe llamarse dentro de una transacción. La revisión se mapea de forma
explícita, sin `@Version`: el futuro servicio bloqueará la fila, comparará la
revisión esperada y la incrementará solo al cambiar pertenencia/orden. No se
introduce versionado global ni optimismo de concurrencia en Book.

`ReadingListEntryRepository.findByReadingListIdOrderByPositionAsc()` recupera el
orden guardado y carga Book mediante EntityGraph, evitando una carga por entrada.
No hay colección bidireccional añadida a Book.

## Seguridad y ejecución de pruebas

Las pruebas JPA usan el inicializador existente, con URL obligatoria
`jdbc:postgresql://127.0.0.1:5433/bookdb_tests`, usuario `booktest` y secretos locales.

Las pruebas reales de Flyway necesitan una base auxiliar porque V10 nombra
explícitamente `public`: un esquema temporal no aislaría correctamente V1–V11.
Se utiliza **solo en el clúster aislado**:

```text
127.0.0.1:5433/bookdb_tests_reading_list_migration
owner: booktest (no administrativo)
```

Preparación desde la raíz, una vez por volumen:

```powershell
python scripts/Prepare-ReadingListMigrationDatabase.py
. ./scripts/Use-TestDatabase.ps1
Set-Location backend/book-service
.\mvnw.cmd '-Dtest=IsolatedTestDatabaseConnectionTest,IsolatedTestDatabaseInitializerTest' test
.\mvnw.cmd '-Dtest=ReadingListMigrationTest,ReadingListPersistenceTest' test
.\mvnw.cmd clean test
```

El script verifica contenedor, binding loopback/5433, volumen independiente,
ausencia de bases/rol originales y propietario no administrativo antes de crear
la base auxiliar. Si existe, verifica su propietario y no la sobrescribe.
Las credenciales administrativas permanecen dentro del contenedor de pruebas;
no se exportan a Maven ni se usan en las pruebas.

**La base auxiliar es desechable:** antes de cada caso de migración se limpia
exclusivamente su esquema `public` mediante Flyway. El test tiene URL fija y
verifica con conexión de solo lectura, antes de limpiar o migrar, el nombre real
de la base, usuario, privilegios, PostgreSQL 16 y ausencia de bases/rol originales.
No se usa Flyway clean en `bookdb_tests`, `bookdb` o `bookdb_restore_test`.
No ejecutar suites paralelas que compartan esta base auxiliar.

Resultado de la ejecución de esta etapa: pruebas previas de seguridad **15/15**;
suite final `mvnw.cmd clean test` con **472 pruebas, 0 fallos, 0 errores y
1 omitida** (enlaces simbólicos en Windows), `BUILD SUCCESS`. Incluye **24 casos
nuevos**: dos de migración y 22 de persistencia/integridad/bloqueo. No se ejecutan
pruebas Angular porque no se modifica frontend en esta etapa.

## Cobertura

- Flyway desde base vacía: V1–V11, historial válido, tablas, columnas, singleton,
  nulabilidad, índices, fecha con zona, FKs y unicidad diferible.
- V10–V11 con libros poblados: igualdad completa de datos, xmin/ctid, historial
  anterior, restricciones, índices y estado de secuencia Book.
- Mapeo JPA y validación Hibernate; revisión inicial y persistida; orden por
  posiciones consecutivas; asociación a los datos actuales de Book.
- Duplicados de libro/posición; posiciones cero/negativas/nulas; valores nulos
  obligatorios, referencias inexistentes, singleton y revisión negativa.
- Borrar entrada conserva Book; borrar Book elimina solo su entrada.
- Intercambio de posiciones con unicidad diferida y rechazo al comprobar una
  colisión no resuelta.
- Bloqueo de la fila singleton comprobado con una segunda conexión y lock_timeout.

## Precaución de desarrollo

La configuración normal todavía puede apuntar a `bookdb`, que estaba en V9 en la
última revisión. **No arrancar el backend normal ni aplicar V10/V11 allí sin
autorización independiente.** Este trabajo solo migra las bases aisladas descritas.
