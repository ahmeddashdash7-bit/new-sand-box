/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * SECURITY: every VITE_-prefixed variable is compiled into the public JavaScript bundle and is
 * readable by anyone who opens the site. Only values that are safe to publish may live here.
 *
 * The two Cloudinary values below are public identifiers, not credentials:
 *   - the cloud name already appears inside every image URL the app serves
 *   - the upload preset is a preset *name*; it grants unsigned upload only
 *
 * NEVER add CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET here, and never give them a VITE_ prefix
 * anywhere. Signing requires a server; see src/lib/images/cloudinaryProvider.ts.
 */
interface ImportMetaEnv {
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
