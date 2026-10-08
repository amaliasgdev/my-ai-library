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
    path: 'books',
    title: 'Mi Biblioteca',
    loadComponent: () =>
      import('./features/books/pages/books-catalog/books-catalog').then(
        (module) => module.BooksCatalog,
      ),
  },
];
