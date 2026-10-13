import { Injectable, InjectionToken, inject, isDevMode } from '@angular/core';
import { isValidBarcodeIsbn13 } from '../../models/isbn-barcode';

export interface BarcodeResult {
  text: string;
  isEan13: boolean;
}
export interface BarcodeDecoder {
  decode(element: HTMLVideoElement | HTMLImageElement): BarcodeResult | null;
}

export const ISBN_DECODER_LOADER = new InjectionToken<() => Promise<BarcodeDecoder>>(
  'ISBN_DECODER_LOADER',
  { providedIn: 'root', factory: () => loadIsbnDecoder },
);

export async function loadIsbnDecoder(): Promise<BarcodeDecoder> {
  const [
    { BrowserMultiFormatOneDReader },
    { BarcodeFormat, DecodeHintType, NotFoundException, ChecksumException, FormatException },
  ] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  const reader = new BrowserMultiFormatOneDReader(
    new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]]),
  );
  return {
    decode(element) {
      try {
        const result = reader.decode(element);
        return {
          text: result.getText(),
          isEan13: result.getBarcodeFormat() === BarcodeFormat.EAN_13,
        };
      } catch (error: unknown) {
        if (
          error instanceof NotFoundException ||
          error instanceof ChecksumException ||
          error instanceof FormatException
        )
          return null;
        throw error;
      }
    },
  };
}

export type IsbnScanState =
  'idle' | 'requestingCamera' | 'scanning' | 'processingImage' | 'success' | 'error';
export interface IsbnScanEvents {
  state(state: IsbnScanState): void;
  error(message: string): void;
  warning(message: string): void;
  detected(isbn: string): void;
  diagnostics?(value: IsbnScanDiagnostics): void;
}
export const ISBN_SCAN_DIAGNOSTICS_ENABLED = new InjectionToken<boolean>(
  'ISBN_SCAN_DIAGNOSTICS_ENABLED',
  { providedIn: 'root', factory: () => isDevMode() },
);
export interface IsbnScanDiagnostics {
  videoWidth: number;
  videoHeight: number;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  facingMode: string | null;
  focusModes: string[];
  continuousRequested: boolean;
  focusRequestFailed: boolean;
  confirmedFocusMode: string | null;
  zoom: { min: number; max: number } | null;
  torchAvailable: boolean;
  lastEan13: string | null;
}
const NO_ISBN = 'No se ha detectado un ISBN válido';
const READ_ERROR = 'No se pudo leer el código de barras';

// One instance per dialog; owns every resource and rejects late asynchronous results.
@Injectable()
export class IsbnBarcodeReader {
  private readonly loadDecoder = inject(ISBN_DECODER_LOADER);
  private readonly diagnosticsEnabled = inject(ISBN_SCAN_DIAGNOSTICS_ENABLED);
  private generation = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;
  private releasePreparation: (() => void) | null = null;
  private diagnostics: IsbnScanDiagnostics | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private imageUrl: string | null = null;
  private releaseImage: (() => void) | null = null;
  private decoderPromise: Promise<BarcodeDecoder> | null = null;
  private warned = false;

  cleanup(): void {
    this.generation++;
    if (this.frameTimer !== null) clearTimeout(this.frameTimer);
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.frameTimer = this.timeout = null;
    this.releasePreparation?.();
    this.releasePreparation = null;
    this.diagnostics = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.releaseImage?.();
    this.releaseImage = null;
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = null;
    this.warned = false;
  }

  async startCamera(video: HTMLVideoElement, events: IsbnScanEvents): Promise<void> {
    this.cleanup();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail('Este navegador no permite escanear con la cámara', events);
      return;
    }
    events.state('requestingCamera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video = video;
      // Also bound time spent loading the decoder or awaiting video playback.
      this.timeout = setTimeout(() => this.fail(NO_ISBN, events), 60_000);
      video.muted = true;
      let cancel!: () => void;
      const cancelled = new Promise<null>((resolve) => {
        cancel = () => resolve(null);
      });
      let releaseReady!: () => void;
      const ready = new Promise<boolean>((resolve) => {
        const check = () => {
          if (
            video.srcObject === stream &&
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            releaseReady();
            resolve(true);
          }
        };
        releaseReady = () => {
          video.removeEventListener('loadedmetadata', check);
          video.removeEventListener('canplay', check);
          video.removeEventListener('loadeddata', check);
          video.removeEventListener('resize', check);
        };
        this.releasePreparation = () => {
          releaseReady();
          resolve(false);
          cancel();
        };
        video.addEventListener('loadedmetadata', check);
        video.addEventListener('canplay', check);
        video.addEventListener('loadeddata', check);
        video.addEventListener('resize', check);
        // Listeners are attached before assigning srcObject; also handle already-ready video.
        video.srcObject = stream;
        check();
      });
      // Playback starts promptly, independently of lazy decoder loading.
      void this.prepareFocus(stream, video, events, generation);
      const preparation = Promise.all([ready, video.play(), this.decoder()]);
      const prepared = await Promise.race([preparation, cancelled]);
      if (generation !== this.generation) return;
      if (!prepared || !prepared[0]) return;
      this.releasePreparation?.();
      this.releasePreparation = null;
      const decoder = prepared[2];
      this.publishDimensions(video, events);
      events.state('scanning');
      const schedule = () => {
        this.frameTimer = setTimeout(attempt, 250);
      };
      const attempt = () => {
        if (generation !== this.generation) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            this.publishDimensions(video, events);
            this.accept(decoder.decode(video), events);
          }
        } catch {
          this.fail(READ_ERROR, events);
        }
        if (generation === this.generation) schedule();
      };
      schedule();
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      const name = error instanceof DOMException ? error.name : '';
      this.fail(
        name === 'NotAllowedError'
          ? 'No se ha concedido acceso a la cámara'
          : name === 'NotFoundError'
            ? 'No se ha encontrado una cámara disponible'
            : READ_ERROR,
        events,
      );
    }
  }

  private async prepareFocus(
    stream: MediaStream,
    video: HTMLVideoElement,
    events: IsbnScanEvents,
    generation: number,
  ): Promise<void> {
    const track = stream.getVideoTracks?.()[0];
    let capabilities:
      | (MediaTrackCapabilities & { focusMode?: unknown; zoom?: unknown; torch?: unknown })
      | undefined;
    try {
      capabilities = track?.getCapabilities?.();
    } catch {
      /* Optional capabilities. */
    }
    const focusModes = Array.isArray(capabilities?.focusMode)
      ? capabilities.focusMode.filter((mode): mode is string => typeof mode === 'string')
      : [];
    let requested = false;
    let failed = false;
    if (
      track &&
      typeof track.applyConstraints === 'function' &&
      focusModes.includes('continuous')
    ) {
      requested = true;
      try {
        const focus: MediaTrackConstraintSet & { focusMode: string } = { focusMode: 'continuous' };
        await track.applyConstraints({ advanced: [focus] });
      } catch {
        failed = true;
      }
    }
    if (generation !== this.generation) return;
    let settings: (MediaTrackSettings & { focusMode?: unknown }) | undefined;
    try {
      settings = track?.getSettings?.();
    } catch {
      /* Settings need not be exposed. */
    }
    if (!this.diagnosticsEnabled) return;
    const zoom = capabilities?.zoom;
    const range =
      typeof zoom === 'object' &&
      zoom !== null &&
      'min' in zoom &&
      'max' in zoom &&
      typeof zoom.min === 'number' &&
      typeof zoom.max === 'number' &&
      Number.isFinite(zoom.min) &&
      Number.isFinite(zoom.max) &&
      zoom.min <= zoom.max
        ? { min: zoom.min, max: zoom.max }
        : null;
    this.diagnostics = {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      width: settings?.width ?? null,
      height: settings?.height ?? null,
      frameRate: settings?.frameRate ?? null,
      facingMode: settings?.facingMode ?? null,
      focusModes,
      continuousRequested: requested,
      focusRequestFailed: failed,
      confirmedFocusMode: typeof settings?.focusMode === 'string' ? settings.focusMode : null,
      zoom: range,
      torchAvailable:
        capabilities?.torch === true ||
        (Array.isArray(capabilities?.torch) && capabilities.torch.includes(true)),
      lastEan13: null,
    };
    events.diagnostics?.({ ...this.diagnostics });
  }

  private publishDimensions(video: HTMLVideoElement, events: IsbnScanEvents): void {
    if (
      !this.diagnostics ||
      (this.diagnostics.videoWidth === video.videoWidth &&
        this.diagnostics.videoHeight === video.videoHeight)
    )
      return;
    this.diagnostics = {
      ...this.diagnostics,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    };
    events.diagnostics?.({ ...this.diagnostics });
  }

  async processImage(file: File | null, events: IsbnScanEvents): Promise<void> {
    this.cleanup();
    const generation = this.generation;
    if (
      !file ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024 ||
      !['image/jpeg', 'image/png'].includes(file.type)
    ) {
      this.fail(READ_ERROR, events);
      return;
    }
    events.state('processingImage');
    try {
      this.imageUrl = URL.createObjectURL(file);
      const image = new Image();
      const loaded = await new Promise<boolean>((resolve) => {
        this.releaseImage = () => {
          image.onload = image.onerror = null;
          image.removeAttribute('src');
          resolve(false);
        };
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = this.imageUrl ?? '';
      });
      if (generation !== this.generation) return;
      if (
        !loaded ||
        image.naturalWidth <= 0 ||
        image.naturalHeight <= 0 ||
        image.naturalWidth * image.naturalHeight > 20_000_000
      ) {
        this.fail(READ_ERROR, events);
        return;
      }
      const decoder = await this.decoder();
      if (generation !== this.generation) return;
      if (!this.accept(decoder.decode(image), events)) this.fail(NO_ISBN, events);
    } catch {
      if (generation === this.generation) this.fail(READ_ERROR, events);
    }
  }

  private decoder(): Promise<BarcodeDecoder> {
    this.decoderPromise ??= this.loadDecoder().catch((error: unknown) => {
      this.decoderPromise = null;
      throw error;
    });
    return this.decoderPromise;
  }

  private accept(result: BarcodeResult | null, events: IsbnScanEvents): boolean {
    if (!result) return false;
    if (result.isEan13 && this.diagnostics && this.diagnostics.lastEan13 !== result.text) {
      this.diagnostics = { ...this.diagnostics, lastEan13: result.text };
      events.diagnostics?.({ ...this.diagnostics });
    }
    if (!result.isEan13 || !isValidBarcodeIsbn13(result.text)) {
      if (!this.warned) events.warning('Código detectado, pero no es un ISBN válido');
      this.warned = true;
      return false;
    }
    this.cleanup();
    events.state('success');
    events.detected(result.text);
    return true;
  }

  private fail(message: string, events: IsbnScanEvents): void {
    this.cleanup();
    events.state('error');
    events.error(message);
  }
}
