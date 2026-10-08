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
- `src/app/features/books/pages/books-catalog/`: catálogo paginado standalone.
- `src/app/features/books/pages/book-create/`: formulario de alta en `/books/new`.
- `src/app/features/books/components/book-card/`: tarjeta de libro y fallback de portada.
- `src/app/features/books/services/books.service.ts`: GET paginado y POST de creación mediante `API_CONFIG`.
- `src/app/features/books/models/book.models.ts`: contratos frontend de libros y páginas.
- `src/app/app.routes.ts`: redirección `/` a `/books` y carga diferida.
- `src/styles/`: tema Material y tokens propios; componentes con SCSS local.

La pantalla muestra el catálogo real con tarjetas y paginación del servidor, ordenado
por título ASC. **Añadir libro** abre un formulario con título y autor obligatorios,
metadatos opcionales, géneros y URL externa de portada. Guardar crea el libro y vuelve
al catálogo; Cancelar vuelve sin guardar, sin confirmación de salida. No hay preview
ni upload de portada. No implementa edición, borrado, búsqueda, detalle,
libros ficticios, autenticación ni estado global. Tampoco hay
SSR, PWA o Docker frontend. Crear otras carpetas compartidas solo cuando existan
necesidades reales.

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
para consultar el catálogo y crear libros; los servicios no deben repartir URLs absolutas por el
código. No hay interceptores ni cliente generado desde OpenAPI.

`proxy.conf.json` reenvía `/api/**` a `http://localhost:8081`, conservando la ruta.
No se modifica el backend ni CORS. Para usar el catálogo y el alta manualmente, arrancar
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
