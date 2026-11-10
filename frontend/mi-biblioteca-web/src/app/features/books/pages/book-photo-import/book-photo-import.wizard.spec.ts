import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestKey } from '@angular/cdk/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatStepperHarness } from '@angular/material/stepper/testing';
import { provideRouter } from '@angular/router';
import { PhotoMetadataCandidate } from '../../components/photo-metadata-candidate/photo-metadata-candidate';
import { testPhotoCapabilities, testPhotoResult } from '../../models/book-photo-import.testing';
import { BookPhotoImport } from './book-photo-import';
import { batchDuplicateIds, PhotoCandidateCard } from './photo-candidate-card';
import { emptyPhotoDraft, PhotoImportCandidate } from './photo-import-workflow';

describe('Photo import four-step wizard', () => {
  let fixture: ComponentFixture<BookPhotoImport>;
  let page: BookPhotoImport;
  let http: HttpTestingController;
  const recognition = '/api/book-photo-import/recognize';
  const duplicates = { matches: [], truncated: false, similarityChecked: true };

  beforeEach(() => {
    let id = 0;
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => `blob:${++id}`),
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
    fixture.detectChanges();
    http.expectOne('/api/book-photo-import/capabilities').flush(
      testPhotoCapabilities({
        enabled: true,
        mode: 'SIMULATED',
        provider: 'mock',
        simulated: true,
      }),
    );
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.unstubAllGlobals();
  });

  function analyze(count = 1) {
    const input = fixture.nativeElement.querySelector('input[multiple]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: Array.from(
        { length: count },
        (_, i) => new File(['pixels'], `shelf-${i}.png`, { type: 'image/png' }),
      ),
    });
    input.dispatchEvent(new Event('change'));
    page.analyze();
    const base = testPhotoResult('El último donjuán');
    const observation = { ...base.observations[0], author: 'Autor visible' };
    for (let i = 0; i < count; i++)
      http.expectOne(recognition).flush({
        ...base,
        incomplete: true,
        observations: [
          observation,
          { ...observation, id: 'second' },
          {
            ...observation,
            id: 'unknown',
            title: null,
            author: null,
            visibleText: null,
            legibility: 'ILLEGIBLE',
          },
        ],
      });
    fixture.detectChanges();
  }

  it('uses four accessible Material steps and advances after analysis without another request', async () => {
    const wizard = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    expect((await wizard.getSteps()).length).toBe(4);
    analyze();
    expect(page.step()).toBe(1);
    expect(await (await wizard.getSteps())[1].isSelected()).toBe(true);
    for (const label of ['Fotografías', 'Revisión', 'Importación', 'Resultados']) {
      await wizard.selectStep({ label });
    }
    expect(page.photos()).toHaveLength(1);
    expect(page.workflow.rows()).toHaveLength(3);
    expect(page.analysisCompleted()).toBe(1);
    http.expectNone(() => true);
  });

  it('keeps stable editors, independent drafts and an in-flight bibliography request across steps', () => {
    analyze();
    const editorElement = fixture.debugElement.queryAll(By.directive(PhotoMetadataCandidate))[0];
    const editor = editorElement.componentInstance as PhotoMetadataCandidate;
    page.openCandidate(page.workflow.rows()[0].id);
    editor.form.controls.title.setValue('Texto corregido');
    editor.searchText();
    const request = http.expectOne((r) => r.url.endsWith('/metadata-search'));
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    page.goToStep(0);
    fixture.detectChanges();
    page.goToStep(3);
    fixture.detectChanges();
    page.goToStep(2);
    fixture.detectChanges();
    expect(request.cancelled).toBe(false);
    expect(
      fixture.debugElement.queryAll(By.directive(PhotoMetadataCandidate))[0].componentInstance,
    ).toBe(editor);
    expect(editor.form.controls.title.value).toBe('Texto corregido');
    expect(page.workflow.rows()[1].draft.title).toBe('El último donjuán');
    request.flush({ content: [], truncated: false });
    expect(editor.works()?.content).toEqual([]);
    expect(editor.selected()).toBeNull();
    http.expectNone(() => true);
  });

  it('groups cards by photograph, keeps incomplete observations and warns without merging copies', () => {
    analyze(2);
    expect(page.resultGroups().groups.map((g) => g.candidates.length)).toEqual([3, 3]);
    expect(page.workflow.rows()).toHaveLength(6);
    expect(page.batchDuplicates().size).toBe(4);
    expect(page.candidateSummary()).toEqual({ total: 6, pending: 6, reviewed: 0, duplicates: 4 });
    const cards = fixture.debugElement.queryAll(By.directive(PhotoCandidateCard));
    expect(cards).toHaveLength(6);
    expect(cards[2].nativeElement.textContent).toContain('Identificación pendiente');
    expect(fixture.nativeElement.textContent).toContain('Resultado incompleto');
    expect(page.workflow.rows().every((r) => !r.selected && r.state === 'pending')).toBe(true);
    http.expectNone((r) => r.method !== 'GET');
  });

  it('opens only one editor at a time and navigates to the next pending candidate', () => {
    analyze();
    const ids = page.workflow.rows().map((row) => row.id);
    const card = fixture.debugElement.queryAll(By.directive(PhotoCandidateCard))[0]
      .componentInstance as PhotoCandidateCard;
    card.review.emit(ids[0]);
    fixture.detectChanges();
    expect(page.step()).toBe(2);
    const editors = fixture.debugElement.queryAll(By.directive(PhotoMetadataCandidate));
    expect(
      editors.map((editor) => (editor.nativeElement.parentElement as HTMLElement).hidden),
    ).toEqual([false, true, true]);
    page.workflow.discard(ids[1]);
    page.nextCandidate();
    fixture.detectChanges();
    expect(page.activeCandidate()).toBe(ids[2]);
    expect(page.workflow.rows()[1].state).toBe('discarded');
    http.expectNone(() => true);
  });

  it('never restarts cancelled recognition or uncertain writes while navigating', () => {
    const input = fixture.nativeElement.querySelector('input[multiple]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['pixels'], 'one.png', { type: 'image/png' })],
    });
    input.dispatchEvent(new Event('change'));
    page.analyze();
    const request = http.expectOne(recognition);
    page.goToStep(1);
    page.goToStep(0);
    page.cancelAnalysis();
    expect(request.cancelled).toBe(true);
    page.workflow.source('manual:1', 'Manual', emptyPhotoDraft());
    page.workflow.rows.update((rows) =>
      rows.map((r) => ({ ...r, state: 'uncertain', selected: false })),
    );
    for (const step of [1, 2, 3, 0]) page.goToStep(step);
    expect(page.workflow.rows()[0].state).toBe('uncertain');
    expect(page.photos()[0].analysis).toBe('cancelled');
    http.expectNone(() => true);
  });

  it('allows keyboard activation of step headers without sending HTTP', async () => {
    const wizard = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    const steps = await wizard.getSteps();
    const header = await steps[0].host();
    await header.focus();
    await header.sendKeys(TestKey.DOWN_ARROW, TestKey.ENTER);
    expect(await steps[1].isSelected()).toBe(true);
    expect(page.step()).toBe(1);
    http.expectNone(() => true);
  });

  it('keeps confirmed corrections and selection when browsing without reopening review', () => {
    analyze();
    page.workflow.rows.update((rows) =>
      rows.map((r, i) =>
        i
          ? r
          : {
              ...r,
              state: 'ready',
              selected: true,
              draft: {
                ...r.draft,
                title: 'Corrección confirmada',
                coverUrl: 'https://example.test/cover.png',
              },
            },
      ),
    );
    const before = structuredClone(page.workflow.rows()[0]);
    for (const step of [2, 0, 3, 1]) {
      page.goToStep(step);
      fixture.detectChanges();
    }
    expect(page.workflow.rows()[0]).toEqual(before);
    expect(page.workflow.selectedCount()).toBe(1);
    expect(
      fixture.debugElement
        .queryAll(By.directive(PhotoCandidateCard))[0]
        .nativeElement.querySelector('img')
        .getAttribute('src'),
    ).toBe('https://example.test/cover.png');
    const card = fixture.debugElement.queryAll(By.directive(PhotoCandidateCard))[0]
      .nativeElement as HTMLElement;
    card.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain('Sin portada');
    expect(page.workflow.rows()[0].draft.coverUrl).toBe('https://example.test/cover.png');
    http.expectNone(() => true);
  });
});

describe('batch duplicate advisory', () => {
  const row = (id: string, title: string, author: string): PhotoImportCandidate => ({
    id,
    source: 'Photo',
    draft: { ...emptyPhotoDraft(), title, author },
    state: 'pending',
    request: null,
    selected: false,
    revision: 0,
    duplicates: null,
    approvedMatches: null,
    bookId: null,
    message: null,
  });
  it('compares complete title/author case and whitespace without fuzzy guesses or removing rows', () => {
    const rows = [
      row('1', ' El último  donjuán ', 'Autor'),
      row('2', 'el último donjuán', ' AUTOR '),
      row('3', 'el ultimo donjuan', 'Autor'),
      row('4', 'El último donjuán', ''),
      row('5', '', ''),
    ];
    expect([...batchDuplicateIds(rows)]).toEqual(['1', '2']);
    expect(rows).toHaveLength(5);
    expect(
      batchDuplicateIds(rows.map((r) => (r.id === '2' ? { ...r, state: 'discarded' } : r))).size,
    ).toBe(0);
  });
});
