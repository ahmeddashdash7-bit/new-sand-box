/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authentication — backed entirely by Firebase Authentication.
 *
 * ============================ WHAT CHANGED AND WHY ============================
 * This module previously implemented its own authentication in the browser:
 *   - a hardcoded DEFAULT_USERS array containing `teacher` / `123`, which was compiled into
 *     the public JavaScript bundle and auto-seeded into localStorage on first read, so those
 *     credentials worked on any fresh browser;
 *   - a localStorage "user database" (`science_garden_users_db`) holding plaintext passwords;
 *   - a plaintext `!==` password comparison performed in the browser;
 *   - a localStorage session key (`science_garden_current_user`) treated as the authority on
 *     who was logged in.
 *
 * All of that is gone. Firebase Auth is now the single source of truth: credentials are
 * verified server-side, and the session is restored after a page refresh by the SDK's own
 * persistence rather than by anything this app writes.
 *
 * ============================== SCOPE / HONESTY ==============================
 * Stage 1 replaces AUTHENTICATION only. It does NOT yet provide AUTHORIZATION:
 *
 *   - Firestore rules are still permissive (`allow read, write: if true`), so being signed in
 *     grants no additional privilege and being signed out removes none. Nothing here protects
 *     data yet.
 *   - `role` below is a UI-level convenience derived from Firebase's `isAnonymous` flag. It is
 *     NOT a security boundary and must never be treated as one. The enforceable teacher check
 *     (`isTeacher()` in Firestore rules) is a later stage.
 * =============================================================================
 */

import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser
} from "firebase/auth";
import { auth } from "./firebase";
import { User } from "../types";

/**
 * The one account permitted to use the Teacher Panel.
 *
 * MUST stay in sync with teacherUid() in firestore.rules. The rules are the real boundary — they
 * decide what data anyone can touch. This constant only decides who is shown the Teacher Panel,
 * so that an unauthorised sign-in is refused at the door instead of being handed an interface
 * whose every request then fails.
 *
 * Deliberately a uid, not an email domain: an address can be created at will, a uid cannot.
 */
export const TEACHER_UID = "yG2GrK8XNsNdbREzlzrfbHfEjd93";

/** Legacy localStorage keys from the pre-Firebase implementation. Purged on startup. */
const LEGACY_SESSION_KEY = "science_garden_current_user";
const LEGACY_USER_DB_KEY = "science_garden_users_db";

export interface AuthState {
  /** True until Firebase has reported the restored session. Gate UI on this to avoid a flash. */
  initializing: boolean;
  /** The signed-in teacher, or null. Anonymous (student) sessions map to null — see below. */
  user: User | null;
  /** True when an anonymous student session is active. */
  isAnonymous: boolean;
  /** Raw Firebase uid for any session type, or null when signed out. */
  firebaseUid: string | null;
}

let state: AuthState = {
  initializing: true,
  user: null,
  isAnonymous: false,
  firebaseUid: null
};

const listeners = new Set<(state: AuthState) => void>();

/**
 * Guards against retrying anonymous sign-in in a loop when the Anonymous provider is disabled
 * in the Firebase Console. Reset whenever a session exists, so signing out re-arms it.
 */
let anonymousSignInAttempted = false;

/**
 * Removes credentials left in the browser by the previous implementation.
 * Those entries contained plaintext passwords; clearing them is a one-way cleanup and touches
 * nothing in Firestore.
 */
function purgeLegacyLocalCredentials(): void {
  try {
    localStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_USER_DB_KEY);
  } catch {
    /* private browsing / storage disabled — nothing to clean up */
  }
}

/**
 * Maps a Firebase user onto the app's existing `User` shape so the UI keeps working unchanged.
 *
 * Anonymous sessions deliberately map to `null`: students never "logged in" under the old
 * implementation either, so returning null preserves the exact existing behaviour of the
 * student screens (name prefill stays empty, submissions carry no studentId). Binding
 * submissions to the anonymous uid is Stage 2 work and would change document structure.
 */
function mapFirebaseUser(firebaseUser: FirebaseUser | null): User | null {
  if (!firebaseUser || firebaseUser.isAnonymous) return null;

  /**
   * Signed in, but not the teacher.
   *
   * Enabling Email/Password on the project means anyone can register an account against the
   * public API key. Without this check, any such account would be handed the Teacher Panel;
   * the Firestore rules would then deny every read, so the panel would render empty rather than
   * refusing entry. Returning null keeps them on the public side of the app.
   */
  if (firebaseUser.uid !== TEACHER_UID) return null;

  const email = firebaseUser.email || "";
  const createdAtRaw = firebaseUser.metadata?.creationTime;

  return {
    id: firebaseUser.uid,
    username: email || firebaseUser.uid,
    fullName: firebaseUser.displayName || (email ? email.split("@")[0] : "Teacher"),
    // UI-level only. Not an authorization decision — see the scope note at the top.
    role: "teacher",
    createdAt: createdAtRaw ? Date.parse(createdAtRaw) || Date.now() : Date.now()
  };
}

function emit(): void {
  for (const listener of listeners) {
    listener(state);
  }
}

/**
 * Signs the browser in anonymously so student sessions carry a real, server-issued identity
 * instead of nothing at all. Fails soft: if the Anonymous provider has not been enabled in the
 * Firebase Console this logs a clear warning and the app continues to work exactly as before.
 */
async function ensureAnonymousSession(): Promise<void> {
  if (anonymousSignInAttempted) return;
  anonymousSignInAttempted = true;

  try {
    await signInAnonymously(auth);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/operation-not-allowed") {
      console.warn(
        "[auth] Anonymous sign-in is disabled for this Firebase project. " +
          "Enable it at: Firebase Console -> Build -> Authentication -> Sign-in method -> Anonymous. " +
          "The app still works; student sessions simply have no Firebase identity yet."
      );
    } else {
      console.warn("[auth] Anonymous sign-in failed:", err);
    }
  }
}

// Single global auth listener. Firebase restores any persisted session before the first call,
// which is what makes the session survive a page refresh.
purgeLegacyLocalCredentials();

/**
 * Safety net: the UI blocks on `initializing`, so if onAuthStateChanged never fires — Firebase
 * unreachable, offline, blocked by a network filter — the app would hang on a spinner forever,
 * which the previous implementation never did. After this timeout we give up waiting and let the
 * app render signed-out. A late auth callback still takes effect normally.
 */
const AUTH_INIT_TIMEOUT_MS = 6000;

const authInitTimeout = setTimeout(() => {
  if (!state.initializing) return;
  console.warn(
    `[auth] Firebase Auth did not respond within ${AUTH_INIT_TIMEOUT_MS}ms. ` +
      "Continuing signed out so the app stays usable."
  );
  state = { ...state, initializing: false };
  emit();
}, AUTH_INIT_TIMEOUT_MS);

onAuthStateChanged(
  auth,
  (firebaseUser) => {
    clearTimeout(authInitTimeout);

    state = {
      initializing: false,
      user: mapFirebaseUser(firebaseUser),
      isAnonymous: Boolean(firebaseUser?.isAnonymous),
      firebaseUid: firebaseUser?.uid ?? null
    };

    if (firebaseUser) {
      // Re-arm anonymous sign-in so signing out returns the browser to a student session.
      anonymousSignInAttempted = false;

      /**
       * A previously persisted, non-anonymous session that is not the teacher — e.g. someone
       * registered an account, or the teacher's account changed. Drop it so the browser falls
       * back to an ordinary anonymous student session instead of holding a token that authorises
       * nothing. The listener re-fires on sign-out and takes the anonymous branch below.
       */
      if (!firebaseUser.isAnonymous && firebaseUser.uid !== TEACHER_UID) {
        void signOut(auth);
      }
    } else {
      void ensureAnonymousSession();
    }

    emit();
  },
  (err) => {
    // Listener-level failure (e.g. Authentication not enabled for the project at all).
    clearTimeout(authInitTimeout);
    console.warn("[auth] Auth state listener error:", err);
    state = { initializing: false, user: null, isAnonymous: false, firebaseUid: null };
    emit();
  }
);

/** Current auth state snapshot. */
export function getAuthState(): AuthState {
  return state;
}

/**
 * Subscribes to authentication state. Fires immediately with the current snapshot.
 * Returns an unsubscribe function.
 */
export function subscribeToAuthState(listener: (state: AuthState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The signed-in teacher, or null.
 *
 * Kept with its original name and semantics so existing display/prefill call sites
 * (TeacherPanel's `teacherName`, StudentQuiz's name prefill, AddStudentModal's `createdBy`)
 * continue to work untouched. The value is now derived from Firebase Auth in memory —
 * localStorage is no longer consulted.
 */
export function getCurrentUser(): User | null {
  return state.user;
}

/** Maps a Firebase auth error code to a message worth showing a teacher. */
function describeAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || "";

  switch (code) {
    case "auth/invalid-email":
      return "That is not a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact the administrator.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      // Deliberately identical for all three: revealing which part was wrong would let an
      // attacker discover which email addresses exist.
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Could not reach Firebase. Please check your internet connection.";
    case "auth/operation-not-allowed":
      return (
        "Email/Password sign-in is not enabled for this Firebase project. " +
        "Enable it in Firebase Console -> Build -> Authentication -> Sign-in method."
      );
    case "auth/configuration-not-found":
      // Raised when Authentication has never been set up for the project at all. Without this
      // case the raw "Firebase: Error (auth/configuration-not-found)" string reached the teacher.
      return (
        "Firebase Authentication has not been set up for this project yet. " +
        "Open Firebase Console -> Build -> Authentication -> Get started, then enable the " +
        "Email/Password and Anonymous sign-in providers."
      );
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "The Firebase configuration in this app is invalid. Please contact the administrator.";
    default:
      return (err as Error)?.message || "Sign in failed. Please try again.";
  }
}

/**
 * Signs a teacher in with Firebase Email/Password.
 *
 * The password is sent to Firebase for server-side verification and is never stored, compared,
 * or written anywhere by this application.
 */
export async function signInTeacher(
  email: string,
  password: string
): Promise<{ success: boolean; message: string; user?: User }> {
  const cleanEmail = email.trim();

  if (!cleanEmail) {
    return { success: false, message: "Please enter your email address." };
  }
  if (!password) {
    return { success: false, message: "Please enter your password." };
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);

    /**
     * Credentials were valid, but this is not the teacher's account.
     *
     * Sign straight back out rather than leaving a half-authorised session lying around: the
     * browser would otherwise hold a non-anonymous token that the Firestore rules grant nothing,
     * which is confusing to debug and pointless to keep.
     */
    if (credential.user.uid !== TEACHER_UID) {
      await signOut(auth);
      return {
        success: false,
        message: "This account is not authorised to access the Teacher Panel."
      };
    }

    const mapped = mapFirebaseUser(credential.user);
    if (!mapped) {
      return { success: false, message: "Sign in did not return a valid teacher account." };
    }

    return { success: true, message: `Welcome back, ${mapped.fullName} 👋`, user: mapped };
  } catch (err) {
    return { success: false, message: describeAuthError(err) };
  }
}

/**
 * Signs the current user out. The auth listener then returns the browser to an anonymous
 * student session automatically.
 */
export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("[auth] Sign out failed:", err);
  }
}
