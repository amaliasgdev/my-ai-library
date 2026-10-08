import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Title } from '@angular/platform-browser';
import { routes } from './app.routes';
import { BooksPlaceholder } from './features/books/pages/books-placeholder/books-placeholder';

describe('Application routes', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

  it('should redirect / to /books', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/', BooksPlaceholder);
    expect(TestBed.inject(Router).url).toBe('/books');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Mi Biblioteca');
  });

  it('should load the standalone placeholder directly and set the document title', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/books', BooksPlaceholder);
    expect(page).toBeInstanceOf(BooksPlaceholder);
    expect(TestBed.inject(Title).getTitle()).toBe('Mi Biblioteca');
  });
});
