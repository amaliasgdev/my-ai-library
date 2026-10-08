import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Title } from '@angular/platform-browser';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BooksCatalog } from './features/books/pages/books-catalog/books-catalog';
import { testBookPage } from './features/books/models/book.testing';

describe('Application routes', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((req) => req.url === '/api/books').flush(testBookPage());
    http.verify();
  });

  it('should redirect / to /books', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/', BooksCatalog);
    expect(TestBed.inject(Router).url).toBe('/books');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Mi Biblioteca');
  });

  it('should load the standalone catalog directly and set the document title', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/books', BooksCatalog);
    expect(page).toBeInstanceOf(BooksCatalog);
    expect(TestBed.inject(Title).getTitle()).toBe('Mi Biblioteca');
  });
});
