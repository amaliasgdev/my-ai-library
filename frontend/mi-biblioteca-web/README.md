# Mi Biblioteca Web

Base técnica del frontend: Angular 22 standalone, routing y TypeScript/templates
estrictos. Angular Material es la única librería UI; Angular CDK forma parte de
ese stack y de sus harnesses de pruebas. No se usan PrimeNG, Tailwind ni Bootstrap.

## Requisitos e instalación

- Node 22.22.3 o posterior dentro de Node 22.
- npm 10 o posterior.

Desde `frontend/mi-biblioteca-web`:

```powershell
npm install
npm start
```

Abrir `http://localhost:4200/`. Para instalaciones reproducibles posteriores, usar
`npm ci`. No hace falta instalar Angular CLI globalmente; los scripts utilizan la
versión local. No usar `--force` ni `--legacy-peer-deps` para resolver conflictos.

## Escanear ISBN en alta

En el catálogo, **Introducir ISBN**, junto a **Añadir libro** y **Escanear ISBN**,
abre un diálogo para iniciar el alta, no buscar libros guardados. Acepta solo
ISBN-13 válido; puedes escribir espacios ASCII y guiones `-`, que se eliminan
antes de comprobar prefijo/checksum (sin ISBN-10, Unicode ni correcciones).
**Continuar** o Enter devuelve el ISBN canónico y navega a `/books/new?isbn=...`,
reutilizando el consumo único y lookup de BookCreate. Si es inválido, muestra un
error y permanece abierto. Cancelar/Escape/backdrop dejan el catálogo intacto.
No se ejecuta lookup en el diálogo ni se guarda nada automáticamente: revisa los
campos en alta y pulsa **Guardar**. Scanner y entrada manual no se superponen.

En `/books/new`, **Escanear ISBN** abre un diálogo con cámara o **Seleccionar imagen**.
Solo acepta códigos EAN-13 de ISBN con checksum válido (978/979, excluyendo 9790).
El primer ISBN válido detiene la cámara, rellena el campo y ejecuta el mismo lookup
que **Buscar por ISBN**, completando únicamente campos vacíos. Revisa los datos:
solo **Guardar** crea el libro. Cancelar el scanner no modifica el formulario.

En el catálogo, **Escanear ISBN**, junto a **Añadir libro**, sirve para añadir un
libro, no para buscarlo en la biblioteca. Reutiliza el mismo diálogo; cancelar
permanece en catálogo. Un ISBN válido navega a `/books/new?isbn=978...`.
BookCreate consume esa semilla una sola vez con el formulario disponible, aplica
el ISBN y ejecuta el lookup existente. Después reemplaza la URL por `/books/new`,
sin repetir/cancelar la consulta ni resetear el formulario. También funciona al
abrir directamente una URL con un único ISBN-13 válido; parámetros vacíos,
inválidos o repetidos no se reparan y no lanzan lookup.
Recargar la URL ya limpia no repite lookup ni restaura borradores; abrir de nuevo
una URL con ISBN como nueva entrada sí consulta. El error conserva ISBN editable.
Nunca hay persistencia automática: revisa los metadatos y pulsa **Guardar**.

El reconocimiento usa ZXing local (`@zxing/browser` 0.1.5 y `@zxing/library` 0.21.3),
cargado bajo demanda. Vídeo, frames e imágenes no se envían ni se guardan.
El lookup posterior sí envía el ISBN al backend y consulta Open Library.
JPEG/PNG: hasta 10 MiB y 20 millones de píxeles, sin preview ni subida.

La cámara requiere **HTTPS o localhost**: `http://IP_DEL_PC:4200` desde un móvil
no garantiza acceso. Si no hay cámara o permiso, siguen funcionando imagen,
ISBN manual y Buscar por ISBN. La cámara se detiene al cerrar, ocultar pestaña
o tras 60 segundos sin resultado; reanudar requiere una acción explícita.
No hay scanner en edición, OCR, IA, QR ni creación automática.
Los tests mockean cámara y decoder y no usan servicios externos ni cámara real.

## Comandos

| Comando                | Función                                                 |
| ---------------------- | ------------------------------------------------------- |
| `npm start`            | Servidor de desarrollo con proxy y recarga              |
| `npm run build`        | Build de producción en `dist/mi-biblioteca-web/browser` |
| `npm run test:ci`      | Vitest/jsdom sin modo watch                             |
| `npm test`             | Tests en modo watch                                     |
| `npm run lint`         | angular-eslint/ESLint para TypeScript y templates       |
| `npm run format:check` | Comprobar formato con Prettier                          |
| `npm run format`       | Aplicar formato al frontend                             |

## Versiones

- Angular/compiler 22.2.1; Angular CLI/build 22.2.2.
- Angular Material/CDK 22.2.2.
- TypeScript 6.0.2, RxJS 7.8.2.
- Vitest 5.0.3, jsdom 30.1.2.
- angular-eslint 22.5.0, ESLint 10.12.0, Prettier 3.9.9.

Las versiones resueltas están en `package-lock.json`. El frontend funciona con los
defaults zoneless de Angular 22, sin Zone.js ni providers de animaciones legacy.

## Estructura y alcance

- `src/app/core/config/api.config.ts`: token `API_CONFIG` y `apiBaseUrl: '/api'`.
- `src/app/layout/app-shell/`: shell semántico, navegación Material y router-outlet.
- `src/app/features/books/pages/books-catalog/`: catálogo paginado standalone, formulario de búsqueda local y validadores específicos.
- `src/app/features/books/pages/book-create/`: formulario de alta en `/books/new`.
- `src/app/features/books/pages/book-edit/`: carga y edición en `/books/:id/edit`.
- `src/app/features/books/components/book-form/`: formulario Material compartido, validadores y builder único de `BookRequest`, sin HTTP ni routing.
- `src/app/features/books/components/book-card/`: tarjeta de libro y fallback de portada.
- `src/app/features/books/components/book-delete-dialog/`: confirmación específica de eliminación con MatDialog.
- `src/app/features/books/services/books.service.ts`: listado, búsqueda paginada, creación, GET por id, PUT completo y DELETE mediante `API_CONFIG`.
- `src/app/features/books/models/book.models.ts`: contratos frontend de libros y páginas.
- `src/app/app.routes.ts`: redirección `/` a `/books` y carga diferida.
- `src/styles/`: tema Material y tokens propios; componentes con SCSS local.

La pantalla muestra el catálogo real con tarjetas y paginación del servidor, ordenado
inicialmente por título ASC. **Añadir libro** abre un formulario con título y autor obligatorios,
metadatos opcionales, géneros y URL externa de portada. Guardar crea el libro y vuelve
al catálogo. **Editar** en cada tarjeta abre el mismo formulario con los valores actuales;
Guardar reemplaza los 10 campos bibliográficos mediante PUT. La URL de portada recibida,
incluidas las portadas gestionadas, se conserva exactamente si no se cambia; sustituirla
o vaciarla reemplaza o elimina la referencia y el backend gestiona la limpieza.
Cancelar vuelve sin guardar, sin confirmación de salida. No hay preview local
ni upload de portada durante el alta. **Eliminar** abre una confirmación Material con foco inicial en Cancelar;
Escape y clic fuera cancelan. Solo confirmar ejecuta DELETE del libro: el backend limpia
su portada gestionada. Durante la petición se bloquean Eliminar, el paginador y Editar
del libro afectado, pero Añadir libro permanece disponible. El éxito recarga la página
actual desde backend; si llega vacía y es mayor que 0, pide una vez la página anterior.
Los errores de DELETE se muestran inline y conservan el catálogo; si falla la recarga,
se muestra el error de carga sin repetir el borrado.

**Buscar libros** permite combinar título y autor, o buscar exclusivamente por ISBN.
Requiere un criterio no vacío, limita título/autor a 255 e ISBN a 20 caracteres y valida
solo el formato ISBN del CRUD, sin checksum ni ISBN lookup. Buscar o Enter envía la
consulta; escribir no hace peticiones. La última búsqueda enviada se conserva como
snapshot independiente de los inputs: paginación, Reintentar y recarga tras DELETE
usan ese snapshot, aunque se editen después los campos. Las búsquedas nuevas vuelven
a página 0 conservando el tamaño y el orden aplicado. **Limpiar búsqueda** vacía campos y vuelve al listado en
página 0, con el mismo tamaño y orden. Buscar/Limpiar búsqueda se bloquean durante DELETE, pero los
campos siguen editables. Sin coincidencias se muestra «No se encontraron libros»;
los errores de búsqueda son inline y permiten Reintentar. El catálogo conserva su consulta
en la URL y al volver desde detalle/edición, sin localStorage. No implementa filtros adicionales por fechas/páginas/portada,
libros ficticios, autenticación ni estado global. Tampoco hay
SSR, PWA o Docker frontend. Crear otras carpetas compartidas solo cuando existan
necesidades reales.

**Ordenar libros** ofrece campo (Título, Autor, Fecha de creación, Estado de lectura
o Valoración) y dirección (Ascendente/Descendente), separados del formulario de búsqueda.
Cada cambio se aplica inmediatamente desde backend y vuelve a página 0, conservando
el tamaño y la búsqueda ya enviada; los inputs editados sin Buscar no se aplican.
El snapshot `currentSort` se conserva al paginar, cambiar tamaño, buscar, limpiar,
reintentar y recargar después de DELETE, incluido el retroceso de una página vacía.
Los dos selects se bloquean durante DELETE. No se ordena localmente ni se reubican
estados o valoraciones nulas. Búsqueda, filtros y ordenación se combinan en backend.

**Filtros del catálogo** es un formulario Material separado de búsqueda y alta:
estado múltiple, valoración mínima, año desde/hasta, género, idioma y editorial.
Editar no navega ni hace GET. **Aplicar filtros** valida y pone página 0 conservando
búsqueda/orden/tamaño; **Limpiar filtros** borra filtros y borradores, conservando
esos mismos valores. Buscar/Limpiar búsqueda conserva filtros. Sin cambio efectivo
no hay otro GET. Durante DELETE, Aplicar/Limpiar quedan bloqueados.

Valoración es inclusiva (1–5), años inclusivos (1–2100, desde <= hasta); valores
desconocidos no cumplen esos límites. Género coincide exactamente con un elemento
del array sin distinguir mayúsculas (máximo 50), idioma usa código ISO de dos letras
y editorial coincide parcialmente sin distinguir mayúsculas (máximo 255).
Los textos se recortan exteriormente y `%`/`_` no son comodines SQL.

### URLs del catálogo

La URL es la fuente de verdad de página, tamaño, orden, búsqueda y filtros aplicados. Ejemplos:

- `/books`: página 0, tamaño 20, título ASC, sin búsqueda.
- `/books?page=2&sortBy=author&direction=DESC&title=dune`.
- `/books?size=50&isbn=9780306406157`.
- `/books?readingStatus=READING&readingStatus=READ&ratingMin=4&genre=Terror`.

Se aceptan `page`, `size`, `sortBy`, `direction`, `title`, `author`, `isbn`,
`readingStatus`, `ratingMin`, `yearFrom`, `yearTo`, `genre`, `language`, `publisher`.
Solo `readingStatus` puede repetirse (máximo cuatro ocurrencias, sin CSV); se
deduplica y serializa en orden TO_READ/READING/READ/ABANDONED. Idioma se convierte
a minúsculas, textos se recortan y vacíos/defaults se omiten. Un escalar inválido
o repetido se descarta; si un estado es inválido se descarta todo el grupo; un rango
invertido descarta ambos años. Parámetros desconocidos se eliminan y se normaliza
sin alertas, reemplazando la URL antes de consultar. Un ISBN válido tiene prioridad
sobre título/autor; textos demasiado largos se descartan, no se truncan.
Buscar, ordenar y paginar crean historial normal; corregir la URL o retroceder
automáticamente una página tras DELETE usa `replaceUrl`. Retry y recargas por
escrituras no navegan y consultan la URL actual mediante la misma cadena cancelable.
Los borradores de búsqueda y filtros se conservan al paginar/ordenar/reintentar/recargar.
Solo un cambio URL de sus criterios sincroniza el formulario correspondiente.
BooksService envía filtros a listado y búsqueda con un serializador HTTP común;
ambos endpoints públicos siguen separados. Confirmaciones de estado/start/finish
recargan si hay filtro de estado; valoración recarga si hay ratingMin, además de
las recargas por orden dependiente existentes. No se filtran tarjetas localmente.

Los enlaces Ver detalle/Editar transportan esos mismos parámetros; Volver al
catálogo, Cancelar y Guardar en edición los conservan. Back/Forward y recargar
restauran el contexto sin estado global ni almacenamiento. Alta sigue volviendo
al catálogo por defecto. Un DELETE desde detalle conserva contexto, pero no
aplica el retroceso automático de página reservado al DELETE del catálogo.

Cada tarjeta permite cambiar **Estado de lectura** (Por leer, Leyendo, Leído,
Abandonado) y **Valoración** (Sin valorar, 1–5) con selects Material. El cambio
es inmediato, sin Guardar, pero el selector mantiene el valor confirmado mientras
espera al backend. Estado usa PATCH con `{ readingStatus }`; valoración usa PUT
con `{ rating }`, o DELETE sin body para Sin valorar. Cambiar estado no modifica
fechas: PATCH de estado sigue siendo independiente de los endpoints de fechas.

PATCH/PUT sustituye solo el libro confirmado si el orden no depende del campo
modificado. Orden por ese campo, quitar valoración o cambiar de consulta durante
la operación requiere recargar la consulta vigente, conservando búsqueda, orden,
página y tamaño. No se ordena localmente. Un GET antiguo pendiente se cancela tras
confirmar una escritura para no sobrescribir datos recientes.

Se permiten actualizaciones simultáneas en libros distintos; cada libro bloquea
sus selects, Editar y Eliminar mientras espera. Los errores seguros se muestran
inline en su tarjeta, sin cambiar valores. Cualquier actualización pendiente
bloquea Eliminar libro en todo el catálogo, y un DELETE de libro bloquea todos
los selects de estado/valoración. Si solo hay actualizaciones, búsqueda, orden,
paginación y Añadir libro permanecen disponibles. Una recarga fallida se trata
como error de carga, sin repetir la escritura confirmada.

Las tarjetas muestran siempre **Inicio** y **Fin**, con «Sin fecha» para valores
ausentes. **Empezar lectura** (solo Por leer) y **Finalizar lectura** (Por leer o
Leyendo) envían POST con `{ date: 'YYYY-MM-DD' }` usando la fecha local de hoy,
sin conversión UTC ni confirmación adicional. Solo la respuesta backend cambia
el estado: iniciar pasa a Leyendo y finalizar a Leído, sin inventar fechas ausentes.

**Gestionar fechas** abre un diálogo específico con datepickers Material nativos
y entrada estricta YYYY-MM-DD. Guardar reemplaza ambas fechas por PUT: requiere
al menos una, permite solo inicio/solo fin, fechas iguales y futuras, y valida que
fin no preceda a inicio. **Eliminar fechas** usa DELETE sin body, sin segunda
confirmación. PUT/DELETE de fechas no cambian el estado de lectura.

El diálogo no hace HTTP. Ante errores conserva los campos editados y muestra un
mensaje seguro; durante la escritura bloquea campos, acciones, Escape y backdrop.
El éxito lo cierra. Start/finish recarga si se ordena por estado; PUT fechas
reemplaza la respuesta confirmada y DELETE fechas siempre recarga la consulta
vigente. Se mantienen búsqueda, orden, página y tamaño. Las acciones de fechas
comparten las guardas por libro y la exclusión global con DELETE de libro.

## Detalle del libro

**Ver detalle** en cada tarjeta abre `/books/:id`, con portada, datos bibliográficos,
géneros, estado/valoración, fechas de lectura, descripción y metadatos de creación
y actualización. La vista es de solo lectura, responsive y usa el GET existente.
Las fechas de lectura se presentan sin conversiones UTC y los timestamps en hora
local. Un ID inválido no consulta el backend; los errores de carga permiten
reintentar el GET del libro actual. **Editar** abre el formulario y **Volver al
catálogo** vuelve a `/books`. **Eliminar** reutiliza la confirmación existente;
solo tras DELETE correcto vuelve al catálogo, sin recargar detalle. No hay edición
inline, upload ni lookup en esta página.

## Portadas en edición

`/books/:id/edit` tiene una sección **Portada** independiente del formulario.
Muestra la imagen confirmada o «Sin portada», un selector JPEG/PNG (archivo no
vacío, máximo 5 MiB) y su nombre. La extensión original no se valida. **Subir portada**
envía multipart con campo `file`; no se fija Content-Type manualmente. Guarda
inmediatamente y reemplaza una URL externa o gestionada. No hay preview local.

**Eliminar portada** aparece solo si la referencia confirmada cumple la regla de
portada gestionada. DELETE devuelve 204 y después se consulta el libro por GET.
Si falla esa consulta, se bloquean escrituras y **Reintentar actualización** repite
solo GET. Las referencias externas se pueden cambiar o vaciar en `coverUrl` y
Guardar; el backend gestiona toda limpieza física y nunca borra recursos externos.

La precarga inicial no se repite: las respuestas de portada sincronizan únicamente
`coverUrl`, sustituyendo su borrador y preservando los demás cambios, géneros
pendientes y dirty/touched/errores. PUT general, upload, delete y su recarga son
excluyentes. Durante las operaciones se bloquean controles y Cancelar; no hay
route guard. Un error de upload conserva archivo e imagen para reintento explícito.

### Configuración pública de portadas

`src/app/core/config/covers.config.ts` define `COVERS_CONFIG.publicBaseUrl`, cuyo
default de desarrollo es `http://localhost:8081/api/covers`. Debe coincidir con
`COVERS_PUBLIC_BASE_URL` del backend. Para otro despliegue, proveer el token en
`app.config.ts`, por ejemplo:

```ts
{ provide: COVERS_CONFIG, useValue: { publicBaseUrl: 'https://images.example.test/library/covers' } }
```

La configuración contiene solo origen/ruta públicos, nunca el directorio físico.
La clasificación valida origen completo, ruta y filename exactos con el ID del
libro, UUID minúscula y jpg/png, sin credenciales/query/fragment. Es solo UX: no
sustituye la autoridad backend. Si la configuración no coincide, Eliminar se oculta;
upload y edición manual siguen disponibles. No se infiere el origen desde el proxy.

## UI y tema

### Consulta por ISBN en el alta

En `/books/new`, **Buscar por ISBN** consulta metadatos sin crear ni guardar libros
ni comprobar duplicados locales. Solo completa campos vacíos (título, autor,
editorial, año, páginas, idioma y URL de portada); el ISBN se sustituye por el
normalizado por backend. La descripción y los datos ya escritos se conservan,
incluidos los editados durante la espera. Los géneros solo se aplican si no hay
chips ni texto pendiente, sin fusionar listas. Los valores desconocidos no borran
datos. Revisa la propuesta: **Guardar** sigue siendo la única creación.

El resto del formulario permanece editable durante la consulta. Cambiar ISBN,
intentar Guardar o cancelar/salir cancela la petición pendiente; escribir no inicia
consultas. Los errores de proveedor se muestran inline y permiten volver a intentar
o continuar manualmente, sin invalidar el formulario. No hay checksum frontend,
lookup en edición, preview/descarga de portada, caché ni retries automáticos.

Material es la única UI para controles, navegación y futuros formularios/tablas.
Grid/Flexbox y SCSS/CSS propios cubren layout, responsive, espaciado y
personalización. Preferir tokens y APIs públicas de Material; evitar `::ng-deep`,
selectores internos y `!important` innecesario.

`_material-theme.scss` utiliza `mat.theme` con tema claro inicial, tipografía de
sistema y paletas provisionales. La clase `app-dark` en `<html>` prepara los colores
oscuros, incluyendo overlays. No hay selector, persistencia ni detección automática
del tema del sistema. No se descargan fuentes ni recursos desde un CDN.

## Backend y proxy

`provideHttpClient()` está en `app.config.ts`. `BooksService` inyecta `API_CONFIG`
para consultar y buscar en el catálogo, crear, editar y eliminar libros; los servicios no deben repartir URLs absolutas por el
código. No hay interceptores ni cliente generado desde OpenAPI.

`proxy.conf.json` reenvía `/api/**` a `http://localhost:8081`, conservando la ruta.
No se modifica el backend ni CORS. Para usar el catálogo, el alta y la edición manualmente, arrancar
Spring Boot por separado con su base de datos; los tests usan HTTP simulado y no
requieren backend. Reiniciar
`npm start` después de cambiar el proxy.

El proxy solo existe en desarrollo. En producción se deberá configurar el servidor
para enrutar `/api` al backend y devolver `index.html` para las rutas de la SPA.
La configuración frontend es pública y no debe contener secretos.

## Tests y workflow

Tests colocados junto al código: arranque/shell, routing, componente Material con
harness y HTTP con `HttpTestingController`, sin Internet ni datos reales de libros.
La verificación visual responsive requiere además navegador, no solo jsdom.

Configuración inicial en `chore/setup-frontend`; futuras funcionalidades en
`feature/*`, con PR hacia `develop`. No hacer commit ni push automáticamente.
