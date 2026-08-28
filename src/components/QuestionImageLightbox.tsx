/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink, ImageOff } from "lucide-react";
import { motion } from "motion/react";

interface QuestionImageLightboxProps {
  /** Image to display. Passing null/undefined keeps the lightbox closed. */
  url: string | null;
  alt?: string;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.5;

/**
 * Full-screen image viewer for question figures.
 *
 * Deliberately a pure presentational overlay driven by a single `url` prop: it holds no quiz
 * state, so opening or closing it cannot disturb the student's answers, timer, current question
 * index, or trigger a submission. It renders as a sibling of the question card, never a parent,
 * so the question subtree is not remounted while it is open.
 */
export default function QuestionImageLightbox({ url, alt, onClose }: QuestionImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hasError, setHasError] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0
  });
  const pinchState = useRef<{ active: boolean; startDistance: number; startZoom: number }>({
    active: false,
    startDistance: 0,
    startZoom: 1
  });

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))));
    setZoom(clamped);
    // Snapping back to 1x re-centres the image so it can never get stranded off-screen.
    if (clamped === MIN_ZOOM) setOffset({ x: 0, y: 0 });
  }, []);

  // Reset zoom/pan whenever a different image is opened.
  useEffect(() => {
    if (!url) return;
    setHasError(false);
    resetView();
  }, [url, resetView]);

  // ESC to close, +/- to zoom. Bound to the document only while open.
  useEffect(() => {
    if (!url) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        applyZoom(zoom + ZOOM_STEP);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        applyZoom(zoom - ZOOM_STEP);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [url, zoom, applyZoom, onClose]);

  // Prevent the page behind the overlay from scrolling while it is open.
  useEffect(() => {
    if (!url) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [url]);

  // Wheel zoom. Registered natively with passive:false so preventDefault() is honoured.
  useEffect(() => {
    const node = containerRef.current;
    if (!url || !node) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      setZoom((current) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + direction * 0.25).toFixed(2))));
        if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
        return next;
      });
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [url]);

  if (!url) return null;

  const handlePointerDown = (e: React.MouseEvent) => {
    if (zoom <= MIN_ZOOM) return;
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y
    };
  };

  const handlePointerMove = (e: React.MouseEvent) => {
    if (!dragState.current.active) return;
    setOffset({
      x: dragState.current.originX + (e.clientX - dragState.current.startX),
      y: dragState.current.originY + (e.clientY - dragState.current.startY)
    });
  };

  const endDrag = () => {
    dragState.current.active = false;
  };

  // TouchList is the DOM global; React re-uses it for TouchEvent.touches.
  const touchDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchState.current = { active: true, startDistance: touchDistance(e.touches), startZoom: zoom };
      return;
    }
    if (e.touches.length === 1 && zoom > MIN_ZOOM) {
      dragState.current = {
        active: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        originX: offset.x,
        originY: offset.y
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pinchState.current.active && e.touches.length === 2) {
      const distance = touchDistance(e.touches);
      if (pinchState.current.startDistance > 0) {
        applyZoom(pinchState.current.startZoom * (distance / pinchState.current.startDistance));
      }
      return;
    }

    if (dragState.current.active && e.touches.length === 1) {
      setOffset({
        x: dragState.current.originX + (e.touches[0].clientX - dragState.current.startX),
        y: dragState.current.originY + (e.touches[0].clientY - dragState.current.startY)
      });
    }
  };

  const handleTouchEnd = () => {
    pinchState.current.active = false;
    dragState.current.active = false;
  };

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged question figure"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-5xl h-full max-h-[92vh] bg-slate-900 rounded-3xl border border-slate-700/70 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-700/70 bg-slate-900/95 shrink-0">
          <span className="text-[11px] sm:text-xs font-bold text-slate-300 truncate pr-2">
            {alt || "Question figure"}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => applyZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="text-[11px] font-mono font-bold text-slate-400 w-12 text-center tabular-nums">
              {zoomLabel}
            </span>

            <button
              type="button"
              onClick={() => applyZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={resetView}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer hidden sm:inline-flex"
              title="Open original image in a new tab"
              aria-label="Open original image in a new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-white transition-colors cursor-pointer"
              title="Close (Esc)"
              aria-label="Close enlarged image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image stage */}
        <div
          ref={containerRef}
          className={`flex-1 overflow-hidden flex items-center justify-center bg-slate-950/60 select-none ${
            zoom > MIN_ZOOM ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
          }`}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={() => applyZoom(zoom > MIN_ZOOM ? MIN_ZOOM : 2)}
        >
          {hasError ? (
            <div className="flex flex-col items-center gap-2 text-center px-6 py-10 text-slate-400">
              <ImageOff className="w-8 h-8 text-slate-500" />
              <p className="text-xs font-bold text-slate-300">This figure could not be loaded.</p>
              <p className="text-[11px] text-slate-500 max-w-xs">
                The image link may have expired or Firebase Storage may be unreachable. Please tell your
                teacher which question this was.
              </p>
            </div>
          ) : (
            <img
              src={url}
              alt={alt || "Enlarged question figure"}
              draggable={false}
              decoding="async"
              onError={() => setHasError(true)}
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full object-contain"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transition: dragState.current.active ? "none" : "transform 0.12s ease-out"
              }}
            />
          )}
        </div>

        {/* Hint bar */}
        <div className="px-4 py-2 border-t border-slate-700/70 bg-slate-900/95 shrink-0">
          <p className="text-[10px] text-slate-500 font-semibold text-center">
            Scroll or pinch to zoom · drag to pan · double-click to toggle · press Esc or tap outside to close
          </p>
        </div>
      </motion.div>
    </div>
  );
}
