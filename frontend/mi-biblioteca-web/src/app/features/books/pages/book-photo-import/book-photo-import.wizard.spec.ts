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

  it('resolves a batch sequentially, retains partial results, skips current searches and never writes', async () => {
    analyze();
    page.searchAllMetadata();
    expect(page.batchTotal()).toBe(2);
    expect(page.batchSearching()).toBe(true);
    const first = http.expectOne((r) => r.url.endsWith('/metadata-search'));
    expect(first.request.params.get('smart')).toBe('true');
    expect(first.request.params.get('language')).toBe('es');
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    first.flush({
      content: [
        {
          workKey: '/works/OL1W',
          title: 'Obra propuesta',
          authors: ['Autor'],
          coverUrl: 'https://example.org/cover.jpg',
          editionCount: 400,
        },
      ],
      truncated: false,
    });
    await Promise.resolve();
    expect(page.batchCompleted()).toBe(1);
    const second = http.expectOne((r) => r.url.endsWith('/metadata-search'));
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    second.flush({}, { status: 503, statusText: 'Unavailable' });
    await Promise.resolve();
    expect(page.batchSearching()).toBe(false);
    expect(page.batchCompleted()).toBe(2);
    expect(page.metadataEditors()[0].works()?.content).toHaveLength(1);
    expect(page.metadataEditors()[1].resolutionStatus()).toBe('Error');
    expect(page.workflow.rows()[0].draft.title).toBe('El último donjuán');
    expect(page.workflow.rows().every((row) => !row.selected && !row.request)).toBe(true);
    page.searchAllMetadata();
    expect(page.batchTotal()).toBe(1);
    const retry = http.expectOne((r) => r.url.endsWith('/metadata-search'));
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    retry.flush({ content: [], truncated: false });
    await Promise.resolve();
    page.searchAllMetadata();
    expect(page.batchTotal()).toBe(0);
    http.expectNone(() => true);
  });

  it('stops the metadata queue without discarding previous matches or issuing queued requests', async () => {
    analyze();
    page.searchAllMetadata();
    const active = http.expectOne((r) => r.url.endsWith('/metadata-search'));
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    page.goToStep(0);
    fixture.detectChanges();
    expect(active.cancelled).toBe(false);
    page.stopMetadataBatch();
    expect(active.cancelled).toBe(true);
    await Promise.resolve();
    expect(page.batchSearching()).toBe(false);
    expect(page.metadataEditors()[1].searched()).toBe(false);
    http.expectNone(() => true);
  });

  it('can stop between rows and preserves found works without selecting an edition', async () => {
    analyze();
    page.searchAllMetadata();
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    http
      .expectOne((r) => r.url.endsWith('/metadata-search'))
      .flush({
        content: [{ workKey: '/works/OL1W', title: 'Obra', authors: [], coverUrl: null }],
        truncated: false,
      });
    page.stopMetadataBatch();
    await Promise.resolve();
    expect(page.metadataEditors()[0].works()?.content).toHaveLength(1);
    expect(page.metadataEditors()[0].selectedEdition()).toBeNull();
    expect(page.batchCompleted()).toBe(1);
    http.expectNone(() => true);
  });

  it('does not overlap an individual search or search discarded and confirmed rows', () => {
    analyze();
    const editor = page.metadataEditors()[0];
    editor.searchText();
    const active = http.expectOne((r) => r.url.endsWith('/metadata-search'));
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    page.searchAllMetadata();
    expect(page.batchSearching()).toBe(false);
    active.flush({ content: [], truncated: false });
    page.workflow.discard(page.workflow.rows()[1].id);
    editor.lastSearchKey.set(null);
    page.workflow.rows.update((rows) =>
      rows.map((row, index) => (index === 0 ? { ...row, state: 'ready' } : row)),
    );
    page.searchAllMetadata();
    expect(page.batchTotal()).toBe(0);
    http.expectNone(() => true);
  });

  it('searches again only after query or language changes, preserving the evidence', async () => {
    analyze();
    page.searchAllMetadata();
    for (let i = 0; i < 2; i++) {
      http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
      http
        .expectOne((r) => r.url.endsWith('/metadata-search'))
        .flush({ content: [], truncated: false });
      await Promise.resolve();
    }
    page.preferredLanguage.set('en');
    fixture.detectChanges();
    expect(page.metadataEditors()[0].needsSearch()).toBe(true);
    expect(page.photos()[0].result?.observations[0].title).toBe('El último donjuán');
    expect(page.metadataEditors()[0].form.controls.title.value).toBe('El último donjuán');
    http.expectNone(() => true);
  });

  async function batchSearch(first: Record<string, unknown>) {
    page.searchAllMetadata();
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    http.expectOne((r) => r.url.endsWith('/metadata-search')).flush(first);
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    http
      .expectOne((r) => r.url.endsWith('/metadata-search'))
      .flush({ content: [], truncated: false, resolution: 'NONE' });
    await Promise.resolve();
    fixture.detectChanges();
  }
  const work = (key: string, title: string, cover: string, matchKind = 'APPROXIMATE') => ({
    workKey: key,
    title,
    authors: ['J. K. Rowling'],
    coverUrl: cover,
    firstPublicationYear: 1998,
    editionCount: 400,
    matchKind,
  });

  it('shows no first-result cover for ambiguous matches, keeps them and allows an explicit choice', async () => {
    analyze();
    const stone = work(
      '/works/OL82563W',
      "Harry Potter and the Philosopher's Stone",
      'https://c/a.jpg',
    );
    const chamber = work(
      '/works/OL82537W',
      'Harry Potter and the Chamber of Secrets',
      'https://c/b.jpg',
    );
    await batchSearch({ content: [stone, chamber], truncated: false, resolution: 'AMBIGUOUS' });
    const editor = page.metadataEditors()[0];
    expect(editor.resolutionStatus()).toBe('Varias coincidencias — requiere revisión');
    expect(editor.proposedCover()).toBeNull();
    expect(editor.proposalLabel()).toBe('');
    expect(editor.works()?.content).toHaveLength(2);
    const card = fixture.debugElement.queryAll(By.directive(PhotoCandidateCard))[0].nativeElement;
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain('Sin portada');
    expect(card.textContent).toContain('Varias coincidencias — requiere revisión');
    expect(page.workflow.rows()[0].draft.title).toBe('El último donjuán');
    expect(page.workflow.rows()[0].draft.coverUrl).toBe('');
    editor.chooseWork(chamber as never);
    http
      .expectOne((r) => r.url.endsWith('/metadata-editions'))
      .flush({
        workKey: chamber.workKey,
        page: 0,
        content: [],
        hasNext: false,
      });
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    fixture.detectChanges();
    expect(editor.proposedCover()).toBe('https://c/b.jpg');
    expect(editor.works()?.content).toHaveLength(2);
    expect(page.workflow.rows()[0].state).toBe('pending');
    expect(page.workflow.rows().every((row) => !row.request && !row.selected)).toBe(true);
  });

  it('does not use the first cover for one approximate match and marks the review explicitly', async () => {
    analyze();
    await batchSearch({
      content: [work('/works/OL1W', 'Harry Potter', 'https://c/a.jpg')],
      truncated: false,
      resolution: 'AMBIGUOUS',
    });
    const editor = page.metadataEditors()[0];
    expect(editor.resolutionStatus()).toBe('Coincidencia aproximada — requiere revisión');
    expect(editor.proposedCover()).toBeNull();
  });

  it('proposes the clearly supported work cover, labelled as an unconfirmed work', async () => {
    analyze();
    const stone = work('/works/OL82563W', 'Stone', 'https://c/a.jpg');
    const chamber = work('/works/OL82537W', 'Chamber', 'https://c/b.jpg', 'EXACT_EDITION_TITLE');
    await batchSearch({ content: [chamber, stone], truncated: false, resolution: 'CLEAR' });
    const editor = page.metadataEditors()[0];
    expect(editor.resolutionStatus()).toBe('Coincidencia encontrada · obra propuesta');
    expect(editor.proposedCover()).toBe('https://c/b.jpg');
    expect(editor.proposalLabel()).toContain('/works/OL82537W');
    const card = fixture.debugElement.queryAll(By.directive(PhotoCandidateCard))[0].nativeElement;
    expect(card.querySelector('img')?.getAttribute('src')).toBe('https://c/b.jpg');
    expect(card.textContent).toContain('Obra propuesta · sin confirmar');
    expect(page.workflow.rows()[0].draft.title).toBe('El último donjuán');
    expect(page.workflow.rows()[0].draft.coverUrl).toBe('');
  });

  it('keeps the legacy response without a resolution conservative and manual data selectable', async () => {
    analyze();
    await batchSearch({
      content: [work('/works/OL1W', 'A', 'https://c/a.jpg', 'EXACT_TEXT')],
      truncated: false,
    });
    const editor = page.metadataEditors()[0];
    expect(editor.proposedCover()).toBeNull();
    editor.useManual();
    expect(editor.manual()).toBe(true);
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
  });

  it('queries editions globally only on explicit filter submit and retains draft filters across steps', () => {
    analyze();
    const editor = page.metadataEditors()[0];
    editor.chooseWork({
      workKey: '/works/OL1W',
      title: 'Title',
      authors: [],
      coverUrl: null,
      firstPublicationYear: 1900,
      editionCount: 400,
    });
    http
      .expectOne((r) => r.url.endsWith('/metadata-editions'))
      .flush({ workKey: '/works/OL1W', page: 0, content: [], hasNext: true });
    http.expectOne((r) => r.url.endsWith('/metadata-duplicates')).flush(duplicates);
    editor.editionFilters.controls.publisher.setValue('Salamandra');
    editor.editionFilters.controls.year.setValue('2001');
    page.goToStep(1);
    page.goToStep(2);
    http.expectNone(() => true);
    editor.filterEditions();
    const request = http.expectOne((r) => r.url.endsWith('/metadata-editions'));
    expect(request.request.params.get('language')).toBe('es');
    expect(request.request.params.get('publisher')).toBe('Salamandra');
    expect(request.request.params.get('year')).toBe('2001');
    request.flush({ workKey: '/works/OL1W', page: 0, content: [], hasNext: false });
    expect(editor.selectedEdition()).toBeNull();
    expect(editor.filteredEditions()).toBe(true);
    expect(editor.editionFilters.controls.publisher.value).toBe('Salamandra');
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
