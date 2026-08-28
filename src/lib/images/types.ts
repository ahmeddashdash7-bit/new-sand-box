/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider-agnostic contracts for question image storage.
 *
 * Nothing in this file mentions a specific vendor. The rest of the application (Question Bank,
 * Quiz Builder, Homework, Student Assessment, reports) depends only on these types and on
 * imageService — never on a concrete provider — so the storage backend can be replaced without
 * touching any feature code.
 */

export type ImageProviderId =
  /** Uploaded by us to Cloudinary. */
  | "cloudinary"
  /** Legacy base64 / built-in SVG data URL embedded directly in the document. */
  | "inline"
  /** An arbitrary https URL the teacher pasted. We do not own the file. */
  | "external";

/**
 * The image reference as persisted on a question document in Firestore.
 * Only references are ever stored — never image bytes.
 */
export interface QuestionImageRef {
  /** Directly renderable URL. For Cloudinary this is `secure_url`. */
  imageUrl?: string;
  /** Provider-scoped identifier. For Cloudinary this is `public_id`. */
  imagePath?: string;
  /** Which backend owns the file. Absent on documents written before providers existed. */
  imageProvider?: ImageProviderId;
}

/** Everything a successful upload produces. */
export interface ImageUploadResult {
  imageUrl: string;
  imagePath: string;
  imageProvider: ImageProviderId;
  imageName: string;
  imageWidth?: number;
  imageHeight?: number;
  imageUploadedAt: number;
  /**
   * Short-lived token that permits deletion straight from the browser (~10 minutes).
   *
   * Deliberately NOT persisted to Firestore: it expires quickly, so storing it would only create
   * the illusion that later deletion is possible. It is held in component state to cover the
   * common "wrong image, swap it immediately" case.
   */
  deleteToken?: string;
}

/**
 * What actually happened to the remote file.
 *  - "deleted"   the asset was really removed from the provider
 *  - "orphaned"  the reference is gone but the remote file remains (no credential to delete it)
 *  - "not-owned" nothing to delete: inline data URL, external link, or unknown provider
 */
export type DeleteOutcome = "deleted" | "orphaned" | "not-owned";

export interface UploadOptions {
  /** Used to build a recognisable file name. Never used to choose a remote folder. */
  questionId?: string;
  onProgress?: (percent: number) => void;
}

export interface DisplayUrlOptions {
  /** Hint for the widest rendered size, so the provider can serve a smaller variant. */
  maxWidth?: number;
}

export interface ImageProvider {
  readonly id: ImageProviderId;

  /** False when the provider is missing configuration; the UI surfaces a setup message. */
  isConfigured(): boolean;

  /** True when this provider is responsible for the given reference. */
  owns(ref: QuestionImageRef): boolean;

  /** Throws on failure so callers never persist a broken reference. */
  upload(file: File, options?: UploadOptions): Promise<ImageUploadResult>;

  /** Must never throw: deletion is best-effort cleanup, not a user-blocking operation. */
  delete(ref: QuestionImageRef, options?: { deleteToken?: string }): Promise<DeleteOutcome>;

  /** Returns a renderable URL, optionally optimised. Falls back to the stored URL. */
  buildDisplayUrl(ref: QuestionImageRef, options?: DisplayUrlOptions): string;
}
