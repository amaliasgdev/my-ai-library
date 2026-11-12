import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { testBook, testBookPage } from '../../../books/models/book.testing';
import { SagaBookPickerDialog } from './saga-book-picker-dialog';
import { sagaBookPickerDialogConfig } from './saga-book-picker-dialog.helpers';

@Component({ template: '<button type="button">Abrir</button>' })
class Host {}

describe('SagaBookPickerDialog', () => {
  let fixture: ComponentFixture<Host>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    http.verify();
  });

  function open(excluded: readonly number[] = []) {
    const ref = TestBed.inject(MatDialog).open(
      SagaBookPickerDialog,
      sagaBookPickerDialogConfig({
        title: 'Añadir libro de la biblioteca',
        actionLabel: 'Añadir a la saga',
        excludedBookIds: excluded,
      }),
    );
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    return { ref, closed, dialog: ref.componentInstance as SagaBookPickerDialog };
  }

  it('does not search until an explicit valid action', () => {
    const { dialog } = open();
    expect(dialog.searched()).toBe(false);
    dialog.search();
    expect(dialog.criteriaError()).toBe(true);
    http.expectNone((request) => request.url === '/api/books/search');
  });

  it('searches by title, disables books already in the saga and confirms a selection', async () => {
    const { closed, dialog } = open([10]);
    dialog.searchForm.controls.title.setValue('Dune');
    dialog.search();
    const request = http.expectOne((candidate) => candidate.url === '/api/books/search');
    expect(request.request.params.get('title')).toBe('Dune');
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('10');
    expect(request.request.params.get('sortBy')).toBe('title');
    expect(request.request.params.get('direction')).toBe('ASC');
    request.flush(
      testBookPage({
        content: [
          testBook({ id: 10, title: 'Dune', author: 'Frank Herbert' }),
          testBook({ id: 11, title: 'Dune Messiah', author: 'Frank Herbert' }),
        ],
        totalElements: 2,
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    const buttons = document.querySelectorAll<HTMLButtonElement>('.book-result');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[0].textContent).toContain('Ya está en esta saga');
    expect(buttons[1].disabled).toBe(false);
    dialog.select(testBook({ id: 10 }));
    expect(dialog.selected()).toBeNull();
    const selected = dialog.results()!.content[1];
    dialog.select(selected);
    expect(dialog.selected()).toEqual(selected);
    dialog.confirm();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledWith(selected));
  });

  it('does not return a book when cancelled', async () => {
    const { closed, dialog } = open();
    dialog.cancel();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledWith(undefined));
  });

  it('paginates the current search without losing its criteria', () => {
    const { dialog } = open();
    dialog.searchForm.controls.author.setValue('Herbert');
    dialog.search();
    http
      .expectOne((candidate) => candidate.url === '/api/books/search')
      .flush(testBookPage({ totalElements: 25, totalPages: 3 }));
    dialog.onPageChange({ pageIndex: 1, pageSize: 10, length: 25 } as PageEvent);
    const request = http.expectOne((candidate) => candidate.url === '/api/books/search');
    expect(request.request.params.get('author')).toBe('Herbert');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(testBookPage({ page: 1, totalElements: 25, totalPages: 3 }));
  });

  it('shows search errors and retries the current criteria', () => {
    const { dialog } = open();
    dialog.searchForm.controls.title.setValue('Dune');
    dialog.search();
    http
      .expectOne((candidate) => candidate.url === '/api/books/search')
      .flush({ detail: 'SECRET' }, { status: 500, statusText: 'Error' });
    expect(dialog.error()).toBe('El servidor no pudo buscar libros');
    dialog.retry();
    const retry = http.expectOne((candidate) => candidate.url === '/api/books/search');
    expect(retry.request.params.get('title')).toBe('Dune');
    retry.flush(testBookPage());
  });

  it('clears the search without issuing a request', () => {
    const { dialog } = open();
    dialog.searchForm.controls.title.setValue('Dune');
    dialog.clear();
    expect(dialog.searched()).toBe(false);
    expect(dialog.results()).toBeNull();
    expect(dialog.searchForm.controls.title.value).toBe('');
    http.expectNone((request) => request.url === '/api/books/search');
  });
});
