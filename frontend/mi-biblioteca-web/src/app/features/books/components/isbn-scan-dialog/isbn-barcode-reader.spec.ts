import { TestBed } from '@angular/core/testing';
// Mock the decoder boundary: tests never require camera, canvas or ZXing's pixel engine.
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatOneDReader: class {
    constructor(public hints: Map<number, unknown>) {}
    decode(): unknown {
      throw new Error('Mock decode must be configured');
    }
  },
}));
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { EAN_13: 7, QR_CODE: 11 },
  DecodeHintType: { POSSIBLE_FORMATS: 2 },
  NotFoundException: class extends Error {},
  ChecksumException: class extends Error {},
  FormatException: class extends Error {},
  Result: class {
    constructor(
      private text: string,
      _bytes: Uint8Array,
      _bits: number,
      _points: unknown[],
      private format: number,
    ) {}
    getText() {
      return this.text;
    }
    getBarcodeFormat() {
      return this.format;
    }
  },
}));
import {
  BarcodeDecoder,
  ISBN_DECODER_LOADER,
  ISBN_SCAN_DIAGNOSTICS_ENABLED,
  IsbnBarcodeReader,
  IsbnScanEvents,
  loadIsbnDecoder,
} from './isbn-barcode-reader';

describe('IsbnBarcodeReader session (offline)', () => {
  let reader: IsbnBarcodeReader;
  let decode: ReturnType<typeof vi.fn<BarcodeDecoder['decode']>>;
  let loader: ReturnType<typeof vi.fn>;
  let media: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;
  let stream: MediaStream;
  let video: HTMLVideoElement;
  let events: IsbnScanEvents;
  let image: HTMLImageElement;
  beforeEach(() => {
    vi.useFakeTimers();
    decode = vi.fn<BarcodeDecoder['decode']>().mockReturnValue(null);
    loader = vi.fn().mockResolvedValue({ decode });
    TestBed.configureTestingModule({
      providers: [IsbnBarcodeReader, { provide: ISBN_DECODER_LOADER, useValue: loader }],
    });
    reader = TestBed.inject(IsbnBarcodeReader);
    stop = vi.fn();
    stream = { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream;
    media = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: media },
      configurable: true,
    });
    video = document.createElement('video');
    video.srcObject = null;
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
    vi.spyOn(video, 'play').mockResolvedValue();
    events = { state: vi.fn(), error: vi.fn(), warning: vi.fn(), detected: vi.fn() };
    image = document.createElement('img');
    Object.defineProperty(image, 'naturalWidth', { value: 1000, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1000, configurable: true });
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          return image;
        }
      },
    );
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn().mockReturnValue('blob:local'),
        revokeObjectURL: vi.fn(),
      }),
    );
  });
  afterEach(() => {
    reader.cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const valid = { text: '9780306406157', isEan13: true };
  async function imageScan(file = new File(['data'], 'barcode.jpg', { type: 'image/jpeg' })) {
    const promise = reader.processImage(file, events);
    image.dispatchEvent(new Event('load'));
    await promise;
  }

  it('does not load decoder or request camera until explicitly started', async () => {
    expect(loader).not.toHaveBeenCalled();
    expect(media).not.toHaveBeenCalled();
    await reader.startCamera(video, events);
    expect(media).toHaveBeenCalledExactlyOnceWith({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
    expect(events.state).toHaveBeenCalledWith('scanning');
  });

  function frameState(readyState: number, width = 1280, height = 720): void {
    Object.defineProperty(video, 'readyState', { value: readyState, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
  }
  function cameraTrack(properties: object): void {
    const track = { stop, ...properties };
    stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    media.mockResolvedValue(stream);
  }

  it('waits for metadata and a playable frame, with listeners registered before attachment', async () => {
    frameState(0, 0, 0);
    const add = vi.spyOn(video, 'addEventListener');
    const pending = reader.startCamera(video, events);
    await Promise.resolve();
    expect(add).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
    vi.advanceTimersByTime(500);
    expect(decode).not.toHaveBeenCalled();
    frameState(1);
    video.dispatchEvent(new Event('loadedmetadata'));
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    expect(decode).not.toHaveBeenCalled();
    frameState(3);
    video.dispatchEvent(new Event('canplay'));
    await pending;
    vi.advanceTimersByTime(250);
    expect(decode).toHaveBeenCalledOnce();
  });
  it('accepts already available metadata/current frame without waiting for new events', async () => {
    frameState(2);
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(250);
    expect(decode).toHaveBeenCalledOnce();
  });
  it.each([
    [0, 720],
    [1280, 0],
    [0, 0],
  ])('does not decode zero dimensions %j', async (width, height) => {
    frameState(4, width, height);
    const pending = reader.startCamera(video, events);
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    expect(decode).not.toHaveBeenCalled();
    reader.cleanup();
    await pending;
  });
  it('handles loadeddata as an equivalent frame event', async () => {
    frameState(1);
    const pending = reader.startCamera(video, events);
    await Promise.resolve();
    frameState(2);
    video.dispatchEvent(new Event('loadeddata'));
    await pending;
    vi.advanceTimersByTime(250);
    expect(decode).toHaveBeenCalledOnce();
  });
  it('cleanup releases metadata listeners and resolves pending preparation', async () => {
    frameState(0, 0, 0);
    const remove = vi.spyOn(video, 'removeEventListener');
    const pending = reader.startCamera(video, events);
    await Promise.resolve();
    reader.cleanup();
    await pending;
    expect(remove).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('canplay', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('loadeddata', expect.any(Function));
    frameState(4);
    video.dispatchEvent(new Event('canplay'));
    vi.advanceTimersByTime(1000);
    expect(decode).not.toHaveBeenCalled();
    expect(events.state).not.toHaveBeenCalledWith('scanning');
  });
  it('playback rejection releases preparation and uses a safe reading error', async () => {
    frameState(0, 0, 0);
    vi.mocked(video.play).mockRejectedValue(new Error('SECRET'));
    await reader.startCamera(video, events);
    expect(events.error).toHaveBeenCalledWith('No se pudo leer el código de barras');
    expect(stop).toHaveBeenCalledTimes(2);
    expect(video.srcObject).toBeNull();
  });
  it('does not start while play is pending and ignores resolution after cleanup', async () => {
    let resolve!: () => void;
    vi.mocked(video.play).mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const pending = reader.startCamera(video, events);
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    expect(decode).not.toHaveBeenCalled();
    reader.cleanup();
    await pending;
    resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    expect(decode).not.toHaveBeenCalled();
  });
  it('resolves startup on cleanup even if decoder import never resolves', async () => {
    loader.mockReturnValue(new Promise<BarcodeDecoder>(() => {}));
    const pending = reader.startCamera(video, events);
    await Promise.resolve();
    reader.cleanup();
    await pending;
    expect(events.state).not.toHaveBeenCalledWith('scanning');
  });
  it('schedules the next attempt 250ms after finishing a slow synchronous decode', async () => {
    decode.mockImplementation(() => {
      vi.advanceTimersByTime(300);
      return null;
    });
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(250);
    expect(decode).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(249);
    expect(decode).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(decode).toHaveBeenCalledTimes(2);
  });
  it('skips frames that lose readiness or dimensions after startup', async () => {
    await reader.startCamera(video, events);
    frameState(1);
    vi.advanceTimersByTime(250);
    frameState(4, 0, 0);
    vi.advanceTimersByTime(250);
    expect(decode).not.toHaveBeenCalled();
    frameState(4);
    vi.advanceTimersByTime(250);
    expect(decode).toHaveBeenCalledOnce();
  });
  it.each(['getCapabilities', 'getSettings', 'applyConstraints'])(
    'works when %s is absent',
    async (absent) => {
      const properties = {
        getCapabilities: vi.fn().mockReturnValue({ focusMode: ['continuous'] }),
        getSettings: vi.fn().mockReturnValue({ width: 1280 }),
        applyConstraints: vi.fn().mockResolvedValue(undefined),
      };
      cameraTrack({ ...properties, [absent]: undefined });
      await reader.startCamera(video, events);
      vi.advanceTimersByTime(250);
      expect(decode).toHaveBeenCalledOnce();
    },
  );
  it('requests continuous once and reports only confirmed settings, never device IDs', async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    cameraTrack({
      getCapabilities: () => ({
        focusMode: ['continuous'],
        zoom: { min: 1, max: 3 },
        torch: [true, false],
        deviceId: 'SECRET',
      }),
      getSettings: () => ({
        width: 1280,
        height: 720,
        frameRate: 30,
        facingMode: 'environment',
        focusMode: 'continuous',
        deviceId: 'SECRET',
      }),
      applyConstraints: apply,
    });
    events.diagnostics = vi.fn();
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(1000);
    expect(apply).toHaveBeenCalledExactlyOnceWith({ advanced: [{ focusMode: 'continuous' }] });
    expect(events.diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1280,
        continuousRequested: true,
        confirmedFocusMode: 'continuous',
        zoom: { min: 1, max: 3 },
        torchAvailable: true,
      }),
    );
    expect(JSON.stringify(vi.mocked(events.diagnostics).mock.calls)).not.toContain('SECRET');
  });
  it('does not equate resolved autofocus with confirmation', async () => {
    cameraTrack({
      getCapabilities: () => ({ focusMode: ['continuous'] }),
      getSettings: () => ({}),
      applyConstraints: vi.fn().mockResolvedValue(undefined),
    });
    events.diagnostics = vi.fn();
    await reader.startCamera(video, events);
    expect(events.diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ continuousRequested: true, confirmedFocusMode: null }),
    );
  });
  it('does not request unsupported continuous focus', async () => {
    const apply = vi.fn();
    cameraTrack({ getCapabilities: () => ({ focusMode: ['manual'] }), applyConstraints: apply });
    await reader.startCamera(video, events);
    expect(apply).not.toHaveBeenCalled();
  });
  it('focus failure is nonblocking and recorded safely', async () => {
    cameraTrack({
      getCapabilities: () => ({ focusMode: ['continuous'] }),
      applyConstraints: vi.fn().mockRejectedValue(new Error('SECRET')),
    });
    events.diagnostics = vi.fn();
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(250);
    expect(decode).toHaveBeenCalledOnce();
    expect(events.error).not.toHaveBeenCalled();
    expect(events.diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ focusRequestFailed: true }),
    );
  });
  it('does not block decoding on a pending optional focus request or publish it after cleanup', async () => {
    let resolve!: () => void;
    cameraTrack({
      getCapabilities: () => ({ focusMode: ['continuous'] }),
      applyConstraints: () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    });
    events.diagnostics = vi.fn();
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(250);
    expect(decode).toHaveBeenCalledOnce();
    reader.cleanup();
    resolve();
    await Promise.resolve();
    expect(events.diagnostics).not.toHaveBeenCalled();
  });
  it('tolerates capabilities/settings methods throwing', async () => {
    cameraTrack({
      getCapabilities: () => {
        throw new Error('SECRET');
      },
      getSettings: () => {
        throw new Error('SECRET');
      },
    });
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(250);
    expect(decode).toHaveBeenCalledOnce();
    expect(events.error).not.toHaveBeenCalled();
  });
  it('reports actual decoded EAN-13 even if ISBN validation rejects it, without per-frame duplication', async () => {
    events.diagnostics = vi.fn();
    decode.mockReturnValue({ text: '4006381333931', isEan13: true });
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(1000);
    expect(events.diagnostics).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastEan13: '4006381333931', videoWidth: 1280, videoHeight: 720 }),
    );
    expect(events.diagnostics).toHaveBeenCalledTimes(2);
    expect(events.detected).not.toHaveBeenCalled();
  });
  it('does not publish diagnostic data when production diagnostics are disabled', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        IsbnBarcodeReader,
        { provide: ISBN_DECODER_LOADER, useValue: loader },
        { provide: ISBN_SCAN_DIAGNOSTICS_ENABLED, useValue: false },
      ],
    });
    reader = TestBed.inject(IsbnBarcodeReader);
    events.diagnostics = vi.fn();
    decode.mockReturnValue({ text: '4006381333931', isEan13: true });
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(250);
    expect(events.diagnostics).not.toHaveBeenCalled();
  });
  it('detects once, stops every track and clears video/timers before delivering ISBN', async () => {
    decode.mockReturnValue(valid);
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(250);
    expect(events.detected).toHaveBeenCalledExactlyOnceWith(valid.text);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(video.srcObject).toBeNull();
    vi.advanceTimersByTime(65_000);
    expect(decode).toHaveBeenCalledOnce();
    expect(events.error).not.toHaveBeenCalled();
  });
  it.each([
    { text: '4006381333931', isEan13: true },
    { text: '9780306406158', isEan13: true },
    { text: valid.text, isEan13: false },
  ])(
    'continues after invalid or wrong-format result %j, without repeated warnings',
    async (result) => {
      decode.mockReturnValue(result);
      await reader.startCamera(video, events);
      vi.advanceTimersByTime(1000);
      expect(events.detected).not.toHaveBeenCalled();
      expect(stop).not.toHaveBeenCalled();
      expect(events.warning).toHaveBeenCalledOnce();
      decode.mockReturnValue(valid);
      vi.advanceTimersByTime(250);
      expect(events.detected).toHaveBeenCalledOnce();
    },
  );
  it('times out after 60 seconds and releases camera', async () => {
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(60_000);
    expect(events.error).toHaveBeenCalledWith('No se ha detectado un ISBN válido');
    expect(stop).toHaveBeenCalledTimes(2);
    expect(video.srcObject).toBeNull();
  });
  it('cleanup is idempotent and invalidates frames', async () => {
    await reader.startCamera(video, events);
    reader.cleanup();
    reader.cleanup();
    vi.advanceTimersByTime(1000);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(decode).not.toHaveBeenCalled();
  });
  it('stops a late getUserMedia stream without connecting it or loading decoder', async () => {
    let resolve!: (value: MediaStream) => void;
    media.mockReturnValue(
      new Promise<MediaStream>((done) => {
        resolve = done;
      }),
    );
    const pending = reader.startCamera(video, events);
    reader.cleanup();
    resolve(stream);
    await pending;
    expect(stop).toHaveBeenCalledTimes(2);
    expect(video.srcObject).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });
  it('does not start playback after decoder loads for an obsolete session', async () => {
    let resolve!: (value: BarcodeDecoder) => void;
    loader.mockReturnValue(
      new Promise<BarcodeDecoder>((done) => {
        resolve = done;
      }),
    );
    const pending = reader.startCamera(video, events);
    await Promise.resolve();
    reader.cleanup();
    resolve({ decode });
    await pending;
    expect(video.play).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('bounds camera lifetime even while lazy decoder loading is pending', async () => {
    let resolve!: (value: BarcodeDecoder) => void;
    loader.mockReturnValue(
      new Promise<BarcodeDecoder>((done) => {
        resolve = done;
      }),
    );
    const pending = reader.startCamera(video, events);
    await Promise.resolve();
    vi.advanceTimersByTime(60_000);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(events.error).toHaveBeenCalledWith('No se ha detectado un ISBN válido');
    resolve({ decode });
    await pending;
    expect(video.play).toHaveBeenCalledOnce();
  });
  it.each([
    ['NotAllowedError', 'No se ha concedido acceso a la cámara'],
    ['NotFoundError', 'No se ha encontrado una cámara disponible'],
    ['NotReadableError', 'No se pudo leer el código de barras'],
  ])('maps %s without exposing raw errors', async (name, message) => {
    media.mockRejectedValue(new DOMException('SECRET', name));
    await reader.startCamera(video, events);
    expect(events.error).toHaveBeenCalledWith(message);
  });
  it('handles missing camera API without loading ZXing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    await reader.startCamera(video, events);
    expect(events.error).toHaveBeenCalledWith('Este navegador no permite escanear con la cámara');
    expect(loader).not.toHaveBeenCalled();
  });
  it('cleans up on camera decoder failure', async () => {
    decode.mockImplementation(() => {
      throw new Error('SECRET');
    });
    await reader.startCamera(video, events);
    vi.advanceTimersByTime(250);
    expect(events.error).toHaveBeenCalledWith('No se pudo leer el código de barras');
    expect(stop).toHaveBeenCalledTimes(2);
  });
  it.each(['image/jpeg', 'image/png'])('decodes %s locally, releasing its URL', async (type) => {
    decode.mockReturnValue(valid);
    await imageScan(new File(['data'], 'image', { type }));
    expect(events.detected).toHaveBeenCalledWith(valid.text);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:local');
    expect(media).not.toHaveBeenCalled();
  });
  it('stops camera before processing an image', async () => {
    await reader.startCamera(video, events);
    decode.mockReturnValue(valid);
    await imageScan();
    expect(stop).toHaveBeenCalledTimes(2);
    expect(video.srcObject).toBeNull();
  });
  it.each([
    null,
    new File([], 'empty.jpg', { type: 'image/jpeg' }),
    new File(['data'], 'bad.gif', { type: 'image/gif' }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }),
  ])('rejects absent/empty/type/oversized image %j before loading', async (file) => {
    await reader.processImage(file, events);
    expect(events.error).toHaveBeenCalledWith('No se pudo leer el código de barras');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
  });
  it('rejects >20 MP before decoding and releases the URL', async () => {
    Object.defineProperty(image, 'naturalWidth', { value: 5000 });
    Object.defineProperty(image, 'naturalHeight', { value: 4001 });
    await imageScan();
    expect(decode).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('accepts exact 10 MiB/20 MP boundary', async () => {
    Object.defineProperty(image, 'naturalWidth', { value: 5000 });
    Object.defineProperty(image, 'naturalHeight', { value: 4000 });
    decode.mockReturnValue(valid);
    await imageScan(
      new File([new Uint8Array(10 * 1024 * 1024)], 'image.png', { type: 'image/png' }),
    );
    expect(events.detected).toHaveBeenCalledOnce();
  });
  it('shows no ISBN for unreadable barcode and frees image', async () => {
    await imageScan();
    expect(events.error).toHaveBeenCalledWith('No se ha detectado un ISBN válido');
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('does not apply an invalid image barcode', async () => {
    decode.mockReturnValue({ text: '4006381333931', isEan13: true });
    await imageScan();
    expect(events.detected).not.toHaveBeenCalled();
    expect(events.warning).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('maps corrupt image safely', async () => {
    const pending = reader.processImage(
      new File(['data'], 'image.png', { type: 'image/png' }),
      events,
    );
    image.dispatchEvent(new Event('error'));
    await pending;
    expect(events.error).toHaveBeenCalledWith('No se pudo leer el código de barras');
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('maps image decoder failure and releases the URL', async () => {
    decode.mockImplementation(() => {
      throw new Error('SECRET');
    });
    await imageScan();
    expect(events.error).toHaveBeenCalledWith('No se pudo leer el código de barras');
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('cleanup cancels pending image load and revokes URL exactly once', async () => {
    const pending = reader.processImage(
      new File(['data'], 'image.png', { type: 'image/png' }),
      events,
    );
    reader.cleanup();
    await pending;
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(image.getAttribute('src')).toBeNull();
    expect(events.detected).not.toHaveBeenCalled();
    expect(events.error).not.toHaveBeenCalled();
  });

  it('ignores a late decoder load after closing image processing', async () => {
    let resolve!: (value: BarcodeDecoder) => void;
    loader.mockReturnValue(
      new Promise<BarcodeDecoder>((done) => {
        resolve = done;
      }),
    );
    const pending = reader.processImage(
      new File(['data'], 'image.png', { type: 'image/png' }),
      events,
    );
    image.dispatchEvent(new Event('load'));
    await Promise.resolve();
    reader.cleanup();
    resolve({ decode });
    await pending;
    expect(decode).not.toHaveBeenCalled();
    expect(events.detected).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
});

describe('ZXing adapter configuration', () => {
  afterEach(() => vi.restoreAllMocks());
  it('loads the installed libraries with EAN_13 as the only hint', async () => {
    const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
    const { BarcodeFormat, DecodeHintType, Result } = await import('@zxing/library');
    const spy = vi
      .spyOn(BrowserMultiFormatOneDReader.prototype, 'decode')
      .mockReturnValue(new Result('9780306406157', new Uint8Array(), 0, [], BarcodeFormat.EAN_13));
    const decoder = await loadIsbnDecoder();
    expect(decoder.decode(document.createElement('img'))).toEqual({
      text: '9780306406157',
      isEan13: true,
    });
    const context = spy.mock.contexts[0];
    if (!(context instanceof BrowserMultiFormatOneDReader))
      throw new Error('Decoder context missing');
    expect(context.hints.get(DecodeHintType.POSSIBLE_FORMATS)).toEqual([BarcodeFormat.EAN_13]);
    spy.mockReturnValue(
      new Result('9780306406157', new Uint8Array(), 0, [], BarcodeFormat.QR_CODE),
    );
    expect(decoder.decode(document.createElement('img'))?.isEan13).toBe(false);
  });
  it('treats ordinary absent/corrupt barcode frames as no detection, but propagates unexpected faults', async () => {
    const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
    const { NotFoundException, ChecksumException, FormatException } =
      await import('@zxing/library');
    const spy = vi.spyOn(BrowserMultiFormatOneDReader.prototype, 'decode');
    const decoder = await loadIsbnDecoder();
    for (const error of [new NotFoundException(), new ChecksumException(), new FormatException()]) {
      spy.mockImplementation(() => {
        throw error;
      });
      expect(decoder.decode(document.createElement('img'))).toBeNull();
    }
    spy.mockImplementation(() => {
      throw new Error('Unexpected');
    });
    expect(() => decoder.decode(document.createElement('img'))).toThrow('Unexpected');
  });
});
