'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

export interface CameraCaptureCopy {
  title: string;
  hint: string;
  capture: string;
  cancel: string;
  starting: string;
  denied: string;
  unavailable: string;
}

/**
 * Take a photo of the PAN card with this device's camera (a computer's webcam, or a phone's rear camera when the
 * browser offers one). The frame is captured to a JPEG `File` and handed to the caller — the same on-device PAN
 * reader the "Choose file" upload uses, so the photo never leaves the device.
 *
 * The browser asks for camera permission itself the first time. A refusal, or a device with no camera, shows a
 * plain message instead of a blank window; the caller keeps the file upload and manual entry as alternatives.
 */
export function CameraCapture({
  open,
  onClose,
  onCapture,
  copy,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  copy: CameraCaptureCopy;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'starting' | 'live' | 'denied' | 'unavailable'>('starting');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState('starting');
    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setState('live');
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open]);

  if (!open) return null;

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], 'pan-photo.jpg', { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pan-camera-title"
      onClick={onClose}
    >
      <div className="bg-background w-full max-w-lg rounded-3xl p-5 shadow-[var(--shadow-float)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="pan-camera-title" className="text-lg font-extrabold">{copy.title}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">{copy.hint}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.cancel} className="border-border grid h-9 w-9 shrink-0 place-items-center rounded-full border">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
          {/* The live picture. Kept mounted while starting so the stream has somewhere to attach. */}
          <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${state === 'live' ? '' : 'invisible'}`} />
          {state !== 'live' && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white" role="status" aria-busy={state === 'starting'}>
              {state === 'starting' ? copy.starting : state === 'denied' ? copy.denied : copy.unavailable}
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <button type="button" onClick={onClose} className="border-border flex-1 rounded-full border py-3 text-sm font-bold">
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={state !== 'live'}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold ${
              state === 'live' ? 'bg-brand-gradient text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            <Camera className="h-4 w-4" />
            {copy.capture}
          </button>
        </div>
      </div>
    </div>
  );
}
