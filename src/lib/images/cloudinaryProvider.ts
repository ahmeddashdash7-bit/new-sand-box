/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cloudinary image provider — UNSIGNED uploads only.
 *
 * ============================ SECURITY ============================
 * This module uses exactly two values, BOTH of which are public identifiers:
 *
 *   VITE_CLOUDINARY_CLOUD_NAME     already embedded in every image URL the app serves
 *   VITE_CLOUDINARY_UPLOAD_PRESET  a preset *name*; it authorises unsigned upload and nothing else
 *
 * The Cloudinary API key and API secret are NEVER referenced here, never imported, and must never
 * be given a VITE_ prefix anywhere in this project — any VITE_ variable is compiled into the
 * public bundle. Signed uploads (which would require the secret) need a server; the deliberate
 * trade-off is documented below.
 *
 * What an attacker who reads the bundle can do:  upload images to the account (quota abuse).
 * What they cannot do:                           read, delete, or reach the account/credentials.
 *
 * KNOWN LIMITATION — folder pinning is not cryptographically enforced. Cloudinary permits an
 * unsigned client to send a `folder` parameter. This module never sends one, so the preset's
 * configured folder applies to every upload the app makes, but a hostile caller posting directly
 * to the API could choose another folder. Only signed uploads close this. If it ever matters,
 * replace this provider with a signed one backed by a Cloudflare Worker holding the secret —
 * nothing outside src/lib/images/ needs to change.
 * ==================================================================
 */

import {
  DeleteOutcome,
  DisplayUrlOptions,
  ImageProvider,
  ImageUploadResult,
  QuestionImageRef,
  UploadOptions
} from "./types";
import { readImageDimensions, sanitizeFileName, validateQuestionImageFile } from "./validation";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim() || "";
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim() || "";

/**
 * Resource type is pinned in the URL path to `image`. Using `/image/upload` rather than
 * `/auto/upload` makes it structurally impossible for this app to create video, audio or raw
 * assets, regardless of what file is passed in.
 */
const UPLOAD_ENDPOINT = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const DELETE_BY_TOKEN_ENDPOINT = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/delete_by_token`;

const CLOUDINARY_HOST = "res.cloudinary.com";

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  original_filename?: string;
  delete_token?: string;
  error?: { message?: string };
}

function isConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

function missingConfigMessage(): string {
  const missing: string[] = [];
  if (!CLOUD_NAME) missing.push("VITE_CLOUDINARY_CLOUD_NAME");
  if (!UPLOAD_PRESET) missing.push("VITE_CLOUDINARY_UPLOAD_PRESET");
  return (
    `Image uploads are not configured. Missing ${missing.join(" and ")}. ` +
    "Create a .env.local file in the project root with these values, then restart the dev server."
  );
}

/** Turns a Cloudinary failure into something a teacher can act on. */
function describeUploadError(status: number, body: string): string {
  let apiMessage = "";
  try {
    apiMessage = (JSON.parse(body) as CloudinaryUploadResponse)?.error?.message || "";
  } catch {
    /* body was not JSON */
  }

  if (status === 400 && /preset/i.test(apiMessage)) {
    return (
      `Cloudinary rejected the upload preset "${UPLOAD_PRESET}". ` +
      "Check that the preset exists and that its Signing Mode is set to Unsigned."
    );
  }
  if (status === 401 || status === 403) {
    return (
      "Cloudinary refused the upload. The preset is most likely not set to Unsigned, " +
      "or the file type is not in the preset's allowed formats."
    );
  }
  if (status === 413) {
    return "Cloudinary rejected the file as too large. Please use an image under 5 MB.";
  }
  if (status === 420 || status === 429) {
    return "Cloudinary rate limit or monthly quota reached. Please try again later.";
  }
  if (apiMessage) return `Cloudinary error: ${apiMessage}`;
  return `The image could not be uploaded (HTTP ${status}).`;
}

/**
 * Uploads via XMLHttpRequest rather than fetch: only XHR exposes upload progress events, which
 * the teacher-facing progress bar needs.
 */
function postToCloudinary(
  form: FormData,
  onProgress?: (percent: number) => void
): Promise<CloudinaryUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", UPLOAD_ENDPOINT, true);

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || !event.total) return;
      // Cap at 95%; the remainder covers response parsing.
      onProgress(Math.max(1, Math.round((event.loaded / event.total) * 95)));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as CloudinaryUploadResponse);
        } catch {
          reject(new Error("Cloudinary returned a response that could not be read."));
        }
        return;
      }
      reject(new Error(describeUploadError(xhr.status, xhr.responseText)));
    };

    xhr.onerror = () =>
      reject(
        new Error(
          "Could not reach Cloudinary. Check your internet connection and that the cloud name is correct."
        )
      );
    xhr.ontimeout = () => reject(new Error("The upload timed out. Please try again."));

    xhr.timeout = 120000;
    xhr.send(form);
  });
}

async function upload(file: File, options: UploadOptions = {}): Promise<ImageUploadResult> {
  if (!isConfigured()) {
    throw new Error(missingConfigMessage());
  }

  // Application-side validation happens before any bytes leave the browser.
  const validation = validateQuestionImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || "This file cannot be uploaded.");
  }

  options.onProgress?.(1);

  const { width, height } = await readImageDimensions(file);

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  // A readable name only. NOT a folder: no `folder` / `asset_folder` / `public_id` parameter is
  // ever sent, so the destination folder is whatever the preset dictates.
  form.append("filename_override", `${sanitizeFileName(file.name)}-${Date.now()}`);

  const response = await postToCloudinary(form, options.onProgress);

  if (!response.secure_url || !response.public_id) {
    throw new Error("Cloudinary did not return an image URL. The upload preset may be misconfigured.");
  }

  options.onProgress?.(100);

  return {
    imageUrl: response.secure_url,
    imagePath: response.public_id,
    imageProvider: "cloudinary",
    imageName: file.name,
    imageWidth: response.width || width,
    imageHeight: response.height || height,
    imageUploadedAt: Date.now(),
    // Present only when "Return delete token" is enabled on the preset.
    deleteToken: response.delete_token
  };
}

function owns(ref: QuestionImageRef): boolean {
  if (ref.imageProvider === "cloudinary") return true;
  // Fallback for references written before imageProvider existed.
  return Boolean(!ref.imageProvider && ref.imageUrl && ref.imageUrl.includes(CLOUDINARY_HOST));
}

/**
 * Deletion is only possible from the browser inside the delete token's ~10 minute window;
 * anything later needs the API secret and therefore a server. Returns "orphaned" in that case so
 * the caller can record the asset for future cleanup instead of pretending it was removed.
 */
async function remove(
  ref: QuestionImageRef,
  options: { deleteToken?: string } = {}
): Promise<DeleteOutcome> {
  if (!owns(ref)) return "not-owned";
  if (!isConfigured() || !options.deleteToken) return "orphaned";

  try {
    const form = new FormData();
    form.append("token", options.deleteToken);

    const res = await fetch(DELETE_BY_TOKEN_ENDPOINT, { method: "POST", body: form });
    // Typically 400 once the token has expired, which simply means "too late to delete".
    return res.ok ? "deleted" : "orphaned";
  } catch {
    return "orphaned";
  }
}

/**
 * Injects `f_auto,q_auto` so Cloudinary serves WebP/AVIF at an automatically chosen quality.
 * This roughly halves the bytes students download on mobile — which matters because the free
 * tier's bandwidth is the scarcer resource — with no visible loss on diagrams and charts.
 */
function buildDisplayUrl(ref: QuestionImageRef, options: DisplayUrlOptions = {}): string {
  const url = ref.imageUrl || "";
  if (!url || !owns(ref)) return url;

  const marker = "/image/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return url;

  const prefix = url.slice(0, markerIndex + marker.length);
  const rest = url.slice(markerIndex + marker.length);

  // Leave already-transformed URLs alone rather than stacking transformations.
  if (/^[a-z]{1,3}_[^/]+\//.test(rest)) return url;

  const transforms = ["f_auto", "q_auto"];
  if (options.maxWidth && Number.isFinite(options.maxWidth)) {
    // c_limit only ever downscales, so a small diagram is never upscaled and blurred.
    transforms.push(`c_limit`, `w_${Math.round(options.maxWidth)}`);
  }

  return `${prefix}${transforms.join(",")}/${rest}`;
}

export const cloudinaryProvider: ImageProvider = {
  id: "cloudinary",
  isConfigured,
  owns,
  upload,
  delete: remove,
  buildDisplayUrl
};

/** Exposed so the UI can render a precise setup message instead of a generic failure. */
export const cloudinaryConfigError = (): string | null =>
  isConfigured() ? null : missingConfigMessage();
