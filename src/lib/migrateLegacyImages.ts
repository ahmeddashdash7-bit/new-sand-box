/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OPTIONAL one-off migration: legacy base64 question images -> the configured image provider.
 *
 * This migration is NOT required. Questions saved by the original implementation store the image
 * inline as a `data:` URL in `imageUrl`, and every screen still renders those correctly. Run this
 * only to reclaim Firestore document size and move existing figures alongside new uploads.
 *
 * HOW TO RUN
 *   1. Configure the provider first (.env.local), otherwise every row will fail.
 *   2. Start the app in development:            bun run dev
 *   3. Open it in the browser and log in as the teacher.
 *   4. Open DevTools -> Console and run:        await __migrateQuestionImages()
 *      For a dry run that changes nothing:      await __migrateQuestionImages({ dryRun: true })
 *
 * The helper is only attached to `window` in development builds (see the bottom of this file).
 *
 * SAFETY
 *   - Only documents whose imageUrl starts with "data:" are touched.
 *   - Built-in biology diagram SVGs are skipped deliberately: they are tiny and belong inline.
 *   - Each document is migrated independently; one failure never aborts the run.
 *   - The Firestore document is updated only AFTER its upload succeeds, so a failure leaves the
 *     original working base64 image untouched.
 *   - Re-running is safe: already-migrated questions no longer match and are skipped.
 */

import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { isImageUploadConfigured, imageUploadConfigError, uploadQuestionImage } from "./images/imageService";

export interface MigrationReport {
  scanned: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: { questionId: string; error: string }[];
}

/** Converts a `data:` URL into a File without touching the network. */
function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;

  const contentType = match[1] || "image/jpeg";
  const isBase64 = Boolean(match[2]);
  const payload = match[3];

  try {
    let bytes: Uint8Array;
    if (isBase64) {
      const binary = atob(payload);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
    return new File([bytes], fileName, { type: contentType });
  } catch {
    return null;
  }
}

function extensionFor(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  return "jpg";
}

export async function migrateQuestionImagesToProvider(
  options: { dryRun?: boolean } = {}
): Promise<MigrationReport> {
  const { dryRun = false } = options;
  const report: MigrationReport = { scanned: 0, migrated: 0, skipped: 0, failed: 0, errors: [] };

  if (!dryRun && !isImageUploadConfigured()) {
    throw new Error(imageUploadConfigError() || "Image uploads are not configured.");
  }

  const snapshot = await getDocs(collection(db, "questions"));
  report.scanned = snapshot.size;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const imageUrl: string | undefined = data.imageUrl;

    // Only inline base64 images need moving. The built-in biology diagram library uses tiny SVG
    // data URLs which are intentionally left inline.
    if (!imageUrl || !imageUrl.startsWith("data:") || imageUrl.startsWith("data:image/svg")) {
      report.skipped++;
      continue;
    }

    const questionId = String(data.id || docSnap.id);

    try {
      const fileName = `${questionId}-migrated.${extensionFor(imageUrl)}`;
      const file = dataUrlToFile(imageUrl, fileName);
      if (!file) {
        throw new Error("Could not decode the inline data URL.");
      }

      if (dryRun) {
        console.info(`[dry-run] would migrate ${questionId} (${file.size} bytes, ${file.type})`);
        report.migrated++;
        continue;
      }

      const uploaded = await uploadQuestionImage(file, { questionId });

      // Only now is the document rewritten — the base64 original stayed valid until this point.
      await setDoc(
        doc(db, "questions", docSnap.id),
        {
          imageUrl: uploaded.imageUrl,
          imagePath: uploaded.imagePath,
          imageProvider: uploaded.imageProvider,
          imageName: data.imageName || uploaded.imageName,
          imageWidth: uploaded.imageWidth || data.imageWidth || null,
          imageHeight: uploaded.imageHeight || data.imageHeight || null,
          imageUploadedAt: data.imageUploadedAt || uploaded.imageUploadedAt
        },
        { merge: true }
      );

      report.migrated++;
      console.info(`Migrated ${questionId} -> ${uploaded.imagePath}`);
    } catch (err) {
      report.failed++;
      report.errors.push({ questionId, error: (err as Error)?.message || String(err) });
      console.error(`Failed to migrate ${questionId}:`, err);
    }
  }

  console.info("Question image migration finished:", report);
  return report;
}

// Expose the helper on window in development builds only.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__migrateQuestionImages = migrateQuestionImagesToProvider;
}
