/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider-agnostic upload validation.
 *
 * This runs in the application BEFORE any bytes leave the browser, so an oversized or wrong-typed
 * file is rejected without a network round trip and without ever creating a remote asset.
 */

export const QUESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const QUESTION_IMAGE_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

/** File input `accept` attribute, kept in sync with the allowed MIME types above. */
export const QUESTION_IMAGE_ACCEPT_ATTRIBUTE = "image/png, image/jpeg, image/jpg, image/webp";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a candidate question image.
 *
 * Note this is a client-side guard for the teacher's benefit, not a security boundary: a hostile
 * caller could bypass it by posting directly to the provider. The provider-side limits configured
 * in the Cloudinary console are the actual backstop.
 */
export function validateQuestionImageFile(file: File): ValidationResult {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  if (file.size === 0) {
    return { valid: false, error: "This file is empty. Please choose a valid image." };
  }

  if (!QUESTION_IMAGE_ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: "Unsupported file type. Please choose a PNG, JPG, JPEG or WEBP image."
    };
  }

  if (file.size > QUESTION_IMAGE_MAX_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `This image is ${sizeMb} MB. The maximum allowed size is 5 MB.` };
  }

  return { valid: true };
}

/** True for inline base64 / SVG data URLs, which own no remote file. */
export function isDataUrl(url?: string): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

/**
 * Reads intrinsic pixel dimensions without modifying the file.
 * Resolves with empty dimensions rather than rejecting — metadata is a nice-to-have and must
 * never block an upload.
 */
export function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve({});
      return;
    }

    const img = new Image();
    const done = (result: { width?: number; height?: number }) => {
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    img.onload = () => done({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
    img.onerror = () => done({});
    img.src = objectUrl;
  });
}

/** Makes a filename safe to use as part of a remote asset name. */
export function sanitizeFileName(name: string): string {
  const fallback = "image";
  if (!name) return fallback;
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  const cleaned = withoutExtension
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(-60);
  return cleaned || fallback;
}
