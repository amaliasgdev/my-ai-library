import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { testBookPage } from './features/books/models/book.testing';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the shell and route the root URL to the catalog', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url === '/api/books')
      .flush(testBookPage());
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toBe('Mi Biblioteca');
    expect(compiled.querySelector('nav')?.getAttribute('aria-label')).toBe('Navegación principal');
    expect(compiled.querySelector('a[aria-current="page"]')?.textContent).toContain('Biblioteca');
    expect(compiled.querySelector('main mat-card')).not.toBeNull();
  });
});
