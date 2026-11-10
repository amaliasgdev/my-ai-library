# Lista de lectura — Validación integral (Etapa 6)

Fecha: 2026-11-09. Rama: `feature/reading-list`.
No se añaden funcionalidades ni se prepara una PR/commit automáticamente.

## Entornos y límites de seguridad

| Entorno | Puerto | Base | Uso |
|---|---|---|---|
| Original | 5432 | bookdb | Solo comprobaciones de lectura, nunca migraciones |
| Restauración anterior | 5432 | bookdb_restore_test | Solo comprobaciones de lectura |
| Pruebas | 127.0.0.1:5433 | bookdb_tests | Suite y recorrido HTTP real |
| Fixture migraciones | 127.0.0.1:5433 | bookdb_tests_reading_list_migration | Replay Flyway y clean limitado a public |

El clúster original tiene system_identifier `7692735717200314403` y volumen
`mi-biblioteca_postgres-data`. El aislado tiene `7706137155227770915` y volumen
`mi-biblioteca-tests_postgres-tests-data`; no contiene las bases ni el rol original.
Los tests de aplicación usan exclusivamente `booktest`, sin privilegios administrativos.
Los secretos están en `.env.test-db`, ignorado por Git; no se incluyen en informes.

Para preparar y arrancar exclusivamente el servicio de pruebas, consultar
[TESTING.md](TESTING.md). La orden Compose documentada usa `--pull never` y no
elimina volúmenes; si falta la imagen, solicitar autorización antes de descargar.
No compartir estas bases entre suites o procesos en ejecución.

## Comprobaciones Git

- Rama confirmada, sin cambios de rama, commits, push ni operaciones sobre backups.
- Al inicio: solo `backups/` sin seguimiento; índice vacío.
- V1–V10 comparadas con `ab47e42`, V11 con `52e3ef7`, sin diferencias.
- `.env.test-db` ignorado; ni secretos ni backups preparados en el índice.
- Backups permanecen sin seguimiento: **no usar git add .** para preparar la PR.
- Los únicos cambios de esta etapa son tests de validación y documentación.

## Cobertura backend e integración real

Resultado de `.\mvnw.cmd clean verify`: **576 tests, 0 failures, 0 errors,
1 skipped**, `BUILD SUCCESS`, incluyendo compilación y empaquetado JAR. Recuento
contrastado sumando los XML de Surefire. La omitida corresponde a symlinks en
Windows. Las guardas se ejecutaron primero: 15 tests, 0 fallos/errores/omitidos.

Desglose relevante: 20 casos de concurrencia de lista, 3 de migración de lista,
2 de retirada V10, 9 OpenAPI y 1 recorrido HTTP real. No hay cambios de código
de producción ni de contratos REST.

La suite ejecuta integridad de posiciones positivas/únicas/consecutivas,
desplazamientos acotados, no-op sin incrementar revisión, obsolescencia 409,
pertenencia por lote, filtros globales y ausencia de N+1.
Incluye commits/bloqueos reales, carreras entre altas/bajas/movimientos y Book.delete,
instantáneas consistentes, rollback tras DML real y comprobación de restricciones.
Los contratos OpenAPI y la traducción independiente de ISBN duplicado siguen cubiertos.

`ReadingListHttpJourneyTest` añade un servidor HTTP real en loopback/puerto
aleatorio, con el test classpath y guardas de datasource. Usa sockets, no MockMvc:

1. Crea tres Books mediante REST y los incorpora a la lista.
2. Comprueba pertenencia conjunta, rechazo de duplicados y revisión obsoleta.
3. Mueve una entrada y confirma posiciones globales mediante nuevas lecturas.
4. Inicia/finaliza lectura y filtra por READ conservando la posición.
5. Cambia fechas y comprueba que el cambio manual de estado las preserva.
6. Retira una entrada y confirma que Book sigue accesible.
7. Elimina un Book incluido y comprueba compactación, revisión y ausencia de huérfanos.
8. Vuelve a consultar por HTTP y SQL, verificando orden persistido y OpenAPI.

Los Books de prueba se eliminan al finalizar. Se conserva la lista que existiera
antes del test y se restaura su revisión solo en la base desechable, sin borrar
Books ajenos a ese recorrido. No se realiza ninguna llamada a Open Library.

## Migraciones

ReadingListMigrationTest ejecuta Flyway migrate y validate reales en su fixture:

- Base vacía: V1→V11, historial, tablas, constraints, FK y singleton.
- Base compatible V9 con Books legacy/estructurados e inventario: V10→V11,
  conservación de datos bibliográficos y eliminación **intencionada** de las
  estructuras retiradas. No se promete conservar ubicaciones/inventarios.
- Base V10 con Books existentes: V11 preserva filas, historial anterior,
  constraints, índices, secuencia y versiones físicas de Book.

PhysicalLocationRetirementMigrationTest verifica además el rollback ante una
dependencia imprevista que impide el DDL restrictivo de V10. No se edita V1–V11.

## Frontend

`npm run test:ci`: **1035 pruebas correctas, 48 archivos**. Lint, formato y build
correctos. Se mantienen cobertura de vacío/carga/error, portadas/fallback,
catálogo/detalle, duplicados, retirada, Subir/Bajar y CDK drop, recarga, filtros,
estado/fechas, conflictos y resultados inciertos sin replay de escrituras,
foco, etiquetas y navegación/contexto. No hay nuevas dependencias ni código
frontend de producción modificado en esta etapa.

Estas pruebas usan HttpTestingController, Router y harnesses Material; no son una
sesión manual de Angular contra el servidor. El test HTTP real valida por separado
el contrato y PostgreSQL. Quedan comprobaciones manuales de gesto táctil,
distribución visual en dispositivos reales y lector de pantalla antes de liberar.

## Datos originales y backup

Referencia previa: bookdb en V9 con 4 Books y sin tablas de lista; copia anterior
bookdb_restore_test en V10 con 4 Books y sin lista. Se toman huellas SHA-256 de
datos Book, historial Flyway, columnas y constraints públicos antes/después,
con PGOPTIONS default_transaction_read_only=on. No se arranca un backend contra
ninguna de esas bases.

Las huellas finales coinciden exactamente con las previas:

```text
bookdb:              67671446adee002d4e7be096478795c96c3813ba5a429f6cf18ff83a26a8a7ac
bookdb_restore_test: dcf997aa8735e4de13892c7eb0f9be7bc1a88bd871106258c41cf68311955bfd
```

Se confirma V9/4 Books/sin lista en bookdb y V10/4 Books/sin lista en la copia.
También coinciden los hashes previos/posteriores de los nueve archivos de backup
y evidencia. La huella de base cubre los datos y objetos enumerados, no pretende
ser una comparación binaria de todos los archivos físicos del clúster.

El dump `backups/bookdb_antes_retirar_ubicaciones.dump` conserva el SHA-256:

```text
09f97a9219aff16d3f2299375d20a9e7e440b26a2acf238db158d067fdbcbe27
```

pg_restore --list lee 61 entradas y pg_restore --file=- decodifica el archivo
completo sin conexión a una base ni ejecución SQL. También se comparan hashes
de los ocho archivos de evidencia de stage-b-v10. Esta comprobación no sustituye
una nueva restauración completa de un backup actualizado antes de migrar datos reales.

## Riesgos y puerta de migración real

- V10 es destructiva para ubicaciones/inventarios. bookdb sigue en V9: un arranque
  normal con Flyway aplicaría V10/V11. No hacerlo sin autorización separada.
- Antes de migrar: backup actual, restauración ensayada en otra base, revisión de
  dependencias inesperadas y ventana sin escritores/instancias antiguas. Flyway
  no ofrece undo de V10; una reversión requeriría restaurar y coordinar la aplicación.
- V11 no importa, infiere ni rellena la lista desde estados de lectura o ubicaciones.
- La revisión protege la estructura, no todos los cambios Book. El cliente puede
  cancelar una petición cuyo commit servidor ya ocurrió. No reintentar escrituras
  inciertas automáticamente ni modificar posiciones mediante SQL externo.
- La lista es personal y sin autenticación; no es una solución multiusuario.
- No hay pruebas manuales táctiles/lector de pantalla ni despliegue productivo
  certificados por esta ejecución. No se autoriza una migración real ni una PR.

Las instrucciones de uso, filtros/orden y limitaciones se encuentran también en
[READING-LIST-API.md](READING-LIST-API.md) y
[documentación Angular](../../frontend/mi-biblioteca-web/READING-LIST.md).
