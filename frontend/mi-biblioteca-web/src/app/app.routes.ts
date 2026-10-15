import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'books' },
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
