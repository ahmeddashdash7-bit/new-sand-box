/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ImageOff, Maximize2, Loader2 } from "lucide-react";
import { Question } from "../types";
import { buildQuestionImageDisplayUrl } from "../lib/images/imageService";

interface QuestionImageProps {
  question: Pick<
    Question,
    "imageUrl" | "imageName" | "imageWidth" | "imageHeight" | "imagePath" | "imageProvider"
  >;
  /** Called with the image URL when the student asks to enlarge it. */
  onEnlarge?: (url: string, alt: string) => void;
  /** Tailwind max-height class for the inline (un-enlarged) rendering. */
  maxHeightClass?: string;
  className?: string;
}

/**
 * Inline question figure.
 *
 * Renders nothing when the question has no image, so image support stays fully optional and
 * existing image-less questions are completely unaffected.
 *
 * - object-contain + intrinsic width/height keeps the aspect ratio exact (no distortion) and
 *   reserves layout space so answer options do not jump once the image decodes.
 * - loading="lazy" defers off-screen figures; the provider serves long-lived cache headers, so
 *   revisiting a question does not refetch the image.
 * - A load failure renders an explicit message instead of a blank gap.
 */
export default function QuestionImage({
  question,
  onEnlarge,
  maxHeightClass = "max-h-72",
  className = ""
}: QuestionImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const { imageUrl, imageName, imageWidth, imageHeight } = question;
  if (!imageUrl) return null;

  const altText = imageName || "Question figure";
  const isInteractive = Boolean(onEnlarge) && status !== "error";

  // Provider-optimised variant (auto WebP/AVIF + auto quality) where supported, which roughly
  // halves the bytes a student on mobile data downloads. Falls back to the stored URL.
  const inlineSrc = buildQuestionImageDisplayUrl(question, { maxWidth: 1200 });
  // The lightbox gets a larger variant so zooming stays sharp.
  const enlargedSrc = buildQuestionImageDisplayUrl(question, { maxWidth: 2000 });

  if (status === "error") {
    return (
      <div
        className={`w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5 ${className}`}
        role="alert"
      >
        <ImageOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-amber-900">The figure for this question could not be loaded.</p>
          <p className="text-[11px] text-amber-700 font-medium">
            You can still answer the question. Please let your teacher know if the figure is required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <figure className={`w-full space-y-1 ${className}`}>
      <div
        onClick={isInteractive ? () => onEnlarge?.(enlargedSrc, altText) : undefined}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-label={isInteractive ? `Enlarge figure: ${altText}` : undefined}
        onKeyDown={
          isInteractive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEnlarge?.(enlargedSrc, altText);
                }
              }
            : undefined
        }
        className={`relative w-full bg-slate-50 border border-slate-200 rounded-2xl p-2 flex items-center justify-center overflow-hidden group ${
          isInteractive ? "cursor-zoom-in hover:border-indigo-300 transition-colors" : ""
        }`}
      >
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
          </div>
        )}

        <img
          src={inlineSrc}
          alt={altText}
          width={imageWidth || undefined}
          height={imageHeight || undefined}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`w-auto max-w-full ${maxHeightClass} object-contain rounded-xl`}
        />

        {isInteractive && status === "loaded" && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-slate-900/75 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <Maximize2 className="w-3 h-3" />
            Tap to enlarge
          </span>
        )}
      </div>

      {isInteractive && (
        <figcaption className="text-[10px] text-slate-400 font-semibold text-center sm:hidden">
          Tap the figure to enlarge and zoom
        </figcaption>
      )}
    </figure>
  );
}

