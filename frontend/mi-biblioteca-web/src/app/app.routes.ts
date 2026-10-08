import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'books' },
  {
    path: 'books',
    title: 'Mi Biblioteca',
    loadComponent: () =>
      import('./features/books/pages/books-catalog/books-catalog').then(
        (module) => module.BooksCatalog,
      ),
  },
];
