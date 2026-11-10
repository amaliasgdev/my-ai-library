import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'reading-list',
    title: 'Lista de lectura | Mi Biblioteca',
    loadComponent: () =>
      import('./features/reading-list/reading-list').then((module) => module.ReadingList),
  },
  { path: '', pathMatch: 'full', redirectTo: 'books' },
  {
    path: 'books/photo-import',
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
