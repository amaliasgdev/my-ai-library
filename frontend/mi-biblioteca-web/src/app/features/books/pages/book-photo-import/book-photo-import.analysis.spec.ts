import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { PhotoRecognitionResponse } from '../../models/book-photo-import.models';
import { testPhotoCapabilities, testPhotoResult } from '../../models/book-photo-import.testing';
import { BookPhotoImportService } from '../../services/book-photo-import.service';
import { BookPhotoImport } from './book-photo-import';

describe('BookPhotoImport simulated sequential analysis', () => {
  let fixture: ComponentFixture<BookPhotoImport>;
  let page: BookPhotoImport;
  let http: HttpTestingController;
  let root: HTMLElement;
  const url = '/api/book-photo-import/recognize';
  const capabilitiesUrl = '/api/book-photo-import/capabilities';
  const simulated = testPhotoCapabilities({
    enabled: true,
    mode: 'SIMULATED',
    provider: 'mock',
    simulated: true,
  });

  beforeEach(() => {
    let next = 0;
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => `blob:photo-${++next}`),
        revokeObjectURL: vi.fn(),
      }),
    );
    TestBed.configureTestingModule({
      imports: [BookPhotoImport],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BookPhotoImport);
    page = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function select(count = 2): File[] {
    const files = Array.from(
      { length: count },
      (_, i) => new File(['image'], `${i + 1}.jpg`, { type: 'image/jpeg' }),
    );
    const input = root.querySelector('input[multiple]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    return files;
  }

  function enable(): void {
    http.expectOne(capabilitiesUrl).flush(simulated);
    fixture.detectChanges();
  }

  function enableOpenai(): void {
    http
      .expectOne(capabilitiesUrl)
      .flush({ ...simulated, mode: 'REAL', provider: 'openai', simulated: false });
    fixture.detectChanges();
  }
  const realResult = () => ({
    ...testPhotoResult('Libro leído'),
    provider: 'openai',
    simulated: false,
  });

  it('shows real-provider privacy and cost and sends only after authorization plus analysis action', () => {
    enableOpenai();
    select(2);
    expect(page.available()).toBe(true);
    expect(root.textContent).toContain(
      'Las fotografías se enviarán a OpenAI para identificar los libros. El análisis puede generar un coste de API',
    );
    expect(root.textContent).not.toContain('MODO SIMULADO');
    page.analyze();
    http.expectNone(url);
    const consent = root.querySelector('mat-checkbox input') as HTMLInputElement;
    consent.click();
    fixture.detectChanges();
    http.expectNone(url);
    expect(page.canAnalyze()).toBe(true);
    page.analyze();
    expect(page.openaiConsent()).toBe(false);
    http.expectOne(url).flush(realResult());
    http.expectOne(url).flush(realResult());
    fixture.detectChanges();
    expect(page.photos().every((p) => p.analysis === 'success')).toBe(true);
    expect(root.textContent).toContain('Reconocimiento mediante OpenAI');
    expect(root.textContent).not.toContain('El reconocimiento es simulado');
    expect(root.textContent).not.toContain('sigue siendo simulado');
    http.expectNone((r) => r.url === '/api/books' || r.url === '/api/reading-list/items');
  });

  it('requires renewed consent for manual OpenAI retries after timeout and never retries automatically', () => {
    enableOpenai();
    select(1);
    page.openaiConsent.set(true);
    page.analyze();
    http.expectOne(url).flush({ detail: 'PRIVATE' }, { status: 504, statusText: 'Timeout' });
    expect(page.photos()[0].analysis).toBe('error');
    page.retryPhoto(page.photos()[0].id);
    http.expectNone(url);
    page.openaiConsent.set(true);
    page.retryPhoto(page.photos()[0].id);
    http.expectOne(url).flush(realResult());
    expect(page.openaiConsent()).toBe(false);
  });

  it.each([
    'PHOTO_CREDENTIALS',
    'PHOTO_QUOTA',
    'PHOTO_RATE_LIMIT',
    'PHOTO_PROVIDER_CONFIGURATION',
    'PHOTO_PROVIDER_REFUSED',
    'PHOTO_PROVIDER_INCOMPLETE',
  ])(
    'uses a safe message for real-provider code %s without displaying provider details',
    (code) => {
      enableOpenai();
      select(1);
      page.openaiConsent.set(true);
      page.analyze();
      http
        .expectOne(url)
        .flush(
          { code, detail: 'SECRET PRIVATE UPSTREAM BODY' },
          { status: 502, statusText: 'Provider failure' },
        );
      fixture.detectChanges();
      expect(page.photos()[0].analysis).toBe('error');
      expect(page.photos()[0].message).toContain('OpenAI');
      expect(root.textContent).not.toContain('SECRET');
      http.expectNone(url);
    },
  );

  it('cancels real-provider queues and ignores late responses without another paid request', () => {
    enableOpenai();
    select(2);
    const late = new Subject<PhotoRecognitionResponse>();
    const recognize = vi
      .spyOn(TestBed.inject(BookPhotoImportService), 'recognize')
      .mockReturnValue(late);
    page.openaiConsent.set(true);
    page.analyze();
    page.cancelAnalysis();
    late.next(realResult());
    late.complete();
    expect(page.photos().every((p) => p.result === null && p.analysis === 'cancelled')).toBe(true);
    page.analyze();
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it('rejects mock results from a real provider and clears authorization after changing photos', () => {
    enableOpenai();
    select(1);
    page.openaiConsent.set(true);
    page.rotatePhoto(page.photos()[0].id);
    expect(page.openaiConsent()).toBe(false);
    page.analyze();
    http.expectNone(url);
    page.openaiConsent.set(true);
    page.analyze();
    http.expectOne(url).flush(testPhotoResult());
    expect(page.photos()[0].analysis).toBe('error');
  });

  it('does not upload images while capabilities are pending or disabled', () => {
    select();
    page.analyze();
    expect(page.canAnalyze()).toBe(false);
    http.expectNone(url);
    http.expectOne(capabilitiesUrl).flush(testPhotoCapabilities());
    page.analyze();
    http.expectNone(url);
    expect(page.photos()).toHaveLength(2);
  });

  it('fails closed on availability errors and retries only the capabilities GET explicitly', () => {
    select(1);
    http.expectOne(capabilitiesUrl).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(root.textContent).toContain('No se pudo consultar la disponibilidad');
    expect(page.canAnalyze()).toBe(false);
    http.expectNone(url);
    page.loadCapabilities();
    enable();
    expect(page.canAnalyze()).toBe(true);
  });

  it('requires explicit simulated mode, provider and enabled flag', () => {
    http.expectOne(capabilitiesUrl).flush({ ...simulated, simulated: false });
    select(1);
    expect(page.canAnalyze()).toBe(false);
    page.capabilities.set({ ...simulated, provider: 'unknown' });
    expect(page.canAnalyze()).toBe(false);
    page.capabilities.set({ ...simulated, enabled: false });
    expect(page.canAnalyze()).toBe(false);
    http.expectNone(url);
  });

  it('processes photos sequentially with original bytes, distinct rotation, progress and associated results', () => {
    enable();
    const files = select();
    page.rotatePhoto(page.photos()[1].id);
    page.analyze();
    expect(page.photos().map((p) => p.analysis)).toEqual(['analyzing', 'queued']);
    expect(page.analyzing()).toBe(true);
    const first = http.expectOne(url);
    expect(first.request.body.get('file')).toBe(files[0]);
    expect(first.request.body.get('rotation')).toBe('0');
    page.analyze(); // No duplicate queue or request.
    http.expectNone(url);
    first.flush(testPhotoResult('Ejemplo uno'));
    expect(page.analysisCompleted()).toBe(1);
    const second = http.expectOne(url);
    expect(second.request.body.get('file')).toBe(files[1]);
    expect(second.request.body.get('rotation')).toBe('90');
    second.flush(testPhotoResult('Ejemplo dos'));
    fixture.detectChanges();
    expect(page.analyzing()).toBe(false);
    expect(page.analysisCompleted()).toBe(2);
    expect(page.photos().map((p) => p.result?.observations[0].title)).toEqual([
      'Ejemplo uno',
      'Ejemplo dos',
    ]);
    const cards = root.querySelectorAll('app-photo-candidate-card');
    expect(cards[0].closest('section')?.getAttribute('aria-label')).toContain('1.jpg');
    expect(cards[0].textContent).toContain('Ejemplo uno');
    expect(cards[1].closest('section')?.getAttribute('aria-label')).toContain('2.jpg');
    expect(cards[1].textContent).toContain('Ejemplo dos');
    expect(root.textContent).toContain('MODO SIMULADO');
    expect(root.textContent).toContain('no corresponde a esta fotografía');
    expect(root.textContent).toContain('No visible');
    expect(root.textContent).toContain('Clara');
    expect(root.textContent).toContain('2 de 2 análisis finalizados');
    expect(page.canAnalyze()).toBe(false);
  });

  it('blocks changing, removing or adding photographs while analysis is pending', () => {
    enable();
    select(1);
    page.analyze();
    const id = page.photos()[0].id;
    page.removePhoto(id);
    page.rotatePhoto(id);
    select(2);
    expect(page.photos()).toHaveLength(1);
    expect(page.photos()[0].rotationDegrees).toBe(0);
    http.expectOne(url).flush(testPhotoResult());
  });

  it('continues after partial errors and retries only the failed photo on explicit action', () => {
    enable();
    select();
    page.analyze();
    http.expectOne(url).flush({}, { status: 504, statusText: 'Timeout' });
    http.expectOne(url).flush(testPhotoResult());
    expect(page.photos().map((p) => p.analysis)).toEqual(['error', 'success']);
    expect(page.photos()[0].message).toContain('No se ha reintentado');
    http.expectNone(url);
    page.retryPhoto(page.photos()[0].id);
    http.expectOne(url).flush(testPhotoResult('Reintento explícito'));
    expect(page.photos().map((p) => p.analysis)).toEqual(['success', 'success']);
    expect(page.photos()[1].result?.observations[0].title).toBe('Dune');
  });

  it.each([400, 413, 415, 429, 502, 503, 504, 0])(
    'shows a safe per-photo error for status %s without automatic retry',
    (status) => {
      enable();
      select(1);
      page.analyze();
      const req = http.expectOne(url);
      if (status === 0) req.error(new ProgressEvent('error'));
      else req.flush({ detail: 'SECRET INTERNAL ERROR' }, { status, statusText: 'Failure' });
      fixture.detectChanges();
      expect(page.photos()[0].analysis).toBe('error');
      expect(root.textContent).not.toContain('SECRET');
      http.expectNone(url);
    },
  );

  it('cancels the active request and queue, preserves photos and never automatically resumes', () => {
    enable();
    select(3);
    page.analyze();
    const first = http.expectOne(url);
    page.cancelAnalysis();
    expect(first.cancelled).toBe(true);
    expect(page.photos().map((p) => p.analysis)).toEqual(['cancelled', 'cancelled', 'cancelled']);
    expect(page.analyzing()).toBe(false);
    expect(page.photos()).toHaveLength(3);
    http.expectNone(url);
    page.retryPhoto(page.photos()[1].id);
    http.expectOne(url).flush(testPhotoResult());
    expect(page.photos().map((p) => p.analysis)).toEqual(['cancelled', 'success', 'cancelled']);
    http.expectNone(url);
  });

  it('ignores late results from a cancelled generation without replacing a newer result', () => {
    enable();
    select(1);
    const oldResult = new Subject<PhotoRecognitionResponse>();
    const newResult = new Subject<PhotoRecognitionResponse>();
    vi.spyOn(TestBed.inject(BookPhotoImportService), 'recognize')
      .mockReturnValueOnce(oldResult)
      .mockReturnValueOnce(newResult);
    page.analyze();
    page.cancelAnalysis();
    page.analyze();
    newResult.next(testPhotoResult('Nuevo'));
    newResult.complete();
    oldResult.next(testPhotoResult('Antiguo'));
    oldResult.complete();
    expect(page.photos()[0].result?.observations[0].title).toBe('Nuevo');
    expect(page.analysisCompleted()).toBe(1);
  });

  it('retains successful results when cancelling the remaining queue', () => {
    enable();
    select(3);
    page.analyze();
    http.expectOne(url).flush(testPhotoResult());
    const second = http.expectOne(url);
    page.cancelAnalysis();
    expect(second.cancelled).toBe(true);
    expect(page.photos().map((p) => p.analysis)).toEqual(['success', 'cancelled', 'cancelled']);
  });

  it('invalidates old results on rotation and releases them with removed photos', () => {
    enable();
    select(1);
    page.analyze();
    http.expectOne(url).flush(testPhotoResult());
    const id = page.photos()[0].id;
    page.rotatePhoto(id);
    expect(page.photos()[0].result).toBeNull();
    expect(page.photos()[0].analysis).toBe('idle');
    page.removePhoto(id);
    expect(page.photos()).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
  });

  it('cancels active analysis on destruction without dispatching the next image', () => {
    enable();
    select(2);
    page.analyze();
    const req = http.expectOne(url);
    fixture.destroy();
    expect(req.cancelled).toBe(true);
    http.expectNone(url);
    expect(page.photos()).toEqual([]);
  });

  it('rejects mismatched non-simulated responses and reports incomplete or empty simulated results', () => {
    enable();
    select(1);
    page.analyze();
    http.expectOne(url).flush({ ...testPhotoResult(), simulated: false });
    expect(page.photos()[0].analysis).toBe('error');
    page.retryPhoto(page.photos()[0].id);
    http.expectOne(url).flush({ ...testPhotoResult(), observations: [], incomplete: true });
    fixture.detectChanges();
    expect(root.textContent).toContain('Resultado incompleto');
    expect(root.textContent).toContain('Sin observaciones');
  });

  it('checks lower server limits before sending an already selected photo', () => {
    select(1);
    http.expectOne(capabilitiesUrl).flush({ ...simulated, maxFileBytes: 1 });
    page.analyze();
    expect(page.photos()[0].analysis).toBe('error');
    http.expectNone(url);
  });
});
