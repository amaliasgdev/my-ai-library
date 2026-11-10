import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal, HostListener } from '@angular/core';
import { PhotoImportWorkflow, emptyPhotoDraft } from './photo-import-workflow';
import { PhotoReadingListWorkflow } from './photo-reading-list-workflow';
import { effect, untracked } from '@angular/core';
import { PhotoImportQueue } from './photo-import-queue';
import { BookFormValue } from '../../components/book-form/book-form.helpers';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { parseBookCatalogQuery, serializeBookCatalogQuery } from '../../models/book-catalog-query';
import {
  PhotoImportCapabilities,
  PhotoRecognitionResponse,
} from '../../models/book-photo-import.models';
import { BookPhotoImportService } from '../../services/book-photo-import.service';
import { PhotoMetadataCandidate } from '../../components/photo-metadata-candidate/photo-metadata-candidate';

interface LocalPhoto {
  readonly id: number;
  readonly file: File;
  readonly previewUrl: string;
  /** Pending clockwise rotation relative to the browser-oriented original; not encoded in file. */
  readonly rotationDegrees: 0 | 90 | 180 | 270;
  readonly analysis: 'idle' | 'queued' | 'analyzing' | 'success' | 'error' | 'cancelled';
  readonly result: PhotoRecognitionResponse | null;
  readonly message: string | null;
}

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-book-photo-import',
  imports: [
    PhotoImportQueue,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatProgressBarModule,
    PhotoMetadataCandidate,
  ],
  providers: [PhotoImportWorkflow, PhotoReadingListWorkflow],
  templateUrl: './book-photo-import.html',
  styleUrl: './book-photo-import.scss',
})
export class BookPhotoImport {
  readonly workflow = inject(PhotoImportWorkflow);
  readonly reading = inject(PhotoReadingListWorkflow);
  canLeave() {
    return this.workflow.canLeave();
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.workflow.pendingWork() || this.workflow.locked() || this.reading.pending()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  candidateChanged(photoId: number, observationId: string, draft: BookFormValue): void {
    const photo = this.photos().find((p) => p.id === photoId);
    if (photo) this.workflow.source(`photo:${photoId}:${observationId}`, photo.file.name, draft);
  }
  reviewCandidate(photoId: number, observationId: string, draft: BookFormValue): void {
    this.candidateChanged(photoId, observationId, draft);
    this.workflow.review(`photo:${photoId}:${observationId}`);
  }
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(BookPhotoImportService);
  private analysisRequest: Subscription | null = null;
  private generation = 0;
  private nextId = 0;
  readonly catalogParams = serializeBookCatalogQuery(
    parseBookCatalogQuery(inject(ActivatedRoute).snapshot.queryParamMap),
  );
  readonly photos = signal<readonly LocalPhoto[]>([]);
  readonly errors = signal<readonly string[]>([]);
  readonly maxPhotos = MAX_PHOTOS;
  readonly capabilities = signal<PhotoImportCapabilities | null>(null);
  readonly availabilityLoading = signal(false);
  readonly availabilityError = signal(false);
  readonly analyzing = signal(false);
  readonly analysisTotal = signal(0);
  readonly analysisCompleted = signal(0);
  readonly available = computed(() => {
    const config = this.capabilities();
    return (
      config?.enabled === true &&
      config.mode === 'SIMULATED' &&
      config.provider === 'mock' &&
      config.simulated === true &&
      config.maxFileBytes > 0 &&
      config.maxObservations > 0 &&
      Array.isArray(config.allowedFormats)
    );
  });
  readonly canAnalyze = computed(
    () =>
      this.available() &&
      !this.workflow.locked() &&
      !this.analyzing() &&
      this.photos().some((photo) => photo.analysis !== 'success'),
  );

  constructor() {
    this.reading.setBlocker(() => this.workflow.creating() || this.workflow.dialogOpen());
    effect(() => {
      const rows = this.workflow.rows();
      untracked(() => this.reading.setCandidates(rows));
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.analysisRequest?.unsubscribe();
      for (const photo of this.photos()) URL.revokeObjectURL(photo.previewUrl);
      this.photos.set([]);
    });
    this.loadCapabilities();
  }

  loadCapabilities(): void {
    if (this.destroyRef.destroyed || this.availabilityLoading() || this.analyzing()) return;
    this.availabilityLoading.set(true);
    this.availabilityError.set(false);
    this.capabilities.set(null);
    this.service
      .capabilities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.capabilities.set(config);
          this.availabilityLoading.set(false);
        },
        error: () => {
          this.availabilityError.set(true);
          this.availabilityLoading.set(false);
        },
      });
  }

  selectFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Allow choosing the same file again after removal or a rejected selection.
    input.value = '';
    this.addFiles(files);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  dropFiles(event: DragEvent): void {
    event.preventDefault();
    if (this.analyzing()) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) {
      this.errors.set(['Arrastra archivos JPEG o PNG, no enlaces ni carpetas.']);
      return;
    }
    this.addFiles(files);
  }

  private addFiles(files: readonly File[]): void {
    if (this.destroyRef.destroyed || this.analyzing() || this.workflow.locked() || !files.length)
      return;
    if (this.photos().length + files.length > MAX_PHOTOS) {
      this.errors.set([
        'Puedes seleccionar un máximo de 3 fotografías. No se ha añadido ninguna de esta selección; retira una fotografía o elige menos archivos.',
      ]);
      return;
    }
    const errors: string[] = [];
    for (const file of files) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        errors.push(
          `${file.name}: formato no compatible. Utiliza JPEG o PNG; HEIC/HEIF, WebP, SVG, PDF y GIF no se admiten.`,
        );
      } else if (!file.size) {
        errors.push(`${file.name}: el archivo está vacío.`);
      } else if (file.size > MAX_PHOTO_BYTES) {
        errors.push(`${file.name}: supera el máximo de 5 MB (5.242.880 bytes).`);
      }
    }
    if (errors.length) {
      this.errors.set([...errors, 'No se ha añadido ninguna fotografía de esta selección.']);
      return;
    }
    const added: LocalPhoto[] = [];
    try {
      for (const file of files) {
        added.push({
          id: ++this.nextId,
          file,
          previewUrl: URL.createObjectURL(file),
          rotationDegrees: 0,
          analysis: 'idle',
          result: null,
          message: null,
        });
      }
    } catch {
      for (const photo of added) URL.revokeObjectURL(photo.previewUrl);
      this.errors.set([
        'No se pudieron preparar las vistas previas. Vuelve a seleccionar las fotografías.',
      ]);
      return;
    }
    this.photos.update((photos) => [...photos, ...added]);
    this.errors.set([]);
  }

  removePhoto(id: number): void {
    if (this.analyzing() || this.workflow.locked()) return;
    const photo = this.photos().find((item) => item.id === id);
    if (!photo) return;
    URL.revokeObjectURL(photo.previewUrl);
    this.photos.update((photos) => photos.filter((item) => item.id !== id));
  }

  rotatePhoto(id: number): void {
    if (this.analyzing() || this.workflow.locked()) return;
    this.photos.update((photos) =>
      photos.map((photo) =>
        photo.id === id
          ? {
              ...photo,
              rotationDegrees: ((photo.rotationDegrees + 90) %
                360) as LocalPhoto['rotationDegrees'],
              analysis: 'idle',
              result: null,
              message: null,
            }
          : photo,
      ),
    );
  }

  previewFailed(id: number): void {
    const photo = this.photos().find((item) => item.id === id);
    if (!photo) return;
    if (this.analyzing()) this.cancelAnalysis();
    this.removePhoto(id);
    this.errors.update((errors) => [
      ...errors,
      `${photo.file.name}: no se pudo leer la fotografía. Elige un JPEG o PNG válido.`,
    ]);
  }

  analyze(): void {
    if (!this.canAnalyze() || this.destroyRef.destroyed) return;
    this.startQueue(this.photos().filter((photo) => photo.analysis !== 'success'));
  }

  retryPhoto(id: number): void {
    const photo = this.photos().find((item) => item.id === id);
    if (
      !this.available() ||
      this.workflow.locked() ||
      this.analyzing() ||
      this.destroyRef.destroyed ||
      !photo ||
      !['error', 'cancelled'].includes(photo.analysis)
    )
      return;
    this.startQueue([photo]);
  }

  private updatePhoto(id: number, patch: Partial<LocalPhoto>): void {
    this.photos.update((photos) =>
      photos.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)),
    );
  }

  private startQueue(photos: readonly LocalPhoto[]): void {
    this.analyzing.set(true);
    this.analysisTotal.set(photos.length);
    this.analysisCompleted.set(0);
    for (const photo of photos)
      this.updatePhoto(photo.id, { analysis: 'queued', result: null, message: null });
    this.analyzeNext([...photos], ++this.generation);
  }

  private analyzeNext(queue: LocalPhoto[], generation: number): void {
    if (this.destroyRef.destroyed || generation !== this.generation) return;
    const photo = queue.shift();
    if (!photo) {
      this.analyzing.set(false);
      return;
    }
    const config = this.capabilities()!;
    if (photo.file.size > config.maxFileBytes || !config.allowedFormats.includes(photo.file.type)) {
      this.updatePhoto(photo.id, {
        analysis: 'error',
        message: 'La fotografía no cumple los límites actuales del servidor.',
      });
      this.analysisCompleted.update((value) => value + 1);
      this.analyzeNext(queue, generation);
      return;
    }
    this.updatePhoto(photo.id, { analysis: 'analyzing', message: null });
    this.analysisRequest = this.service
      .recognize(photo.file, photo.rotationDegrees)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (generation !== this.generation) return;
          const valid =
            result?.simulated === true &&
            result.provider === 'mock' &&
            Array.isArray(result.observations) &&
            result.observations.length <= config.maxObservations &&
            Array.isArray(result.warnings);
          this.updatePhoto(
            photo.id,
            valid
              ? { analysis: 'success', result, message: null }
              : {
                  analysis: 'error',
                  result: null,
                  message: 'El servidor devolvió un resultado incompatible con el modo simulado.',
                },
          );
          if (valid)
            for (const observation of result.observations) {
              this.candidateChanged(photo.id, observation.id, {
                ...emptyPhotoDraft(),
                title: observation.title ?? '',
                author: observation.author ?? '',
                isbn: observation.rawIsbn ?? '',
              });
            }
          this.analysisCompleted.update((value) => value + 1);
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          const message =
            status === 413
              ? 'La fotografía supera el tamaño permitido.'
              : status === 415
                ? 'El formato de la fotografía no es compatible.'
                : status === 400
                  ? 'La fotografía o su orientación no son válidas.'
                  : status === 429
                    ? 'El servidor está ocupado. Puedes reintentar manualmente.'
                    : status === 503
                      ? 'El reconocimiento está deshabilitado o no está disponible.'
                      : status === 504
                        ? 'El análisis agotó su tiempo. No se ha reintentado.'
                        : 'No se pudo analizar la fotografía. Puedes reintentar manualmente.';
          this.updatePhoto(photo.id, { analysis: 'error', result: null, message });
          this.analysisCompleted.update((value) => value + 1);
          this.analyzeNext(queue, generation);
        },
        complete: () => this.analyzeNext(queue, generation),
      });
  }

  cancelAnalysis(): void {
    if (!this.analyzing()) return;
    this.generation++;
    this.analysisRequest?.unsubscribe();
    this.analysisRequest = null;
    this.photos.update((photos) =>
      photos.map((photo) =>
        ['queued', 'analyzing'].includes(photo.analysis)
          ? {
              ...photo,
              analysis: 'cancelled',
              message: 'Análisis cancelado; no se reanudará automáticamente.',
            }
          : photo,
      ),
    );
    this.analyzing.set(false);
  }

  analysisLabel(photo: LocalPhoto): string {
    return {
      idle: 'Sin analizar',
      queued: 'En cola',
      analyzing: 'Analizando…',
      success: 'Ejemplo simulado recibido',
      error: 'Error de análisis',
      cancelled: 'Cancelado',
    }[photo.analysis];
  }

  legibilityLabel(value: string): string {
    return (
      ({ CLEAR: 'Clara', PARTIAL: 'Parcial', ILLEGIBLE: 'Ilegible' } as Record<string, string>)[
        value
      ] ?? 'No indicada'
    );
  }
}
