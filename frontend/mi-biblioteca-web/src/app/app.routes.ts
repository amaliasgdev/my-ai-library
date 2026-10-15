import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'books' },
  {
    path: 'locations/shelves/:shelfId/inventory',
    title: 'Inventario de balda | Mi Biblioteca',
    loadComponent: () =>
      import('./features/inventory/pages/shelf-inventory/shelf-inventory').then(
        (module) => module.ShelfInventory,
      ),
  },
  {
    path: 'inventory-sessions/:id',
    title: 'Sesión de inventario | Mi Biblioteca',
    loadComponent: () =>
      import('./features/inventory/pages/inventory-session-detail/inventory-session-detail').then(
        (module) => module.InventorySessionDetail,
      ),
  },
  {
    path: 'locations/reconcile',
    title: 'Conciliar ubicaciones | Mi Biblioteca',
    loadComponent: () =>
      import('./features/locations/pages/location-reconciliation/location-reconciliation').then(
        (module) => module.LocationReconciliation,
      ),
  },
  {
    path: 'locations',
    title: 'Ubicaciones | Mi Biblioteca',
    loadComponent: () =>
      import('./features/locations/pages/locations').then((module) => module.Locations),
  },
  {
    path: 'books/import',
    title: 'Importar ISBN | Mi Biblioteca',
    loadComponent: () =>
      import('./features/books/pages/book-import/book-import').then((module) => module.BookImport),
  },
  {
    path: 'books/new',
    title: 'Añadir libro | Mi Biblioteca',
    loadComponent: () =>
      import('./features/books/pages/book-create/book-create').then((module) => module.BookCreate),
  },
  {
    path: 'books/:id/edit',
    title: 'Editar libro | Mi Biblioteca',
    loadComponent: () =>
      import('./features/books/pages/book-edit/book-edit').then((module) => module.BookEdit),
  },
  {
    path: 'books/:id',
    title: 'Detalle del libro | Mi Biblioteca',
    loadComponent: () =>
      import('./features/books/pages/book-detail/book-detail').then((module) => module.BookDetail),
  },
  {
    path: 'books',
    title: 'Mi Biblioteca',
    loadComponent: () =>
      import('./features/books/pages/books-catalog/books-catalog').then(
        (module) => module.BooksCatalog,
      ),
  },
];
