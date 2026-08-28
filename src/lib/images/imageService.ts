/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The application's ONLY entry point for question image storage.
 *
 * Feature code (Question Bank, Quiz Builder, Homework, Student Assessment, reports) imports from
 * here and never from a concrete provider. Swapping Cloudinary for R2, a signed-upload Worker or
 * Firebase Storage means editing the provider registry below and nothing else.
 */

import {
  DeleteOutcome,
  DisplayUrlOptions,
  ImageProvider,
  ImageUploadResult,
  QuestionImageRef,
  UploadOptions
} from "./types";
import { cloudinaryConfigError, cloudinaryProvider } from "./cloudinaryProvider";
import { isDataUrl } from "./validation";

export type {
  DeleteOutcome,
  DisplayUrlOptions,
  ImageProviderId,
  ImageUploadResult,
  QuestionImageRef,
  UploadOptions
} from "./types";

export {
  QUESTION_IMAGE_MAX_BYTES,
  QUESTION_IMAGE_ALLOWED_TYPES,
  QUESTION_IMAGE_ACCEPT_ATTRIBUTE,
  validateQuestionImageFile,
  isDataUrl
} from "./validation";

/**
 * Read-only provider for legacy base64 / built-in SVG data URLs. These live inside the Firestore
 * document itself, so there is no remote file to delete and nothing to optimise.
 */
const inlineProvider: ImageProvider = {
  id: "inline",
  isConfigured: () => true,
  owns: (ref) => ref.imageProvider === "inline" || isDataUrl(ref.imageUrl),
  upload: () => {
    throw new Error("Inline images are read-only and cannot be uploaded.");
  },
  delete: async () => "not-owned",
  buildDisplayUrl: (ref) => ref.imageUrl || ""
};

/** Read-only provider for https URLs the teacher pasted. We do not own those files. */
const externalProvider: ImageProvider = {
  id: "external",
  isConfigured: () => true,
  owns: (ref) => ref.imageProvider === "external" || Boolean(ref.imageUrl && /^https?:\/\//i.test(ref.imageUrl)),
  upload: () => {
    throw new Error("External images are references only and cannot be uploaded.");
  },
  delete: async () => "not-owned",
  buildDisplayUrl: (ref) => ref.imageUrl || ""
};

/** The provider new uploads are written to. */
const activeUploadProvider: ImageProvider = cloudinaryProvider;

/**
 * Resolution order matters: inline first (a data: URL is never anything else), then Cloudinary,
 * then the generic external fallback.
 */
const providers: ImageProvider[] = [inlineProvider, cloudinaryProvider, externalProvider];

function resolveProvider(ref: QuestionImageRef): ImageProvider | null {
  if (!ref || !ref.imageUrl) return null;
  return providers.find((p) => p.owns(ref)) || null;
}

/** True when uploads are usable. False means required configuration is missing. */
export function isImageUploadConfigured(): boolean {
  return activeUploadProvider.isConfigured();
}

/** A precise setup message when uploads are unavailable, otherwise null. */
export function imageUploadConfigError(): string | null {
  return cloudinaryConfigError();
}

/**
 * Uploads a question image and returns the reference metadata to persist.
 * Throws on any failure, so a broken reference is never saved to Firestore.
 */
export function uploadQuestionImage(file: File, options?: UploadOptions): Promise<ImageUploadResult> {
  return activeUploadProvider.upload(file, options);
}

/**
 * Best-effort removal of the remote asset. Never throws.
 *
 * Returns "orphaned" when the file could not be deleted (for Cloudinary, once the short-lived
 * delete token has expired). Callers should record that outcome rather than assume success.
 */
export async function deleteQuestionImage(
  ref: QuestionImageRef,
  options?: { deleteToken?: string }
): Promise<DeleteOutcome> {
  const provider = resolveProvider(ref);
  if (!provider) return "not-owned";

  try {
    return await provider.delete(ref, options);
  } catch {
    return "orphaned";
  }
}

/**
 * Renderable URL for a stored reference, optimised where the provider supports it.
 * Safe to call with any reference, including legacy ones.
 */
export function buildQuestionImageDisplayUrl(
  ref: QuestionImageRef,
  options?: DisplayUrlOptions
): string {
  const provider = resolveProvider(ref);
  return provider ? provider.buildDisplayUrl(ref, options) : ref?.imageUrl || "";
}
