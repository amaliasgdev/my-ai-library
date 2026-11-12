import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { completeMembershipQueries } from '../../../reading-list/reading-list-membership.testing';
import { testBook } from '../../models/book.testing';
import { BookSagaMembership } from '../../../sagas/models/saga.models';
import { testBookSagaMembership } from '../../../sagas/models/saga.testing';
import { BookDetail } from './book-detail';

describe('BookDetail saga membership', () => {
  let fixture: ComponentFixture<BookDetail>;
  let page: BookDetail;
  let element: HTMLElement;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ id: '42' }));
    TestBed.configureTestingModule({
      imports: [BookDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params.asObservable(),
            queryParamMap: of(convertToParamMap({})),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BookDetail);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    completeMembershipQueries(http);
    http.verify();
  });

  function load(memberships: BookSagaMembership[]): void {
    http.expectOne('/api/books/42').flush(testBook({ id: 42 }));
    http.expectOne('/api/books/42/sagas').flush(memberships);
    fixture.detectChanges();
  }

  it('does not render an empty section when the book has no sagas', () => {
    load([]);
    expect(element.querySelector('h1')?.textContent).toBe('Libro de prueba');
    expect(element.querySelector('#book-sagas-heading')).toBeNull();
    expect(element.textContent).not.toContain('Sagas');
  });

  it('renders one membership with name, label, position and a link', () => {
    load([testBookSagaMembership()]);
    const section = element.querySelector('section[aria-labelledby="book-sagas-heading"]')!;
    expect(section.textContent).toContain('Sagas');
    expect(section.textContent).toContain('Nacidos de la bruma');
    expect(section.textContent).toContain('Etiqueta: 3');
    expect(section.textContent).toContain('Posición: 3');
    const link = section.querySelector<HTMLAnchorElement>('a')!;
    expect(link.getAttribute('href')).toBe('/sagas/4');
    expect(link.getAttribute('aria-label')).toBe('Ver saga Nacidos de la bruma');
  });

  it('renders every saga when the book belongs to several', () => {
    load([
      testBookSagaMembership({ sagaId: 4, sagaName: 'Nacidos de la bruma' }),
      testBookSagaMembership({
        sagaId: 8,
        sagaName: 'Cosmere',
        position: 1,
        volumeLabel: null,
      }),
    ]);
    const links = Array.from(
      element.querySelectorAll<HTMLAnchorElement>(
        'section[aria-labelledby="book-sagas-heading"] a',
      ),
    );
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Nacidos de la bruma',
      'Cosmere',
    ]);
    expect(links[1].getAttribute('href')).toBe('/sagas/8');
    expect(element.textContent).toContain('Posición: 1');
  });

  it('keeps the book usable when membership fails and retries only that request', () => {
    http.expectOne('/api/books/42').flush(testBook({ id: 42 }));
    http
      .expectOne('/api/books/42/sagas')
      .flush({ detail: 'SECRET' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(element.querySelector('h1')?.textContent).toBe('Libro de prueba');
    expect(element.textContent).toContain('El servidor no pudo cargar las sagas del libro');
    const retry = element.querySelector<HTMLButtonElement>('.feedback-action')!;
    expect(retry.textContent?.trim()).toBe('Reintentar');
    retry.click();
    const request = http.expectOne('/api/books/42/sagas');
    expect(request.request.method).toBe('GET');
    request.flush([testBookSagaMembership()]);
    fixture.detectChanges();
    expect(element.textContent).toContain('Nacidos de la bruma');
    http.expectNone('/api/books/42');
  });

  it('keeps read-only saga loading independent from the book response', () => {
    load([testBookSagaMembership()]);
    expect(page.state().status).toBe('loaded');
    expect(page.sagasState()).toBe('loaded');
    expect(page.sagas()).toHaveLength(1);
    expect(page.sagasError()).toBeNull();
  });
});
