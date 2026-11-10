import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import {
  PhotoImportWorkflow,
  emptyPhotoDraft,
  PhotoImportCandidate,
} from './photo-import-workflow';
import { PhotoReadingListWorkflow } from './photo-reading-list-workflow';
import { PhotoReadingListPanel } from './photo-reading-list-panel';

describe('Photo reading-list section', () => {
  it('shows only eligible identities, batch checks explicitly and provides navigation to the list', () => {
    TestBed.configureTestingModule({
      imports: [PhotoReadingListPanel],
      providers: [
        PhotoImportWorkflow,
        PhotoReadingListWorkflow,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const reading = TestBed.inject(PhotoReadingListWorkflow);
    const base: PhotoImportCandidate = {
      id: '1',
      source: 'image.jpg',
      draft: { ...emptyPhotoDraft(), title: 'Real book' },
      request: null,
      state: 'imported',
      selected: false,
      revision: 1,
      duplicates: null,
      approvedMatches: null,
      bookId: 20,
      message: null,
    };
    reading.setCandidates([
      base,
      { ...base, id: '2', bookId: 21, state: 'existing' },
      { ...base, id: '3', bookId: 22, state: 'uncertain' },
    ]);
    const fixture = TestBed.createComponent(PhotoReadingListPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    expect(root.textContent).toContain('Añadir a mi lista de lectura');
    expect(root.textContent).toContain('simulado');
    expect(root.querySelectorAll('article')).toHaveLength(2);
    expect(root.textContent).toContain('Identidad del libro existente pendiente');
    expect(root.querySelector('a[href="/reading-list"]')?.textContent).toContain(
      'Ir a mi lista de lectura',
    );
    http.expectNone(() => true);
    const check = Array.from(root.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Consultar pertenencia por lote'),
    )!;
    check.click();
    fixture.detectChanges();
    expect(root.textContent).toContain('Consultando');
    const request = http.expectOne((r) => r.url.endsWith('/membership'));
    expect(request.request.params.getAll('bookId')).toEqual(['20']);
    request.flush({ revision: '12', items: [{ bookId: 20, included: true, entryId: 101 }] });
    fixture.detectChanges();
    expect(root.textContent).toContain('Ya está en mi lista');
    expect(root.textContent).toContain('Seleccionados para lectura: 0');
    http.expectNone((r) => r.method !== 'GET');
    http.verify();
    fixture.destroy();
  });
  it('does not permit creation or leaving the page while a list confirmation is open', () => {
    const closed = new Subject<boolean>();
    TestBed.configureTestingModule({
      providers: [
        PhotoImportWorkflow,
        PhotoReadingListWorkflow,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => closed, close: () => closed.complete() }) },
        },
      ],
    });
    const reading = TestBed.inject(PhotoReadingListWorkflow);
    const books = TestBed.inject(PhotoImportWorkflow);
    reading.setCandidates([
      {
        id: '1',
        source: 'photo',
        draft: emptyPhotoDraft(),
        request: null,
        state: 'existing',
        selected: false,
        revision: 1,
        duplicates: null,
        approvedMatches: null,
        bookId: 10,
        message: null,
      },
    ]);
    reading.confirmIdentity(10);
    expect(books.locked()).toBe(true);
    expect(books.canLeave()).toBe(false);
    closed.next(false);
    closed.complete();
    expect(books.locked()).toBe(false);
  });
});
