# Etapa 9 — Prueba manual completa con proveedores reales y persistencia aislada

## Alcance y estado

Esta guía **prepara**, pero no ejecuta, la prueba. El usuario introducirá la clave
privadamente y realizará las acciones. No compartir la clave con OpenCode, incluirla
en comandos literales, archivos, capturas, logs o variables del frontend.

Base revisada: rama `feature/book-photo-import`, HEAD `f38a2d8` (etapa 8). No hay
cambios de código desde la última validación satisfactoria. Las etapas 6/7 documentan
la preparación histórica de la primera prueba; **su bloqueo de Open Library y su
restricción de no crear libros no son el recorrido completo descrito aquí**.

| Elemento | Destino de esta prueba |
| --- | --- |
| Angular | `http://127.0.0.1:4201/books/photo-import` |
| Backend | `http://127.0.0.1:8082` |
| Métricas | `http://127.0.0.1:8083/actuator/metrics` |
| PostgreSQL | `jdbc:postgresql://127.0.0.1:5433/bookdb_tests`, usuario `booktest` |
| Reconocimiento | OpenAI Responses, `gpt-5.4-mini` |
| Bibliografía | `https://openlibrary.org`, portadas `https://covers.openlibrary.org` |

No usar el backend habitual `8081`, Angular `4200`, `bookdb` ni el Compose habitual.
No restaurar backups, recrear bases/volúmenes, aplicar migraciones o limpiar tablas.
Las altas de esta prueba permanecerán en la base aislada; no se revierten al apagar.

## 1. Antes de arrancar

1. Reservar una sola fotografía no personal de dos o tres libros, JPEG/PNG, <=5 MiB,
   con orientación correcta y texto legible. No incluir rostros, documentos ni datos
   personales. No subir la fotografía a OpenCode ni guardarla en el repositorio.
2. Confirmar privadamente los créditos, la recarga automática desactivada y un límite
   de gasto aceptable. Créditos/alertas, límites de tokens y el consentimiento de la
   interfaz **no son un límite monetario por prueba**. `store:false` no es retención
   cero. El endpoint no tiene autenticación: mantenerlo solo en loopback.
3. Detener con Ctrl+C **solo los servidores de prueba anteriores** desde sus propias
   terminales. El backend debe reiniciarse para cargar el prompt/código de etapa 8;
   no reutilizar un proceso antiguo. No detener los servicios habituales de 8081/4200.
4. No ejecutar suites de integración mientras se realiza esta prueba manual: comparten
   `bookdb_tests` y pueden cambiar sus fixtures. Usar terminales nuevas, sin transcript,
   depuradores, grabación de sesión o trazas HTTP de cuerpos/cabeceras.
5. PostgreSQL aislado ya está preparado en 5433/V11. No es necesario arrancar ni
   recrear servicios Docker. Si no está disponible, detener este procedimiento y
   revisar el entorno aislado por separado, sin recurrir a la base habitual.

Comprobación local sin claves ni peticiones a proveedores, desde la raíz:

```powershell
Set-Location 'C:\mis-proyectos\mi-biblioteca'
git branch --show-current
git rev-parse --short HEAD
git status --short
Get-NetTCPConnection -State Listen -LocalPort 8082,8083,4201,5433 -ErrorAction SilentlyContinue |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

Antes del nuevo arranque: 5433 debe escuchar solo en `127.0.0.1`; 8082/8083/4201
deben quedar libres. Si hay un proceso ajeno, **no matarlo ni cambiar el destino**.
Durante esta preparación estaban ocupados los tres puertos de prueba; no se han
detenido ni consultado esos servidores desde OpenCode.

## 2. Terminal A — backend aislado, SOLO para ejecución manual posterior

PowerShell privada, desde la raíz del repositorio. El siguiente bloque activa la
configuración real **cuando lo ejecute el usuario**. No ejecutarlo como parte de
la preparación offline. La clave solo se introduce en `Read-Host`.

Se usa `spring-boot:test-run` con el main **normal** para conservar el classpath de
pruebas y su `IsolatedTestDatabaseInitializer`. No ejecuta JUnit ni carga las fixtures
de `PhotoImportOfflineApplication`. El inicializador valida la URL exacta, usuario,
contraseñas coherentes y overrides datasource/Flyway/Hikari antes de los beans;
consulta el destino en solo lectura y rechaza un servidor con `bookdb` o
`bookdb_restore_test`, o un rol administrativo. No sustituir por `spring-boot:run`,
`java -jar` o el main offline: perderías la guarda o usarías simulaciones.

```powershell
Set-Location 'C:\mis-proyectos\mi-biblioteca'
$ErrorActionPreference = 'Stop'
foreach ($port in 8082,8083) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "Puerto de prueba $port ocupado. Detén solo tu servidor de pruebas anterior."
    }
}
if (-not (Test-NetConnection 127.0.0.1 -Port 5433 -InformationLevel Quiet)) {
    throw 'PostgreSQL aislado no disponible. No se permite usar bookdb como alternativa.'
}

# Lee únicamente las credenciales LOCALES de PostgreSQL aislado, sin imprimirlas.
. ./scripts/Use-TestDatabase.ps1
$env:SERVER_ADDRESS = '127.0.0.1'
$env:SERVER_PORT = '8082'
$env:SPRING_PROFILES_ACTIVE = 'test'
$env:SPRING_FLYWAY_ENABLED = 'false'
$env:SPRING_JPA_HIBERNATE_DDL_AUTO = 'validate'
$env:PHOTO_IMPORT_ENABLED = 'true'
$env:PHOTO_IMPORT_PROVIDER = 'openai'
$env:PHOTO_IMPORT_MODEL = 'gpt-5.4-mini'
$env:PHOTO_IMPORT_CONNECT_TIMEOUT = '5s'
$env:PHOTO_IMPORT_REQUEST_TIMEOUT = '40s'
$env:PHOTO_IMPORT_MAX_OUTPUT_TOKENS = '6000'
$env:PHOTO_IMPORT_MAX_RESPONSE_BYTES = '1048576'
$env:MANAGEMENT_SERVER_ADDRESS = '127.0.0.1'
$env:MANAGEMENT_SERVER_PORT = '8083'
$env:MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE = 'health,metrics'

# Retirar SOLO el bloqueo usado en la primera prueba. No retirar el aislamiento.
Remove-Item Env:EXTERNAL_BOOKS_OPENLIBRARY_BASEURL -ErrorAction SilentlyContinue

# Argumentos NO secretos: fijan los destinos reales y las barreras de esta sesión.
# El resto de Open Library conserva sus valores: conexión 1s, petición 3s, total 8s.
$runArgs = @(
    '--server.address=127.0.0.1'
    '--server.port=8082'
    '--management.server.address=127.0.0.1'
    '--management.server.port=8083'
    '--management.endpoints.web.exposure.include=health,metrics'
    '--spring.flyway.enabled=false'
    '--spring.jpa.hibernate.ddl-auto=validate'
    '--photo-import.enabled=true'
    '--photo-import.provider=openai'
    '--photo-import.model=gpt-5.4-mini'
    '--photo-import.max-concurrent-analyses=1'
    '--external.books.open-library.base-url=https://openlibrary.org'
    '--external.books.open-library.covers-base-url=https://covers.openlibrary.org'
) -join ' '

$secret = $null
try {
    $secret = Read-Host 'Clave OpenAI privada (no enviarla a OpenCode)' -AsSecureString
    $env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
    Push-Location backend/book-service
    try {
        .\mvnw.cmd spring-boot:test-run '-Dspring-boot.run.main-class=com.mibiblioteca.bookservice.BookServiceApplication' "-Dspring-boot.run.arguments=$runArgs"
        if ($LASTEXITCODE -ne 0) { throw 'El backend no terminó correctamente. Revisar sin compartir secretos.' }
    } finally { Pop-Location }
} finally {
    if ($null -ne $secret) { $secret.Dispose() }
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    $env:PHOTO_IMPORT_ENABLED = 'false'
    $env:PHOTO_IMPORT_PROVIDER = 'none'
}
```

No pasar contraseñas por argumentos. Los `TEST_DB_*` y la configuración del recurso
de pruebas fijan datasource/Flyway; no se usan `DB_URL`/`DB_USER` de desarrollo como
fallback. Flyway sigue deshabilitado aunque se validen sus propiedades de conexión.
Hibernate solo valida. El directorio de portadas de pruebas es `target/test-covers`;
esta prueba no necesita upload/DELETE de portadas ni acceso al almacén habitual.

Si la guarda rechaza la configuración, detenerse; no desactivarla ni imprimir el
entorno completo. No usar `Get-ChildItem Env:`, `docker compose config`, volcado de
configuración, Actuator env/configprops o trazas HTTP. `Read-Host` evita que el valor
quede en el historial, pero el backend necesita una credencial en memoria/entorno:
no protege frente a administradores del sistema o captura de procesos.

## 3. Terminal B — Angular con proxy exclusivo a 8082

PowerShell nueva **sin clave ni credenciales de base de datos**:

```powershell
Set-Location 'C:\mis-proyectos\mi-biblioteca\frontend\mi-biblioteca-web'
if (Get-NetTCPConnection -State Listen -LocalPort 4201 -ErrorAction SilentlyContinue) {
    throw '4201 ocupado: detén solo tu Angular de pruebas anterior.'
}
npm start -- --host 127.0.0.1 --port 4201 --proxy-config proxy.photo-import-isolated.json
```

Abrir **http://127.0.0.1:4201/books/photo-import**. No usar pestañas en 4200 ni cambiar
el proxy normal. El proxy separado `/api/**` apunta a `http://127.0.0.1:8082`.

## 4. Terminal C — comprobaciones locales antes de analizar

Estos comandos son para el usuario durante la prueba, no se ejecutaron en esta preparación:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8082/actuator/health'
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/health'
$cap = Invoke-RestMethod 'http://127.0.0.1:4201/api/book-photo-import/capabilities'
$cap | Select-Object enabled,provider,mode,simulated,maxFileBytes,maxObservations,maxConcurrentAnalyses,analysisTimeoutMillis
```

Esperar `enabled=true`, `provider=openai`, `mode=REAL`, `simulated=false` y concurrencia
1. Los campos mostrados coinciden con el DTO de capabilities; el modelo no se
expone ahí: queda fijado en el bloque de arranque.
Cargar capabilities/health no llama a OpenAI/Open Library. Si aparece SIMULATED,
DISABLED o no funciona el proxy, detenerse antes de seleccionar/analizar.

Límites revisados: 3 fotografías en UI, 5 MiB por archivo, 6000 por eje/20M píxeles,
25 observaciones, concurrencia 1, 45s de análisis; OpenAI conexión 5s/petición 40s,
6000 tokens de salida, respuesta 1 MiB y PNG reconstruido máximo 15 MiB.
No hay reintentos ni fallbacks automáticos. El consentimiento se consume y debe
renovarse para otra petición real. No habilitar grabación HAR/cuerpos/base64.

Opcionalmente anotar solo los totales/revisión previos para distinguir datos existentes:

```powershell
(Invoke-RestMethod 'http://127.0.0.1:8082/api/books?page=0&size=1').totalElements
Invoke-RestMethod 'http://127.0.0.1:8082/api/reading-list' | Select-Object totalItems,revision
```

## 5. Recorrido manual y criterios de aceptación

1. **Fotografías:** seleccionar **un solo archivo** con dos o tres libros. Comprobar
   preview/orientación. Seleccionar, rotar o cambiar de paso no debe analizar. Aceptar
   la divulgación de privacidad/coste y pulsar **Analizar fotografías una sola vez**.
   No reintentar esta prueba automáticamente ante error/timeout: consultar consumo.
2. **Resultados:** debe avanzar al terminar. Revisar las tarjetas, legibilidad,
   resumen y avisos. Desplegar evidencia/fotografía para comparar cada título/autor.
   Un título oculto debe quedar desconocido/incompleto, no completado de memoria.
   Revisar duplicados del lote: pueden ser dos ejemplares físicos; no descartar
   solo por compartir título/autor. Las advertencias nuevas deberían estar en español.
3. **Navegación:** ir a Fotografías y volver a Resultados. Deben mantenerse imágenes,
   tarjetas y progreso, sin una segunda petición de análisis ni un nuevo cargo por
   navegar. No rotar/retirar después del análisis en esta prueba mínima.
4. **Revisión:** pulsar Revisar en una tarjeta. Corregir únicamente lo contrastado y
   buscar explícitamente por ISBN visible válido o título/autor en Open Library.
   Esto sí realiza consultas bibliográficas reales; no vuelve a enviar la foto a
   OpenAI. Las portadas externas pueden cargarse directamente en el navegador.
5. Elegir la obra y después una **edición comprobada**, sin confundir semejanza
   visual con confirmación bibliográfica. Verificar idioma, editorial, año, ISBN y
   portada cuando sean conocidos. No inventar un ISBN/edición para completar la
   prueba. Si no hay coincidencia fiable, completar manualmente datos contrastados
   o dejar ese candidato pendiente/descartarlo explícitamente.
6. Cambiar de paso y regresar: conservar búsqueda, edición elegida y borrador, sin
   repetir consultas por navegar. Verificar portada bibliográfica/fallback Sin portada;
   la fotografía de origen nunca debe convertirse en portada del Book. Un fallo de
   imagen muestra fallback sin cambiar el `coverUrl` confirmado.
7. Abrir el diálogo BookForm, contrastar/corregir datos y marcar el reconocimiento
   explícito de datos reales. **Confirmar revisión no crea un libro.** Esperar la
   comprobación de duplicados. Repetir solo para candidatos que se desee importar.
   Volver entre pasos conserva las correcciones; reabrir una revisión exige una
   nueva confirmación y deselecciona su autorización anterior por seguridad.
8. **Importación:** seleccionar solo los revisados/preparados, comprobar los títulos
   del resumen y confirmar **Importar libros seleccionados**. Esperar la cola
   secuencial. Anotar únicamente los IDs confirmados. Un libro ya existente no se
   crea otra vez. No cambiar ISBN ni aprobar coincidencias solo para forzar un alta.
9. **Lista de lectura:** comprobar que la sección aparece tras resultados confirmados.
   Consultar pertenencia por lote; seleccionar **uno** de los Books importados que
   todavía no pertenezca a la lista. Confirmar su incorporación por separado. Si se
   usa un Book existente, confirmar primero su identidad en el detalle. No debe
   cambiar el estado ni las fechas de lectura por añadirlo a la lista.
10. Esperar fin de todas las operaciones. Abrir los detalles/catalogo/lista mediante
    los enlaces del **puerto 4201**. Recargar y comprobar por ID que persisten los
    Books confirmados y el único añadido a la lista. Los borradores/fotografías de
    la importación son memoria de página y se pierden al recargar: es esperado, no
    una pérdida de Books guardados. No volver a analizar/importar para comprobar
    persistencia. No ejecutar suites para verificar estas altas: podrían alterar fixtures.
11. Anotar duración, tokens/coste y resultado; apagar según la sección siguiente.

Ante timeout/red/5xx o resultado incierto de un **POST de Book/lista**, no asumir
fracaso ni repetirlo ciegamente. Usar la reconciliación/consulta explícita existente
y revisar detalle/membership. Cancelar o detener espera/trunca la cola según la
operación, pero no revierte commits ni garantiza que OpenAI haya dejado de facturar.
No recargar/salir con operaciones pendientes o inciertas para intentar resolverlas.

## 6. Métricas y coste (terminal C)

Usar un backend recién arrancado para una sola petición, o anotar y restar valores
antes/después si se conserva el proceso. Antes de la primera petición, estas series
pueden responder 404 porque aún no existen; no provocar un análisis para crearlas.

```powershell
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/metrics/photo.import.openai.duration'
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/metrics/photo.import.openai.tokens?tag=kind:input_tokens'
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/metrics/photo.import.openai.tokens?tag=kind:output_tokens'
Invoke-RestMethod 'http://127.0.0.1:8083/actuator/metrics/photo.import.openai.tokens?tag=kind:total_tokens'
```

`duration` contiene COUNT/TOTAL_TIME en segundos. Una petición completada en proceso
nuevo debería dar COUNT=1; para ese caso TOTAL_TIME es la duración local. COUNT de
tokens son contadores de consumo, no número de peticiones. Si COUNT de duración >1,
revisar la secuencia antes de continuar: es un aviso, no necesariamente cobros
confirmados múltiples. Un error puede no proporcionar usage; **ausente no es cero**.

Referencia de precios documentados en etapa 7 para `gpt-5.4-mini`: entrada no cacheada
0,75 USD/M y salida 4,50 USD/M. Verificar tarifas actuales privadamente en la cuenta.
Estimación conservadora sin descuento de caché:

```text
USD estimados = (input_tokens * 0.75 + output_tokens * 4.50) / 1000000
```

La imagen consume tokens de entrada; no sumar su tamaño en bytes a la fórmula.
Los tokens de razonamiento facturados en salida ya forman parte del consumo de salida.
Confirmar gasto real en el panel de OpenAI, que puede actualizarse con retraso.
Las consultas Open Library/lectura de portadas no son análisis OpenAI adicionales.
Registrar solo modelo, duración, tokens, estimación y un checklist/IDs de prueba;
no imagen, key, cuerpos de respuesta, base64 o capturas con datos privados.

## 7. Detención y limpieza de entorno, no de datos

1. Con operaciones finalizadas, Ctrl+C en Angular (terminal B) y backend (terminal A).
   Esperar a que los procesos terminen. No apagar PostgreSQL ni otros servicios.
2. El `finally` elimina la clave del entorno y desactiva la configuración de esa
   terminal. Como comprobación defensiva, ejecutar en **la terminal A** tras detener:

```powershell
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
$env:PHOTO_IMPORT_ENABLED = 'false'
$env:PHOTO_IMPORT_PROVIDER = 'none'
# Solo informa de presencia, nunca muestra el valor:
Test-Path Env:OPENAI_API_KEY
```

   Debe devolver `False`. No basta con eliminarla mientras el backend sigue vivo:
   el proceso hijo conserva la copia heredada hasta terminar. Si se cerró la terminal
   abruptamente, comprobar que no quedó su proceso; no matar procesos por nombre.
3. Cerrar las terminales privadas para desechar también las credenciales DB y los
   overrides process-local. En otra terminal comprobar:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8082,8083,4201 -ErrorAction SilentlyContinue |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

   No debe quedar ningún listener de esta prueba. No reutilizar sus puertos sin
   identificar el proceso. Las altas se conservan en `bookdb_tests`; no hay limpieza
   automática, borrado de fotografías persistidas (no se persisten) ni rollback global.

## 8. Evidencia offline y pendientes

- Código sin cambios respecto a `f38a2d8`; solo documentación de preparación.
- Se revisaron `PHOTO-IMPORT-VALIDATION.md`, `PHOTO-IMPORT-OPENAI.md`,
  `PHOTO-IMPORT-UX.md`, YAML, propiedades OpenAI, proxy y guardas de pruebas.
- El modelo coincide en YAML/record (`gpt-5.4-mini`), sin activar por defecto el
  proveedor. Open Library conserva la URL real por defecto, sin migraciones nuevas.
- Validación focalizada offline ejecutada: **42 pruebas aprobadas en 3 archivos**
  (wizard 8, consentimiento/análisis 31, integración de importación/lista 3).
  Usan HttpTestingController, sin Internet. Comando desde el workspace frontend:

  ```powershell
  npm run test:ci -- --include=src/app/features/books/pages/book-photo-import/book-photo-import.wizard.spec.ts --include=src/app/features/books/pages/book-photo-import/book-photo-import.analysis.spec.ts --include=src/app/features/books/pages/book-photo-import/book-photo-import.workflow.spec.ts
  ```
- No se repiten las suites completas: referencia última etapa 8, backend 682 con
  0 fallos/errores y 1 omitida; frontend 1198 aprobadas. Son resultados anteriores,
  no nuevas ejecuciones de suites completas en esta etapa.
- Se analizaron sintácticamente los 9 bloques PowerShell de esta guía, sin ejecutarlos:
  0 errores. `git diff --check` correcto; los archivos nuevos también se revisan
  separadamente porque todavía no tienen seguimiento.
- La preparación no arranca ni consulta los servidores reales en 8082/8083/4201,
  no realiza llamadas OpenAI/Open Library, no solicita ni lee la clave privada y
  no accede a `bookdb`, migraciones, backups o credenciales para modificarlos.
- Pendientes para el usuario: renderizado en navegador real/móvil/lector de pantalla,
  precisión del prompt nuevo, edición correcta, disponibilidad/portadas reales,
  persistencia tras recarga y gasto final. Las pruebas jsdom no prueban estos puntos
  reales. No se ha identificado un defecto funcional nuevo en la revisión offline;
  cualquier anomalía manual debe registrarse antes de proponer un cambio acotado.

**Detenerse aquí en la preparación. La prueba real solo la ejecuta manualmente el usuario.**
