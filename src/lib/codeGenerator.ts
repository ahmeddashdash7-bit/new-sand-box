/**
 * Assessment Code Generator & Validator
 * Science Garden Platform
 */

const ALPHANUMERIC_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generates a random uppercase alphanumeric assessment code (6 to 8 characters).
 * Example: AB7XQ2, X9K4M1
 */
export function generateAssessmentCode(length: number = 6): string {
  const targetLength = Math.max(6, Math.min(8, length));
  let result = "";
  for (let i = 0; i < targetLength; i++) {
    const randomIndex = Math.floor(Math.random() * ALPHANUMERIC_CHARS.length);
    result += ALPHANUMERIC_CHARS.charAt(randomIndex);
  }
  return result;
}

/**
 * THE canonical assessment code format: 6-8 uppercase alphanumeric characters, no separators.
 *
 * Every producer, validator, store, display and student-join lookup in the app must agree on
 * this one shape. Anything else (e.g. the old "SG-123456" form, which contains a hyphen) is
 * rejected here and regenerated, which is what previously caused the code shown to the teacher
 * to differ from the code actually saved in Firestore.
 */
export const ASSESSMENT_CODE_PATTERN = /^[A-Z0-9]{6,8}$/;

/**
 * Normalizes a code to canonical form (trim + uppercase).
 * Returns null when the input cannot be a valid canonical code.
 */
export function normalizeAssessmentCode(code: string | undefined | null): string | null {
  if (!code) return null;
  const clean = String(code).trim().toUpperCase();
  return ASSESSMENT_CODE_PATTERN.test(clean) ? clean : null;
}

/**
 * Validates whether a given string is a valid assessment code format (6-8 uppercase alphanumeric chars).
 */
export function isValidAssessmentCode(code: string): boolean {
  return normalizeAssessmentCode(code) !== null;
}

// ==========================================
// Student access codes
// ==========================================

/**
 * Ambiguity-free alphabet: no O/0 and no I/1, because these codes are read off paper and typed
 * by students. Exactly 32 characters, which matters for the unbiased sampling below.
 */
export const STUDENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Length of NEWLY issued student codes — the "Var-Char" count shown in the student manager.
 *
 * This was 3, giving 32^3 = 32,768 possible codes: enumerable exhaustively in seconds. That was
 * tolerable while a code was only a name-prefill convenience. It is not tolerable now that the
 * code is the anchor for one-attempt enforcement (see studentCodes in firebase.ts), because
 * guessing a code means being able to consume someone else's attempt.
 *
 * 4 characters gives 32^4 = 1,048,576 combinations. That is a 32x improvement on 3, and is the
 * length the student-facing quiz flow is built around. It is NOT large enough to consider the
 * code a secret against an automated attacker — see the note on studentCodes brute-forcing in the
 * Stage 2 verification. Keep codes short for usability, and rely on the claim-once binding and
 * the attempt document rules for enforcement, not on the code being unguessable.
 *
 * Codes already issued at length 3 keep working — see normalizeStudentCode.
 */
export const STUDENT_CODE_LENGTH = 4;

/** Accepts legacy 3-character codes as well as currently issued STUDENT_CODE_LENGTH ones. */
export const STUDENT_CODE_PATTERN = /^[A-Z0-9]{3,8}$/;

/**
 * Draws unbiased indices into STUDENT_CODE_ALPHABET.
 *
 * `Math.random()` is not appropriate for a value that gates attempt ownership. 256 is an exact
 * multiple of the 32-character alphabet, so a plain `byte % 32` carries no modulo bias.
 * Falls back to Math.random only where crypto is unavailable, which in practice does not happen
 * in any browser this app supports.
 */
function randomCodeChars(length: number): string {
  const alphabet = STUDENT_CODE_ALPHABET;
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < length; i++) {
      out += alphabet.charAt(bytes[i] % alphabet.length);
    }
    return out;
  }

  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

/**
 * Generates a student access code, avoiding any code in `existingCodes`.
 *
 * The caller passes the codes it already knows about. That is a convenience against accidental
 * collision only — it is NOT the uniqueness guarantee. Uniqueness is enforced where it can be:
 * by the studentCodes/{CODE} document id in Firestore.
 */
export function generateStudentCode(existingCodes: Set<string> = new Set()): string {
  let code = "";
  let attempts = 0;
  do {
    code = randomCodeChars(STUDENT_CODE_LENGTH);
    attempts++;
  } while (existingCodes.has(code) && attempts < 1000);
  return code;
}

/**
 * Normalizes a student code to canonical form (trim, uppercase, strip separators).
 * Returns null when the input cannot be a valid code.
 */
export function normalizeStudentCode(code: string | undefined | null): string | null {
  if (!code) return null;
  const clean = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return STUDENT_CODE_PATTERN.test(clean) ? clean : null;
}
