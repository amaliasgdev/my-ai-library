# Lista de lectura — Etapa 4

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

No hay Drag & Drop, incorporación desde catálogo/detalle, controles ISBN ni
cambios backend, REST, migraciones o bases de datos. Tampoco hay almacenamiento
de preferencias o filtros: el estado de esta pantalla es local.

Pruebas offline con HttpTestingController y harness Material: servicio y revisión
sin pérdida de precisión, navegación lazy, carga/vacío/error, filtros/cancelación,
portadas, orden no optimista, foco, retiradas, estados/fechas, conflictos,
resultados inciertos y reintentos exclusivamente GET.

Desde este workspace:

```text
npm run test:ci
npm run lint
npm run format:check
npm run build
```

No hace falta arrancar el backend ni PostgreSQL para esta verificación.
