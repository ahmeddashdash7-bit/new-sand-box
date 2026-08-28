/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { Upload, Image as ImageIcon, Trash2, Link, RefreshCw, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { deleteQuestionImageIfUnreferenced } from "../lib/firebase";
import {
  uploadQuestionImage,
  validateQuestionImageFile,
  isImageUploadConfigured,
  imageUploadConfigError,
  isDataUrl,
  QUESTION_IMAGE_ACCEPT_ATTRIBUTE
} from "../lib/images/imageService";

export interface QuestionImageData {
  imageUrl?: string;
  imagePath?: string;
  imageProvider?: "cloudinary" | "inline" | "external";
  imageName?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageUploadedAt?: number;
}

interface QuestionImageUploaderProps {
  questionId?: string;
  imageUrl?: string;
  imagePath?: string;
  imageProvider?: QuestionImageData["imageProvider"];
  imageName?: string;
  imageWidth?: number;
  imageHeight?: number;
  onChangeImage: (
    url: string | undefined,
    metadata?: {
      imagePath?: string;
      imageProvider?: QuestionImageData["imageProvider"];
      imageName?: string;
      imageWidth?: number;
      imageHeight?: number;
      imageUploadedAt?: number;
    }
  ) => void;
  onOpenDiagramPicker?: () => void;
}

export default function QuestionImageUploader({
  questionId,
  imageUrl,
  imagePath,
  imageProvider,
  imageName,
  imageWidth,
  imageHeight,
  onChangeImage,
  onOpenDiagramPicker
}: QuestionImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [tempUrl, setTempUrl] = useState("");

  /**
   * Short-lived token (~10 min) that permits deleting the just-uploaded asset straight from the
   * browser. A ref rather than state: it must never trigger a re-render, and it is deliberately
   * never persisted to Firestore because it expires almost immediately.
   */
  const deleteTokenRef = useRef<string | undefined>(undefined);

  const isLegacyInlineImage = isDataUrl(imageUrl);
  const uploadsConfigured = isImageUploadConfigured();
  const configError = imageUploadConfigError();

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate BEFORE any bytes leave the browser, so an invalid file never creates a
    // remote asset and never costs upload bandwidth.
    const validation = validateQuestionImageFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || "This file cannot be uploaded.");
      return;
    }

    // Remember what we may need to clean up, but only AFTER the replacement succeeds.
    const previousRef = { imageUrl, imagePath, imageProvider };
    const previousDeleteToken = deleteTokenRef.current;

    try {
      setIsUploading(true);
      setUploadProgress(1);

      const res = await uploadQuestionImage(file, { questionId, onProgress: setUploadProgress });

      // The delete token is intentionally kept in memory only and never persisted: it expires in
      // roughly ten minutes, so storing it would only imply a capability we do not have.
      deleteTokenRef.current = res.deleteToken;

      onChangeImage(res.imageUrl, {
        imagePath: res.imagePath,
        imageProvider: res.imageProvider,
        imageName: res.imageName,
        imageWidth: res.imageWidth,
        imageHeight: res.imageHeight,
        imageUploadedAt: res.imageUploadedAt
      });

      setSuccessMessage("Image uploaded. Remember to save the question.");

      // The new image is safely referenced now, so the old file can go — but only if no other
      // question (e.g. a copy inside an already-published quiz) still points at it.
      if (previousRef.imageUrl && previousRef.imagePath !== res.imagePath) {
        deleteQuestionImageIfUnreferenced(previousRef, questionId || "", {
          deleteToken: previousDeleteToken
        }).catch(() => {
          /* an orphaned file is harmless and already recorded; never surface it to the teacher */
        });
      }
    } catch (err: unknown) {
      // Nothing is written to the question on failure, so a broken reference can never be saved.
      console.error("Question image upload failed:", err);
      setErrorMessage((err as Error)?.message || "The image could not be uploaded.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset so picking the same file twice in a row still fires onChange.
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveImage = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsRemoving(true);

    try {
      if (imageUrl) {
        // Never delete a figure that a published quiz/homework copy still displays. When the
        // remote file cannot be deleted (delete token expired) this records an orphan instead
        // of silently pretending it was removed.
        await deleteQuestionImageIfUnreferenced(
          { imageUrl, imagePath, imageProvider },
          questionId || "",
          { deleteToken: deleteTokenRef.current }
        );
      }
      deleteTokenRef.current = undefined;

      // Empty string (not undefined) is the explicit "clear this image" signal that survives
      // Firestore's merge writes. Undefined would mean "leave whatever is stored alone".
      onChangeImage("", {
        imagePath: "",
        imageProvider: undefined,
        imageName: undefined,
        imageWidth: undefined,
        imageHeight: undefined,
        imageUploadedAt: undefined
      });
      setSuccessMessage("Image removed. Remember to save the question.");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleApplyUrl = () => {
    const clean = tempUrl.trim();
    if (!clean) return;

    if (!/^https?:\/\//i.test(clean)) {
      setErrorMessage("Please paste a full image URL starting with http:// or https://");
      return;
    }

    setErrorMessage(null);
    // External URLs own no Storage object, so imagePath stays empty and nothing is ever deleted.
    onChangeImage(clean, {
      imagePath: "",
      imageProvider: "external",
      imageName: "External image URL",
      imageUploadedAt: Date.now()
    });
    setShowUrlInput(false);
    setTempUrl("");
    setSuccessMessage("External image linked. Remember to save the question.");
  };

  return (
    <div className="space-y-2.5 bg-slate-50/90 p-4 rounded-2xl border border-slate-200/90 text-left font-sans" dir="ltr">
      {/* Header Label */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-indigo-600" />
          <span>Question figure / diagram (optional)</span>
        </label>

        {imageUrl && !isUploading && (
          <button
            type="button"
            onClick={handleRemoveImage}
            disabled={isRemoving}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-xl transition-all disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> {isRemoving ? "Removing..." : "Remove image"}
          </button>
        )}
      </div>

      {/* Setup banner: uploads are impossible until the image provider is configured. */}
      {!uploadsConfigured && configError && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed font-semibold">{configError}</span>
        </div>
      )}

      {/* Success Banner */}
      {successMessage && !errorMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="flex-1">{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 text-xs font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Uploading Progress Bar */}
      {isUploading && (
        <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              Uploading image...
            </span>
            <span className="tabular-nums">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-indigo-200/80 h-2 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full transition-all duration-200 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Image Preview OR Upload Dropzone */}
      {!isUploading && imageUrl ? (
        <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white p-3 space-y-3 shadow-sm">
          <div className="max-h-56 flex items-center justify-center bg-slate-900/5 rounded-xl p-2 overflow-hidden">
            <img
              src={imageUrl}
              alt={imageName || "Question figure"}
              loading="lazy"
              decoding="async"
              className="max-h-48 max-w-full object-contain rounded-lg shadow-sm"
              referrerPolicy="no-referrer"
            />
          </div>

          {isLegacyInlineImage && (
            <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              This figure is stored inline from an older version of the app. It still works everywhere.
              Re-upload it to move the file to the image host.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-slate-800 truncate max-w-[200px]">
                {imageName || "Attached figure"}
              </span>
              {imageWidth && imageHeight && (
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono">
                  {imageWidth} × {imageHeight} px
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs cursor-pointer transition-colors border border-indigo-200">
                <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                <span>Replace image</span>
                <input
                  type="file"
                  accept={QUESTION_IMAGE_ACCEPT_ATTRIBUTE}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={isRemoving}
                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                title="Remove image"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : !isUploading && (
        <div className="space-y-2">
          {showUrlInput ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                placeholder="Paste a direct image URL (https://...)"
                className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={handleApplyUrl}
                className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setShowUrlInput(false)}
                className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`sm:col-span-2 flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl cursor-pointer transition-all border-2 border-dashed text-center ${
                  isDragging
                    ? "bg-indigo-50 border-indigo-500 scale-[1.01]"
                    : "bg-white hover:bg-indigo-50/40 border-slate-300 hover:border-indigo-400"
                }`}
              >
                <Upload className="w-5 h-5 text-indigo-600" />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-indigo-950 block">
                    Click to upload a figure, or drag it here 📁
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium block">
                    PNG, JPG, JPEG or WEBP · up to 5 MB · uploaded at full quality
                  </span>
                </div>
                <input
                  type="file"
                  accept={QUESTION_IMAGE_ACCEPT_ATTRIBUTE}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setShowUrlInput(true)}
                className="flex flex-col items-center justify-center gap-1.5 p-4 bg-white hover:bg-slate-100 border border-slate-200 rounded-2xl cursor-pointer transition-all text-xs font-bold text-slate-700"
              >
                <Link className="w-5 h-5 text-slate-500" />
                <span>Link an image URL 🔗</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

