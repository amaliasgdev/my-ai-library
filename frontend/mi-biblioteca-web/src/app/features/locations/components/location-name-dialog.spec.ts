import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LocationNameDialog, LocationNameData } from './location-name-dialog';

describe('explicit location name dialog', () => {
  let http: HttpTestingController;
  const close = vi.fn();
  const ref = { close, disableClose: false };
  function create(data: LocationNameData = { level: 'rooms', title: 'Nueva habitación' }) {
    TestBed.configureTestingModule({
      imports: [LocationNameDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: ref },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LocationNameDialog);
    fixture.detectChanges();
    return fixture;
  }
  beforeEach(() => {
    close.mockClear();
    ref.disableClose = false;
  });
  afterEach(() => http.verify());
  it('creates immediately, guards duplicate writes and cancel during POST, preserves raw validation', () => {
    const fixture = create();
    const dialog = fixture.componentInstance;
    dialog.name.setValue(' Salón ');
    dialog.save();
    dialog.save();
    dialog.cancel();
    expect(close).not.toHaveBeenCalled();
    expect(ref.disableClose).toBe(true);
    const req = http.expectOne('/api/rooms');
    expect(req.request.body).toEqual({ name: ' Salón ' });
    req.flush({ id: 1, name: 'Salón' });
    expect(close).toHaveBeenCalledWith({ id: 1, name: 'Salón' });
  });
  it('rename sends only name and a 409 keeps the draft and dialog open, with safe feedback', () => {
    const fixture = create({
      level: 'bookcases',
      title: 'Renombrar',
      item: { id: 2, name: 'Billy' },
    });
    const dialog = fixture.componentInstance;
    dialog.name.setValue('Another');
    dialog.save();
    const req = http.expectOne('/api/bookcases/2');
    expect(req.request.body).toEqual({ name: 'Another' });
    req.flush({ detail: 'unsafe SQL' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(dialog.name.value).toBe('Another');
    expect(fixture.nativeElement.textContent).toContain('Ya existe ese nombre');
    expect(fixture.nativeElement.textContent).not.toContain('unsafe SQL');
    expect(ref.disableClose).toBe(false);
  });
  it.each(['', '   ', '\u00a0', '\t', 'A\nB', '\u2028', 'x'.repeat(51)])(
    'shelf rejects %j without HTTP/truncation',
    (value) => {
      const fixture = create({ level: 'shelves', parentId: 2, title: 'Nueva balda' });
      const dialog = fixture.componentInstance;
      dialog.name.setValue(value);
      dialog.save();
      expect(dialog.name.value).toBe(value);
      http.expectNone(() => true);
      expect(close).not.toHaveBeenCalled();
    },
  );
  it('cancel never creates', () => {
    const dialog = create().componentInstance;
    dialog.cancel();
    expect(close).toHaveBeenCalledWith();
    http.expectNone(() => true);
  });
});
