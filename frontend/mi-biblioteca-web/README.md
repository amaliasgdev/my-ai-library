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
Cancelar vuelve sin guardar, sin confirmación de salida. No hay preview
ni upload de portada. **Eliminar** abre una confirmación Material con foco inicial en Cancelar;
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
los errores de búsqueda son inline y permiten Reintentar. No se persiste la búsqueda
en URL/localStorage ni al volver de alta/edición. No implementa filtros avanzados, detalle,
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
estados o valoraciones nulas. No hay filtros: los endpoints actuales no admiten
filtrar por estado, valoración, géneros ni año de publicación. El orden tampoco
se persiste en URL/localStorage ni al volver de alta/edición.

Cada tarjeta permite cambiar **Estado de lectura** (Por leer, Leyendo, Leído,
Abandonado) y **Valoración** (Sin valorar, 1–5) con selects Material. El cambio
es inmediato, sin Guardar, pero el selector mantiene el valor confirmado mientras
espera al backend. Estado usa PATCH con `{ readingStatus }`; valoración usa PUT
con `{ rating }`, o DELETE sin body para Sin valorar. Cambiar estado no modifica
fechas: no se llaman start-reading, finish-reading ni reading-dates.

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

## UI y tema

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
