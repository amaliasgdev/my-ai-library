import { Routes } from '@angular/router';
import { photoImportCanDeactivate } from './features/books/pages/book-photo-import/photo-import.guard';

export const routes: Routes = [
  {
    path: 'sagas/new',
    title: 'Crear saga | Mi Biblioteca',
    loadComponent: () =>
      import('./features/sagas/pages/saga-create/saga-create').then((module) => module.SagaCreate),
  },
  {
    path: 'sagas/:id/edit',
    title: 'Editar saga | Mi Biblioteca',
    loadComponent: () =>
      import('./features/sagas/pages/saga-edit/saga-edit').then((module) => module.SagaEdit),
  },
  {
    path: 'sagas/:id',
    title: 'Detalle de la saga | Mi Biblioteca',
    loadComponent: () =>
      import('./features/sagas/pages/saga-detail/saga-detail').then((module) => module.SagaDetail),
  },
  {
    path: 'sagas',
    title: 'Mis sagas | Mi Biblioteca',
    loadComponent: () =>
      import('./features/sagas/pages/sagas-list/sagas-list').then((module) => module.SagasList),
  },
  {
    path: 'reading-list',
    title: 'Lista de lectura | Mi Biblioteca',
    loadComponent: () =>
      import('./features/reading-list/reading-list').then((module) => module.ReadingList),
  },
  { path: '', pathMatch: 'full', redirectTo: 'books' },
  {
    path: 'books/photo-import',
    canDeactivate: [photoImportCanDeactivate],
    title: 'Importar libros desde fotografías | Mi Biblioteca',
    loadComponent: () =>
      import('./features/books/pages/book-photo-import/book-photo-import').then(
        (module) => module.BookPhotoImport,
      ),
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
