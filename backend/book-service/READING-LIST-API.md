# Lista de lectura — Etapa 2: API básica

La Etapa 3 añade el movimiento absoluto descrito abajo. No hay paginación ni cambios Angular.
V1–V11 no cambian. La lista sigue siendo única y referencia Book sin duplicarlo.

## Contratos

### GET /api/reading-list[?readingStatus=READ]

```json
{
  "revision": "2",
  "totalItems": 2,
  "items": [
    {"entryId": 7, "position": 2, "addedAt": "2026-11-09T12:00:00Z", "book": {}}
  ]
}
```

`book` es el BookResponse existente y completo, no una entidad ni una instantánea
guardada en la entrada. `readingStatus` es opcional: TO_READ, READING, READ o
ABANDONED, exactamente una ocurrencia no vacía. Sin filtro se devuelve la lista
completa. El filtro conserva las posiciones globales y `totalItems` cuenta siempre
la lista completa. No existe otro criterio de orden: position ASC.

La revisión es siempre una cadena decimal, también fuera del rango seguro de
JavaScript. Las lecturas usan una sola instantánea REPEATABLE READ para revisión,
entradas, datos Book y total. Consulta sin filtro: dos SELECT; con filtro: tres.
Book se carga mediante EntityGraph, sin N+1 ni llamadas individuales a BookService.

### GET /api/reading-list/membership?bookId=42&bookId=43

```json
{
  "revision": "2",
  "items": [
    {"bookId": 42, "included": true, "entryId": 7},
    {"bookId": 43, "included": false, "entryId": null}
  ]
}
```

Al menos un bookId, hasta 100 IDs únicos. Se deduplican conservando la primera
aparición; los duplicados no consumen el límite. Cada valor debe ser un entero
ASCII positivo <=9007199254740991. No se aceptan CSV, signos, espacios ni decimales.
Los libros inexistentes o no incluidos producen included=false, no un 404.
Se resuelve mediante una proyección IN por lote y el SELECT de revisión: dos
consultas, bajo la misma instantánea. Nunca una consulta por ID.

### POST /api/reading-list/items

```json
{"bookId":42,"expectedRevision":"2"}
```

201, `Location: /api/reading-list/items/{entryId}` y:

```json
{"revision":"3","item":{"entryId":8,"position":3,"addedAt":"2026-11-09T12:00:00Z","book":{}}}
```

Book obligatorio, positivo y seguro para JavaScript. expectedRevision obligatorio,
JSON string (no número), decimal canónico no negativo dentro del rango BIGINT:
`0` o dígitos sin ceros iniciales. No se admiten signos, espacios ni exponentes.
Se incorpora al final y no cambia ningún dato Book. addedAt usa precisión de
microsegundos, coincidente con PostgreSQL, para que POST y GET coincidan.

### DELETE /api/reading-list/items/{entryId}?expectedRevision=3

Elimina exclusivamente la entrada, compacta posiciones posteriores y responde:

```json
{"revision":"4"}
```

HTTP 200 para comunicar la revisión. El ID tiene el mismo límite positivo seguro;
expectedRevision debe aparecer exactamente una vez y cumplir la sintaxis anterior.
No hay body DELETE ni eliminación de Book.

La URI de Location identifica la entrada para DELETE; esta etapa no añade un
endpoint GET individual de entrada.

### POST /api/reading-list/items/{entryId}/move — Etapa 3

```json
{"toPosition":1,"expectedRevision":"5"}
```

HTTP 200 con la posición confirmada:

```json
{"revision":"6","entryId":8,"position":1}
```

- El destino es un INTEGER obligatorio, positivo y <= tamaño actual de la lista
  **completa**. No representa un índice de una vista filtrada ni una posición
  relativa. La numeración empieza en 1, no en 0.
- El ID y la revisión reutilizan exactamente la validación de las otras escrituras;
  la revisión JSON debe ser una cadena decimal canónica dentro de BIGINT.
- Tras validación sintáctica, bloquea el singleton, comprueba revisión, existencia
  de entrada y límites actuales. Revisión obsoleta: 409 incluso si el movimiento
  sería un no-op o la entrada ya no existe. Entrada ausente con revisión vigente:
  404. Destino fuera de rango: 400 con errors.toPosition.
- Si el destino coincide con la posición actual, responde con la misma revisión,
  sin DML sobre entradas ni singleton. Esto también funciona en Long.MAX_VALUE.
- Si cambia, difiere la unicidad y recupera únicamente el intervalo inclusivo entre
  origen y destino, antes de modificar entidades para evitar un autoflush que
  altere el criterio de selección. Hacia arriba: desplaza las otras posiciones +1;
  hacia abajo: -1. Asigna el destino a la entrada y aumenta revisión una sola vez.
- Flush y comprobación IMMEDIATE de la unicidad preceden al commit. Cualquier
  error revierte todas las posiciones y la revisión. No hay reintentos automáticos.
- Se mantienen IDs, pertenencia, addedAt y todos los campos Book. No se modifican
  posiciones fuera del intervalo. No se añaden tablas, migraciones o triggers.

El coste es O(longitud del intervalo) para carga y escrituras, coherente con las
posiciones consecutivas de una lista personal. No carga un Book por entrada.
Se mantiene el mismo orden de bloqueo que altas, bajas y Book.delete. Dos
movimientos efectivos con la misma revisión producen un commit y un conflicto;
dos no-ops pueden aceptar la misma revisión porque no la modifican.

La interfaz futura debe desactivar la reordenación en vistas filtradas para evitar
ambigüedad visual; la API siempre interpreta el destino global.

## Errores

ProblemDetail seguro, con `code` y `errors` cuando hay un campo asociado:

| Estado | Código | Motivo |
|---|---|---|
| 400 | READING_LIST_INVALID_REQUEST | Query/revisión inválida |
| 400 | Validación MVC existente | JSON inválido o campos obligatorios/rangos |
| 404 | READING_LIST_BOOK_NOT_FOUND | Book inexistente al añadir |
| 404 | READING_LIST_ENTRY_NOT_FOUND | Entrada inexistente al retirar |
| 409 | READING_LIST_REVISION_CONFLICT | Revisión obsoleta |
| 409 | READING_LIST_ALREADY_CONTAINS_BOOK | Duplicado |
| 409 | READING_LIST_REVISION_EXHAUSTED | No cabe otra revisión BIGINT |
| 409 | READING_LIST_CAPACITY_EXCEEDED | No cabe otra posición INTEGER |

La revisión se comprueba antes de validar existencia/duplicado. Un DELETE repetido
con revisión antigua devuelve 409; con revisión vigente y entrada ausente, 404.
Las escrituras no se reintentan automáticamente, ni siquiera tras errores de red.
El cliente deberá consultar el estado actual antes de una nueva decisión explícita.

La traducción de integridad inspecciona SQLState 23505 y el nombre exacto
`uq_reading_list_entry_book`. La regla `uq_book_isbn` -> 409 ISBN permanece
independiente; otros errores de integridad no se convierten en falsos duplicados.

## Transacciones y borrado de Book

Todas las escrituras siguen singleton FOR UPDATE -> comparar revisión -> validar
-> cambios -> incrementar una vez -> flush -> commit. No se usa @Version en Book.
Una segunda escritura con la misma revisión espera el bloqueo y recibe 409 tras
el primer commit. El POST bloquea también Book FOR SHARE, después del singleton.

DELETE difiere `uq_reading_list_entry_position`, elimina la entrada y desplaza
las posteriores, comprueba la restricción y confirma todo en la misma transacción.
Los cambios se realizan sobre entidades gestionadas para no dejar posiciones
obsoletas en el contexto Hibernate. El coste de escrituras es lineal en el tramo
compactado, sin consultas individuales para cargar sus libros.

**Integración estrictamente necesaria:** BookService.delete llama a la retirada
coordinada antes de cargar/eliminar Book y dentro de su misma transacción. Siempre
bloquea primero la lista, incluso si el libro no está incluido, para serializar
con una incorporación concurrente. Solo si había entrada compacta e incrementa
revisión. La limpieza de portadas sigue siendo la existente, después del commit.

La cascada FK sigue protegiendo de huérfanos, pero un DELETE SQL externo no tiene
las garantías de compactación/revisión de la API. No se han añadido triggers.

BookResponseMapper contiene el único mapeo de Book a BookResponse, extraído sin
cambios semánticos de BookService; ambos módulos lo utilizan sin dependencias
circulares ni duplicación de lógica bibliográfica.

Cambiar estado o fechas usa los endpoints Book existentes. No cambia el orden ni
la revisión estructural. Las próximas lecturas reflejan esos datos actuales.

## Pruebas y seguridad

- API real: vacío, append/orden, filtros globales, pertenencia, validación,
  duplicados, 404/409, DELETE/compactación y borrado Book.
- Regresión del BookResponse completo y estados/fechas existentes.
- Conteos Hibernate: dos/tres consultas de lista y dos de pertenencia con 12 libros.
- Conexiones y commits PostgreSQL reales: appends y borrados simultáneos, carrera
  añadir/eliminar Book, instantáneas intercaladas y revisión agotada.
- Rollback después de INSERT real y después de DELETE/compactación/revisión,
  incluyendo un fallo real de CHECK PostgreSQL y rollback conjunto con Book.
- Colisión real de unicidad de lista y traducción distinta del conflicto ISBN.
- Contratos OpenAPI de pertenencia y del movimiento absoluto.

Ejecutar únicamente con `scripts/Use-TestDatabase.ps1` y el clúster aislado del
puerto 5433. La suite completa también necesita la base auxiliar de migraciones
preparada en la etapa anterior. Ver TESTING.md. No arrancar el backend normal con
su configuración predeterminada, que todavía puede apuntar a bookdb.

### Resultado verificado de la Etapa 2

- Comprobaciones previas de aislamiento: 15 pruebas, sin fallos ni errores.
- Suite final `mvnw.cmd clean test`: **525 pruebas, 0 fallos, 0 errores,
  1 omitida** (enlaces simbólicos en Windows), `BUILD SUCCESS`.
- Incluye 41 casos API nuevos, 11 casos de concurrencia/rollback reales y una
  nueva prueba OpenAPI, además de todas las regresiones previas.
- Sin cambios en V1–V11 ni en frontend; sin commits, push o cambios de rama.

### Cobertura adicional de la Etapa 3

- Ascensos/descensos, extremos, movimientos adyacentes, no-op y lista de un libro.
- Recarga desde PostgreSQL, continuidad 1…N y revisión exacta. Comparación de ctid
  prueba que solo se escriben filas del intervalo; se comparan todos los campos
  Book y metadatos de entradas para detectar modificaciones ajenas al orden.
- Destinos globales después de filtrar; validaciones JSON, IDs, revisión y límites.
- No-op con revisión obsoleta y con revisión BIGINT máxima.
- Movimientos concurrentes sobre la misma/distintas entradas; carreras con altas,
  retiradas y eliminación de Book; no-ops concurrentes, con commits reales.
- Rollback tras flush real y fallo CHECK, colisión diferida UNIQUE y revisión agotada.
- Documentación OpenAPI con respuestas 200/400/404/409.

Resultado final de la Etapa 3: `mvnw.cmd clean test` con **574 pruebas,
0 fallos, 0 errores y 1 omitida**, `BUILD SUCCESS`. Se añaden 40 casos HTTP
de movimiento y nueve de concurrencia/rollback; se mantienen las regresiones
anteriores. Las 15 comprobaciones previas de aislamiento también pasan.
No se modifica Angular, Book ni las migraciones V1–V11 en esta etapa.
