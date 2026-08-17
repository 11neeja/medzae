'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, RotateCcw } from 'lucide-react';

/**
 * Square crop for profile photos.
 *
 * Avatars render inside a circle, so an uncropped upload is decided for the
 * user by whatever `object-fit` does — a portrait loses its subject's head.
 * This lets them frame it: drag to pan, zoom in, and what sits inside the
 * circle is exactly what gets uploaded.
 *
 * No cropping library: the maths is a source-rectangle on a canvas, and a
 * dependency for that would outweigh it.
 */

const MAX_VIEWPORT = 256;
const OUTPUT = 512;
const MAX_ZOOM = 4;

interface AvatarCropperProps {
  file: File;
  /** Called on every change with the cropped square, ready to upload. */
  onCropChange: (blob: Blob | null) => void;
}

export default function AvatarCropper({ file, onCropChange }: AvatarCropperProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // The crop box shrinks to fit narrow screens, and the maths has to follow it.
  // Hard-coding the size would let the rendered circle and the exported crop
  // disagree on a phone — you would frame one thing and upload another.
  const [viewport, setViewport] = useState(MAX_VIEWPORT);

  useEffect(() => {
    const el = frameRef.current?.parentElement;
    if (!el) return;
    const measure = () => setViewport(Math.max(140, Math.min(MAX_VIEWPORT, el.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scale at which the image exactly covers the viewport — the zoom floor, so
  // the crop can never include blank space.
  const baseScale = image ? Math.max(viewport / image.naturalWidth, viewport / image.naturalHeight) : 1;
  const scale = baseScale * zoom;

  const clamp = useCallback(
    (next: { x: number; y: number }, activeScale: number) => {
      if (!image) return next;
      const w = image.naturalWidth * activeScale;
      const h = image.naturalHeight * activeScale;
      return {
        x: Math.min(0, Math.max(viewport - w, next.x)),
        y: Math.min(0, Math.max(viewport - h, next.y)),
      };
    },
    [image, viewport],
  );

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Centre on load, and re-centre if the box is resized (rotating a phone),
  // which keeps the offsets valid for the new viewport.
  useEffect(() => {
    if (!image) return;
    const base = Math.max(viewport / image.naturalWidth, viewport / image.naturalHeight);
    setZoom(1);
    setOffset({
      x: (viewport - image.naturalWidth * base) / 2,
      y: (viewport - image.naturalHeight * base) / 2,
    });
  }, [image, viewport]);

  // Re-export whenever the framing changes. Debounced: dragging fires this a
  // lot, and each export is a full canvas encode.
  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // The viewport shows this rectangle of the source image.
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;
      const size = viewport / scale;

      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT);
      canvas.toBlob((blob) => onCropChange(blob), 'image/jpeg', 0.92);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [image, offset, scale, viewport, onCropChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const { x, y, ox, oy } = dragState.current;
    setOffset(clamp({ x: ox + (e.clientX - x), y: oy + (e.clientY - y) }, scale));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragState.current = null;
  };

  // Zoom about the centre of the viewport, so the subject stays put.
  const applyZoom = (nextZoom: number) => {
    if (!image) return;
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    const nextScale = baseScale * clampedZoom;
    const centreX = (viewport / 2 - offset.x) / scale;
    const centreY = (viewport / 2 - offset.y) / scale;
    setZoom(clampedZoom);
    setOffset(
      clamp({ x: viewport / 2 - centreX * nextScale, y: viewport / 2 - centreY * nextScale }, nextScale),
    );
  };

  const recentre = () => {
    if (!image) return;
    setZoom(1);
    setOffset({
      x: (viewport - image.naturalWidth * baseScale) / 2,
      y: (viewport - image.naturalHeight * baseScale) / 2,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => applyZoom(zoom - e.deltaY * 0.002)}
          // shrink-0: without it flexbox quietly narrows the box on small
          // screens while the crop maths still assumes the full width.
          className="relative shrink-0 overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none rounded-full border border-[var(--color-border-hairline)] bg-[var(--color-surface-elevated)]"
          style={{ width: viewport, height: viewport }}
          role="application"
          aria-label="Drag to reposition your photo, scroll to zoom"
        >
          {image && (
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="absolute max-w-none origin-top-left pointer-events-none"
              style={{
                width: image.naturalWidth * scale,
                height: image.naturalHeight * scale,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>
      </div>

      <p className="text-center text-xs text-[var(--color-text-soft)]">
        Drag to reposition · scroll or use the slider to zoom
      </p>

      <div className="flex items-center gap-3">
        <ZoomIn className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" strokeWidth={1.75} />
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => applyZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="flex-1 h-1 accent-[var(--color-blue-primary)] cursor-pointer"
        />
        <button
          type="button"
          onClick={recentre}
          className="icon-btn icon-btn-sm"
          aria-label="Reset framing"
          title="Reset framing"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
