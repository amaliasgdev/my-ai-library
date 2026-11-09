# Lista de lectura — Etapas 4 y 5

`/reading-list` es una página standalone lazy accesible desde la navegación principal.
Usa Angular Material, signals locales y el API_CONFIG existente. No añade dependencias.

## Uso

- Muestra portadas o fallback, título, autor, posición global, estado y fechas
  existentes. La finalización de libros leídos se destaca visualmente.
- El título abre el detalle existente del libro.
- Todos / Por leer / Leyendo / Leídos / Abandonados consultan el backend.
  Las posiciones no se renumeran en vistas filtradas.
- Subir/Bajar envían la posición absoluta adyacente y la revisión como cadena,
  sin conversión numérica. Solo se permiten en Todos y dentro de los límites.
- Retirar elimina exclusivamente la pertenencia a la lista, nunca el libro.
- Iniciar/Finalizar usan los endpoints Book existentes y la fecha local del navegador.
  El selector manual de estado no modifica las fechas.
- Gestionar fechas reutiliza BookReadingDatesDialog y los PUT/DELETE existentes.
- Un libro leído permanece en la lista hasta su retirada explícita.

## Incorporación desde catálogo y detalle (Etapa 5)

BookCard y BookDetail comparten ReadingListAction. ReadingListMembership tiene
alcance de página, sin estado global ni peticiones por tarjeta. Consulta una vez
los IDs visibles del catálogo (como máximo 100), o un único ID en detalle, usando
parámetros bookId repetidos y conservando la revisión decimal como cadena.

Se distinguen Consultando, En mi lista, Añadir y Pertenencia desconocida. Un fallo
de membership no se interpreta como ausencia ni bloquea catálogo, filtros,
búsqueda, paginación o navegación. Reintentar pertenencia solo ejecuta GET.
Cada cambio de página cancela el lote anterior y rechaza respuestas obsoletas.
La pertenencia no se guarda en la URL ni modifica el contexto de detalle/edición.

El alta permite una escritura a la vez y solo con ausencia y revisión confirmadas.
Una respuesta exitosa refresca el lote visible para obtener la nueva revisión e
indicadores. 409 también consulta pertenencia; red/5xx anuncian resultado incierto.
Nunca se repite POST automáticamente; si falla esa consulta las acciones quedan
deshabilitadas con pertenencia desconocida, mientras el resto del catálogo funciona.
Una consulta que confirme ausencia permite una nueva decisión explícita: una
petición anterior incierta aún podría terminar; revisión y unicidad del backend
siguen siendo la protección autoritativa.

## Drag & Drop (Etapa 5)

La lista vertical usa cdkDropList/cdkDrag y un asa visible cdkDragHandle. Solo el
asa inicia arrastre, evitando interferir con botones o enlaces. En táctil tiene
un retardo de 180 ms y touch-action: none exclusivamente en el asa; el resto de
la tarjeta permite desplazamiento normal. Subir/Bajar siguen disponibles para
teclado, con instrucciones y etiquetas accesibles.

El drop valida origen, puntero dentro, fila vigente y destino. Traduce el destino
a la posición global confirmada y reutiliza la misma operación que Subir/Bajar.
No llama moveItemInArray ni muta el array; la previsualización CDK no se considera
persistencia. Al soltar se conserva el orden confirmado hasta la respuesta y la
recarga GET. Filtros activos, escritura o sincronización pendiente bloquean los
movimientos tanto en UI como en código. Conflictos y resultados inciertos siguen
la recuperación descrita arriba, sin repetir movimientos automáticamente.

Las portadas existentes no se han refactorizado en esta etapa: no se introduce
otro renderizador ni se alteran URLs, fallback o lazy loading. Las regresiones de
BookCard, detalle y lista siguen comprobando esos comportamientos.

## Coordinación

Un switchMap cancela GET anteriores; las suscripciones se cancelan al destruir
la página y se cierra el diálogo de fechas. No hay escrituras optimistas.
Una sola escritura por pantalla bloquea acciones, filtro y actualización hasta
confirmar la recarga. Un error de sincronización conserva ese bloqueo y ofrece
Reintentar consulta, que repite solo GET.

Un 409 consulta el estado actual. Red/5xx se anuncian como resultado incierto y
consultan el estado sin repetir POST/PATCH/PUT/DELETE. Los errores de validación
del diálogo conservan sus valores para una corrección explícita. Ningún mensaje
muestra detalles HTTP arbitrarios del servidor.

El foco vuelve a la tarjeta del libro movido después de la recarga confirmada;
si ya no existe, vuelve al encabezado. Confirmaciones y errores son accesibles.
El diseño usa CSS Grid/Flexbox y portadas de tamaño reducido en móvil.

## Alcance y verificación

No hay cambios de controles ISBN ni cambios backend, REST, migraciones o bases
de datos. Tampoco hay almacenamiento
de preferencias o filtros: el estado de esta pantalla es local.

Pruebas offline con HttpTestingController y harness Material: servicio y revisión
sin pérdida de precisión, navegación lazy, carga/vacío/error, filtros/cancelación,
portadas, orden no optimista, foco, retiradas, estados/fechas, conflictos,
resultados inciertos y reintentos exclusivamente GET.

Los tests de integración nuevos comprueban explícitamente los lotes y las altas
desde catálogo/detalle. Las suites anteriores completan por separado los GET de
membership con un helper de pruebas; sus verificaciones de ausencia de recargas
excluyen únicamente este nuevo endpoint independiente, sin omitir escrituras ni
ninguna petición bibliográfica. Se conserva la cobertura de navegación y filtros.
Los tests de drop verifican el evento, la petición persistente, la recarga, el
foco y el bloqueo por filtros/conflictos, sin depender de un backend en ejecución.
La interacción táctil física requiere comprobación manual en un dispositivo real.

Desde este workspace:

```text
npm run test:ci
npm run lint
npm run format:check
npm run build
```

No hace falta arrancar el backend ni PostgreSQL para esta verificación.

## Validación integral — Etapa 6

La suite frontend cubre las operaciones anteriores con HTTP simulado, los harnesses
Material, navegación real del Router y eventos CDK. No certifica gestos táctiles
físicos, contraste visual en todos los dispositivos ni una auditoría completa con
lector de pantalla. Esas comprobaciones manuales deben realizarse antes de una
liberación, sin apuntar nunca al backend conectado a bookdb.

El recorrido HTTP real y la persistencia PostgreSQL se verifican por separado
mediante ReadingListHttpJourneyTest en el entorno aislado. Las instrucciones y
los resultados están en
[TESTING.md](../../backend/book-service/TESTING.md) y
[READING-LIST-VALIDATION.md](../../backend/book-service/READING-LIST-VALIDATION.md).

Limitaciones: una lista personal sin usuarios ni autorización, sin paginación de
la lista, sin reordenación en filtros activos ni orden optimista. Consultas y
actualizaciones son instantáneas: otra sesión puede cambiar la lista después de
una lectura. La revisión protege escrituras estructurales; no es una versión
global de los datos Book. Una cancelación cliente no revierte un commit servidor.
No existe undo, historia de movimientos ni reintento automático de escrituras.
