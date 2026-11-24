import {
  BarcodeFormat,
  BinaryBitmap,
  BrowserMultiFormatReader,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
} from '@zxing/library';
import {
  Camera,
  Flashlight,
  ImageUp,
  Keyboard,
  Loader2,
  ScanBarcode,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (ean: string) => void;
}

function createReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

function decodeCanvas(canvas: HTMLCanvasElement, reader: BrowserMultiFormatReader): string | null {
  try {
    const luminance = new HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
    const result = reader.decodeBitmap(bitmap);
    return result?.getText() || null;
  } catch {
    return null;
  }
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1120;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.11);
  } catch {
    // Ignore audio context restriction
  }
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onClose,
  onDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectedRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [manualEan, setManualEan] = useState('');

  const finishWithCode = useCallback(
    (raw: string) => {
      const code = raw.replace(/\D/g, '') || raw.trim();
      if (!code || detectedRef.current) return;
      detectedRef.current = true;
      playBeep();
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
      onDetected(code);
    },
    [onDetected]
  );

  useEffect(() => {
    if (!open) return;

    detectedRef.current = false;
    setCameraError(null);
    setPhotoError(null);
    setInitializing(true);
    setTorchOn(false);
    setTorchSupported(false);

    let cancelled = false;
    let timerId: number | null = null;
    const reader = createReader();

    type NativeBarcodeDetector = {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
    const BarcodeDetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => NativeBarcodeDetector;
      }
    ).BarcodeDetector;

    let nativeDetector: NativeBarcodeDetector | null = null;
    if (typeof window !== 'undefined' && BarcodeDetectorCtor) {
      try {
        nativeDetector = new BarcodeDetectorCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
        });
      } catch {
        nativeDetector = null;
      }
    }

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setInitializing(false);
        setCameraError(
          'Câmera ao vivo indisponível neste navegador/iframe. Use "Fotografar código de barras" ou digite o EAN abaixo.'
        );
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } catch {
          if (!cancelled) {
            setInitializing(false);
            setCameraError(
              'Permissão de câmera negada ou câmera ocupada. Use "Fotografar código de barras" ou digite o EAN abaixo.'
            );
          }
          return;
        }
      }

      if (cancelled) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps = track.getCapabilities?.() as { torch?: boolean; focusMode?: string[] } | undefined;
          if (caps?.torch) setTorchSupported(true);
          if (caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
            });
          }
        } catch {
          // Ignore unsupported camera constraints
        }
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Ignore autoplay warning
      }
      if (cancelled) return;
      setInitializing(false);

      const scanFrame = async () => {
        if (cancelled || detectedRef.current) return;
        const vid = videoRef.current;
        if (!vid || vid.readyState < 2 || vid.videoWidth === 0) {
          timerId = window.setTimeout(() => void scanFrame(), 140);
          return;
        }

        if (nativeDetector) {
          try {
            const found = (await nativeDetector.detect(vid)).find((d) => d.rawValue)?.rawValue;
            if (found) {
              finishWithCode(found);
              return;
            }
          } catch {
            // Fall through to ZXing
          }
        }

        const canvas = canvasRef.current;
        if (canvas) {
          const w = Math.min(960, vid.videoWidth);
          const ratio = w / vid.videoWidth;
          const h = Math.round(vid.videoHeight * ratio);
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(vid, 0, 0, w, h);
            const zxingFound = decodeCanvas(canvas, reader);
            if (zxingFound) {
              finishWithCode(zxingFound);
              return;
            }
          }
        }

        if (!cancelled && !detectedRef.current) {
          timerId = window.setTimeout(() => void scanFrame(), 140);
        }
      };

      timerId = window.setTimeout(() => void scanFrame(), 250);
    }

    void startCamera();

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
      reader.reset();
    };
  }, [open, finishWithCode]);

  if (!open) return null;

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Ignore unsupported torch toggle
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeDetectorCtor) {
        try {
          const detector = new BarcodeDetectorCtor({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'],
          });
          const detected = (await detector.detect(bitmap)).find((d) => d.rawValue)?.rawValue;
          if (detected) {
            finishWithCode(detected);
            return;
          }
        } catch {
          // Fall back to ZXing
        }
      }

      const reader = createReader();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const direct = decodeCanvas(canvas, reader);
        if (direct) {
          finishWithCode(direct);
          return;
        }
        const rotCanvas = document.createElement('canvas');
        rotCanvas.width = canvas.height;
        rotCanvas.height = canvas.width;
        const rCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
        if (rCtx) {
          rCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
          rCtx.rotate(Math.PI / 2);
          rCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          const rotated = decodeCanvas(rotCanvas, reader);
          if (rotated) {
            finishWithCode(rotated);
            return;
          }
        }
      }

      setPhotoError(
        'Não foi possível identificar o código de barras na foto. Aproxime mais das barras e tente novamente.'
      );
    } catch {
      setPhotoError('Não foi possível processar a imagem enviada.');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leitor de código de barras"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#E4E8E0] rounded-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#E4E8E0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-[#1F6E43]" />
            <h3 className="font-display text-base font-bold text-[#143624]">
              Ler Código de Barras (EAN)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar leitor"
            className="p-1.5 rounded-lg text-[#526057] hover:bg-[#EEF1EA] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-[#141A16] flex items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {!cameraError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-4/5 h-28 border-2 border-[#6FCF97] rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] relative">
                  <div className="absolute inset-x-3 top-1/2 h-0.5 bg-[#D95D1A]/80" />
                </div>
              </div>
            )}

            {torchSupported && !cameraError && (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-black/80 cursor-pointer"
              >
                <Flashlight className="w-3.5 h-3.5" />
                <span>{torchOn ? 'Desligar luz' : 'Lanterna'}</span>
              </button>
            )}

            {initializing && !cameraError && (
              <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center text-white gap-2 text-xs">
                <Camera className="w-6 h-6" />
                <span>Iniciando câmera...</span>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 bg-[#141A16] p-5 flex flex-col items-center justify-center text-center text-xs text-white/90 gap-2">
                <Camera className="w-7 h-7 text-[#FDE68A]" />
                <p>{cameraError}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-[#EEF3EC] text-[#143624] hover:bg-[#E1EAE0] transition-colors cursor-pointer">
              {photoBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageUp className="w-4 h-4 text-[#1F6E43]" />
              )}
              <span>{photoBusy ? 'Lendo foto...' : 'Fotografar código de barras'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => void handlePhotoUpload(e)}
                className="hidden"
              />
            </label>
          </div>

          {photoError && (
            <p className="text-xs text-[#B91C1C] bg-[#FEE2E2] border border-[#FECACA] rounded-lg px-3 py-2">
              {photoError}
            </p>
          )}

          <p className="text-xs text-[#526057] text-center">
            Centralize as barras na faixa verde ou digite / use leitor USB abaixo:
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = manualEan.replace(/\D/g, '');
              if (clean) finishWithCode(clean);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Keyboard className="w-4 h-4 text-[#6B776F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                inputMode="numeric"
                value={manualEan}
                onChange={(e) => setManualEan(e.target.value)}
                placeholder="Ex: 7892840812751"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D4DBD0] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1F6E43]/30"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1F6E43] text-white hover:bg-[#143624] cursor-pointer"
            >
              Usar EAN
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
