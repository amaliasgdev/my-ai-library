# V10: retirada de ubicaciones e inventarios

## Alcance y ejecución

`V10__remove_physical_locations_and_inventory.sql` elimina exclusivamente los
objetos físicos del esquema `public`. Flyway ejecuta el DDL PostgreSQL en una
transacción por defecto; no hay commits intermedios, `CASCADE`, `IF EXISTS`, DML
sobre libros ni cambios manuales de historial. Una dependencia inesperada debe
provocar un error y rollback, no eliminarse implícitamente.

V1–V9 permanecen intactas. Las secuencias de identidad, índices y restricciones
propios de las tablas eliminadas desaparecen junto con ellas. La secuencia,
restricciones e índices bibliográficos de `book` se conservan.

El ensayo del 9 de noviembre de 2026 usó explícitamente
`jdbc:postgresql://127.0.0.1:5432/bookdb_restore_test`, nunca `bookdb`.
El backend de ensayo se vinculó únicamente a `127.0.0.1:18081`, con datasource y
Flyway explícitos y `ddl-auto=validate`. No se cambió la configuración habitual.

## Evidencias locales

`backups/stage-b-v10/` contiene las referencias completas antes/después,
el volcado original previo, listado del backup, hashes de V1–V9, log de arranque,
respuestas de los GET de comprobación y `result.json`. No contiene contraseñas.
Son evidencias locales con datos reales, no deben publicarse sin revisión.

Resultados del ensayo:

- V10 registrada por Flyway con éxito; checksum `-2027377319`.
- Cuatro libros: cero diferencias en todos los campos conservados, también en
  las versiones físicas de fila (`xmin`/`ctid`).
- Columnas restantes, restricciones, índices y definición/estado de la secuencia
  de libros idénticos. Historial V1–V9 idéntico.
- Eliminadas las cuatro columnas y cuatro tablas previstas, junto con sus
  secuencias propias; ningún otro objeto público esperado desapareció.
- Once GET correctos: catálogo, filtro bibliográfico, detalle de los cuatro libros,
  búsquedas exactas por ISBN y OpenAPI. Health `UP` y validación Hibernate correctos.
- Volcado completo de `bookdb` idéntico antes/después (salvo los marcadores aleatorios
  de seguridad del propio `pg_dump`, excluidos de la comparación).
- Esquema residual `location_test_8c231a4374cd4461950f006a437c5f5c` intacto,
  expresamente fuera del alcance de V10.
- Backup original legible íntegramente sin conexión de restauración;
  SHA-256 `09F97A9219AFF16D3F2299375D20A9E7E440B26A2ACF238DB158D067FDBCBE27`.

`scripts/Rehearse-V10.py` documenta y automatiza el procedimiento puntual. Requiere
un jar construido con `mvnw.cmd -DskipTests package`, la rama correcta y una copia
exactamente en V9. Rechaza repetir el ensayo sobre V10 o sobrescribir evidencias.
No debe usarse para producción ni para reconstruir la copia ya migrada.

Las pruebas automatizadas usan exclusivamente `bookdb_tests` en el clúster
independiente de puerto 5433, con la protección descrita en `TESTING.md`. También
aplican las migraciones en ese clúster, nunca en `bookdb`. La prueba
`PhysicalLocationRetirementMigrationTest` reconstruye V7–V9 dentro de transacciones
revertidas y prueba conservación de datos y rollback ante una dependencia externa.

Validación final ejecutada:

- `mvnw.cmd -DskipTests package`: jar construido para el ensayo.
- `python scripts/Rehearse-V10.py`: ensayo y comparaciones correctos.
- `mvnw.cmd clean test` tras cargar `scripts/Use-TestDatabase.ps1`: **448 pruebas,
  0 fallos, 0 errores, 1 omitida** (enlaces simbólicos en Windows), `BUILD SUCCESS`.
  Incluye los dos nuevos casos de migración y la traducción real de ISBN a 409.
- `npm run test:ci`: **991 pruebas correctas**, 45 archivos.
- `npm run build`, `npm run lint`, `npm run format:check`: correctos.
- `git diff --check`: correcto. Sin commits ni cambios de rama.

La primera limpieza Maven encontró el jar bloqueado por la JVM hija del lanzador
Java de Windows. Se identificó y detuvo exclusivamente el proceso de ensayo
(puerto 18081 y URL de la copia), y después se repitió `clean test` con éxito.
El script evita ahora ese lanzador usando el ejecutable del JDK directamente.

## Antes de producción

- **No arrancar este código con la configuración por defecto:** todavía apunta a
  `bookdb` y Flyway intentaría aplicar V10. La existencia del fichero hace el
  próximo arranque potencialmente destructivo.
- Se necesita autorización independiente y verificación explícita de destino,
  backup reciente/restaurable y ventana de mantenimiento antes de aplicarla allí.
- La retirada elimina definitivamente los datos de ubicaciones e inventarios;
  no hay migración inversa ni reconstrucción desde los campos bibliográficos.
- Desplegar coordinadamente backend/frontend y retirar instancias antiguas antes
  de migrar. El código anterior que mapea ubicaciones no es compatible con V10.
- El DDL requiere bloqueos: detener escrituras y revisar dependencias/actividad.
  No se ha ensayado carga concurrente de producción ni una recuperación en ella.
- Revisar separadamente cualquier esquema residual; no ampliar V10 con `CASCADE`.
- La copia de ensayo comparte servidor con la original, pero no base de datos;
  los tests de escritura usan otro clúster y credenciales no administrativas.
  No se han cambiado roles ni configuración del servidor original.
