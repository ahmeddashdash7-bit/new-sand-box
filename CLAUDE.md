# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **bun** (`bun.lock` is the only lockfile).

```bash
bun install
bun run dev      # vite dev server on port 3000, host 0.0.0.0
bun run build    # vite build
bun run preview
bun run lint     # tsc --noEmit  <-- the only check in the repo
```

```bash
bun run test        # vitest: attemptPaper, whatsapp, subjects/groups, blueprintSelection (no emulator needed)
bun run test:rules  # firestore rules + end-to-end attempt flow, against the emulator
```

There is no ESLint and no CI. `bun run lint` (type-check) plus the two suites above are the automated verification available — run them after non-trivial edits. `test:rules` boots the firestore **and auth** emulators and runs `tests/rules/`, which contains both the rules suite and `attemptFlow.integration.test.ts` — the latter drives `lib/firebase.ts` itself as an anonymous student under the real rules (join → attempt → submit → grant → retake → submit). It uses the app's hardcoded projectId, so the emulator must run under that same project or the fixtures land in a different namespace.

`vite.config.ts` honors `DISABLE_HMR=true` to disable HMR *and* file watching (used by AI Studio during agent edits). Do not change that block.

## What this is

"Science Garden" — a single-page React 19 + Vite + Tailwind v4 app for a science teacher (Dr. Ghada Abdelaal) to author question banks, generate quizzes/homework, deliver them to students via a short code, auto-grade, and send parent reports over WhatsApp. There is no backend of our own: the browser talks directly to Firebase Firestore.

## Architecture

### Top-level routing is state, not a router

`src/App.tsx` renders one of three things from local state — no react-router:

- `currentQuiz` set → `StudentQuiz` (taking/reviewing an assessment)
- no `currentUser` → `JoinAssessment` (student code entry) or `AuthScreen` (teacher login), toggled by `unauthViewMode`
- logged in → `TeacherPanel`

App reads `?code=` / `?q=` / `?quiz=` from the query string *or* hash to prefill the join code.

Cross-component signalling uses `window` CustomEvents rather than context: `science_garden_auth_changed` (auth state, payload = `User | null`), `science_garden_back_to_home` (panels reset their internal view), `student_result_submitted`. If you add a screen that must react to login/logout, subscribe to these.

`TeacherPanel.tsx` (~2100 lines) is the teacher hub; its `activeTab` state (`bank | blueprints | quizzes | assignments | submissions | analytics`) picks the sub-view. Most sub-views live in their own component files but the quizzes/submissions tabs are rendered inline.

`src/components/StudentPanel.tsx` is legacy — nothing imports it. Prefer `JoinAssessment` + `StudentQuiz` for student flows.

### Data layer: `src/lib/firebase.ts` is the single Firestore boundary

Every Firestore read/write lives in this one module, organised in numbered sections matching the collections in `firestore.rules`: `users`, `questions`, `blueprints`, `assessments`, `assessmentCodes`, `studentAssignments`, `submissions`, `students`, `studentCodes`, `reportDeliveryLogs`, `orphanedImages`, `groups`. `firebase-blueprint.json` documents the intended entity shapes. (Numbering drifts by one at the end: `groups` is section 9 in firebase.ts but block 10 in `firestore.rules`, which numbers `orphanedImages` as 9.)

Conventions that repeat throughout and should be preserved in new functions:

- Firebase config is **hardcoded** in `firebase.ts` (not env vars).
- `db` is created with `initializeFirestore(app, { ignoreUndefinedProperties: true })`, not `getFirestore`. Optional fields on `Question` are genuinely `undefined`, and Firestore otherwise throws on undefined — including inside arrays like `studentAssignments.generatedQuestions[]` — where `handleFirestoreError` would swallow the throw and the write would silently vanish.
- Every function is wrapped in try/catch → `handleFirestoreError(...)` → `console.warn`, and returns `false`/`null`/`[]` on failure. Nothing throws to the UI.
- Writes use `setDoc(..., { merge: true })` with every field explicitly defaulted (`|| ""`, `|| 0`, `Boolean(...)`) — Firestore rejects `undefined`.
- Reads re-map every field defensively with the same defaults; documents are assumed to be partially populated or written by an older shape.
- Several fields are **written twice under two names** for backwards compatibility (`assessmentCode`/`joinCode`, `studentClass`/`class`, `phoneNumber`/`phone`, `timeTaken`/`timeTakenSeconds`, `*Id`/`*Reference`, `shareSettings`/`assessmentSettings`). Reads use `data.a || data.b`. Keep both sides in sync when touching these.
- `subscribeToFirestore*` functions return the `onSnapshot` unsubscribe and **auto-seed** from `src/data/templates.ts` when the collection is empty (`DEFAULT_BANK_QUESTIONS`, `DEFAULT_BLUEPRINTS`, `SAMPLE_QUIZZES`). `subscribeToFirestoreGroups` is the deliberate exception — see "Class groups" below.

The thin `*Store.ts` modules (`questionBankStore`, `blueprintStore`, `submissionStore`) just re-export firebase.ts calls with a local fallback; `authStore.ts` is the exception — it is localStorage-first (`science_garden_users_db`, `science_garden_current_user`) with Firestore as a secondary lookup, and passwords are stored in plaintext.

Authentication is **real Firebase Auth**: the teacher signs in with email/password and is pinned to a single uid (`TEACHER_UID` in `authStore.ts`, mirrored by `teacherUid()` in `firestore.rules` — keep them in sync); every other visitor gets an anonymous session. `firestore.rules` enforces that boundary and is verified by an emulator suite (`npm run test:rules`).

Two collections are addressed **by a secret in the document id** rather than by query, which is what lets the collections behind them close to the teacher entirely:

- `studentCodes/{CODE}` — join-time student lookup + claim-once device binding, so `students` (names, grades, parent phones) is teacher-only.
- `assessmentCodes/{CODE}` — the student-facing subset of an assessment (title, dates, settings, `questionIds`), so `assessments` is teacher-only. Without it, a signed-in session could list `assessments`, harvest every `questionId`, and fetch the whole bank with its answers. The mirror deliberately omits `teacherWhatsApp`, `teacherId` and `notes` — it is the one assessment surface a student can read, so nothing teacher-only may be added to it.

`get` is allowed on both; `list` is teacher-only. Mirrors are written by `upsertStudentCodeMirror` / `upsertAssessmentCodeMirror` and repaired by the idempotent `backfillStudentCodeMirrors` / `backfillAssessmentCodeMirrors`, which run from `AddStudentModal` and `TeacherPanel` respectively.

Note: `assignmentGenerator.ts` persists to an **`assignments`** collection that is not declared in `firestore.rules` (only `studentAssignments` is). Writes there fail silently by design.

### Questions are referenced, never copied

An assessment document stores `questionIds: string[]`, not question objects. `getAssessmentFromFirestore` hydrates them via `fetchQuestionsByIdsFromFirestore`, and `saveAssessmentToFirestore` first upserts every question into the `questions` collection. Submissions likewise store only `{ questionId, studentAnswerIndex, isCorrect }`.

Consequence: rebuilding "what the student actually saw" (for reports/review) is a dedicated job — `src/lib/assessmentReconstructor.ts` combines the question bank, the `studentAssignments` doc's ordered `questionIds` + numeric `optionPermutations` (e.g. `[2,0,3,1]`), and the submission to reproduce exact question and option ordering. Anything that changes shuffling must keep `optionPermutations` truthful or reports will show wrong answers.

### Attempts and retakes

**One document per attempt, at a derived id** — `buildAttemptId()` in firebase.ts:

```
attempt 1 → quiz-1__c_AAAA          submission → sub_quiz-1__c_AAAA
attempt 2 → quiz-1__c_AAAA__a2      submission → sub_quiz-1__c_AAAA__a2
```

Attempt 1 is deliberately unsuffixed so every attempt and submission written before multi-attempt support stays valid — nothing was migrated. Uniqueness lives in the key because that is the only form `firestore.rules` can enforce (rules can compare a document id to its payload; they cannot run a query). The submission id derivation `sub_ + studentAssignmentId` is unchanged and is what gives each attempt its own write-once submission.

A retake is **granted, never reopened**. `reopenAttemptInFirestore` stamps `retakeApproved: true` on the *completed* attempt and touches nothing else; the student's next join creates a new document at the next number. The rules require a teacher-written grant on attempt *n* before permitting attempt *n+1*, so one Unlock click buys exactly one sitting and past attempts keep their answers, scores and timings. `retakeApproved` must never enter the student's allowed update keys.

`resolveAttemptChain()` walks the chain by derived id (never a query) and reports `active` / `canStartNewAttempt` / `blockedByCompletedAttempt`. `shareSettings.maxAttempts` is still stored and edited but read by nothing — the teacher's Unlock is the only gate.

### Per-attempt randomization

`src/lib/attemptPaper.ts` owns all of it. The shuffle is generated **once per attempt**, at attempt creation in `JoinAssessment.handleStartAssessment`, and persisted onto the attempt as `questionIds` (presentation order) + `optionPermutations` + `randomSeed`.

- Shuffling the *assessment* cannot produce per-student variation — there is one assessment document. The creation-time shuffle in `QuizHomeworkAssignmentModal` is **sampling** (which questions the quiz contains), not presentation order; do not confuse the two.
- `applyAttemptPaper(quiz.questions, attempt)` is the only thing that turns stored order into something renderable, and `StudentQuiz` calls it in its restore effect — the single choke point every entry path (fresh join, F5, `App.tsx` session resume, second device) passes through. That is what makes a refresh replay the identical paper. `StudentQuiz` reads `paper`, never `quiz.questions`.
- With no permutations and canonical ids it is an **exact identity transform**, which is what keeps pre-randomization attempts and reports byte-identical.
- Scoring is unchanged: `correctAnswerIndex` is re-derived for the shuffled options, so comparing a clicked display index against it stays correct. `answers[].studentAnswerIndex` remains the index **as shown** (the contract `assessmentReconstructor` and `PrintableReport` already assumed); `canonicalAnswerIndex` is written alongside it as the stable choice identity.
- The two flags are independent and read from `assessmentCodes/{CODE}.assessmentSettings`. `ShareAssessmentModal` must keep spreading the stored settings on save — building that object from scratch is what used to silently disable randomization.

### Blueprint → assessment generation

`src/lib/blueprintSelection.ts` is the only live selection path. `QuizHomeworkAssignmentModal.handleSubmit` calls `selectBlueprintQuestions`, which runs strictly in this order:

1. `matchesBlueprintFilters` — subject, grade (`"General"` on a question means any grade), lesson (substring), tags, allowed question types. This is *the* filter predicate.

`analyzeBlueprintPool` wraps steps 1-2 and answers "what can this blueprint draw right now, and can it be generated at all" without selecting anything. **Both** the teacher-facing "Matching questions" panel in `QuizHomeworkAssignmentModal` and `selectBlueprintQuestions` call it, so the count the teacher sees and the pool the generator uses are the same computation rather than two implementations agreeing by convention. The generator re-runs it on submit instead of trusting the UI, which also catches a bank that changed while the modal was open. `BlueprintFormModal`'s authoring counter calls `matchesBlueprintFilters` directly.
2. `computeDifficultyQuotas` — turns the blueprint's difficulty percentages into integer quotas via largest-remainder (Hamilton) apportionment. Percentages are normalized by their own sum, because the three sliders move independently and are not constrained to total 100. Quotas always sum to exactly `totalQuestions`. Falls back to the stored `easyCount/mediumCount/hardCount` as *weights* when no percentages exist, and returns `null` when the blueprint expresses no distribution at all (blueprints predating the percentage fields read back as all-zero counts) — `null` means "draw from the whole eligible pool", not "select nothing".
3. Draw each quota from its own difficulty bucket, then Fisher-Yates the combined list.
4. `validateSelection` — re-checks filter compliance, per-difficulty counts, total, and id uniqueness against the actual output before anything is saved.

Invariants: randomness only ever chooses *which* question fills an already-fixed quota and the final order — never the difficulty mix. A pool that cannot satisfy the quotas is **refused with a per-difficulty shortage message**; a short bucket is never backfilled from another difficulty, and the pool is never widened beyond the filters. `normalizeDifficulty` tolerates legacy casing and absent values, defaulting to Medium to match `saveBankQuestionToFirestore`.

Lesson sentinels (`"General Unit"`, `""`, `"All Lessons"`, `"جميع الدروس"`) mean "no lesson filter". `BlueprintFormModal` writes `"General Unit"` when the teacher leaves the lesson blank, and matching it literally is what used to empty the pool. `topics` is deliberately not filtered on — it is auto-derived from the lesson and has never been enforced by the authoring preview.

`src/lib/assignmentGenerator.ts` ("BDQSA": Jaccard near-duplicate rejection, concept-coverage maximization, cross-difficulty backfill) is **dead code**. Its only caller is `StudentPanel.tsx`, which `App.tsx` never imports, and it writes to an `assignments` collection that `firestore.rules` default-denies. Do not mistake it for the generator.

### Class groups

Groups ("Group A", "Saturday 5pm") are teacher-created and live in the `groups` collection. Three
rules make this safe to touch:

- **A student stores the group's *name*, not its id** (`StudentRecord.group`). That is what let the
  feature ship without migrating a single student document, and it is why renaming a group must
  cascade — `renameGroupAcrossStudents` in `firebase.ts` repoints every student holding the old
  name. Deleting a group deletes only the record; students keep the label.
- **`subscribeToFirestoreGroups` does not auto-seed.** The usual `snapshot.empty` seed branch would
  resurrect a group the teacher just deleted. Instead `resolveGroupOptions`
  (`lib/classification.ts`) falls back to `FALLBACK_GROUP_OPTIONS` while the collection is empty, so
  an account that never opens the group manager sees exactly the pre-groups list. `AddStudentModal`
  materializes that fallback into real records just before saving the teacher's first group.
- **Every picker calls `resolveGroupOptions`; every filter calls `matchesGroupFilter`.** Both wrap
  `withLegacyValues`, which keeps a student whose group was renamed or deleted selectable instead of
  stranding them behind a filter that cannot reach them. Don't reintroduce a hardcoded group list.

`TeacherPanel` owns the subscription and passes `groups` down to `StudentAssignmentsView`,
`AnalyticsDashboardView` and `QuizHomeworkAssignmentModal`; `AddStudentModal` subscribes on its own
because it is mounted from `App.tsx`. `Quiz.assignTo` remains a descriptive label, not a query.

A **submission** carries no group — the roster stays the single source of truth, so a student moved
between groups is reflected everywhere at once and nothing is duplicated onto results.
`resolveResultGroup(students, result)` in `lib/classification.ts` matches a result back to a roster
entry (studentCode → student id → seat → name) and is shared by the submissions table and the
analytics dashboard. The submissions tab composes four independent filters — search, quiz, group,
delivery — in one `filteredResults` memo that the table *and* Export CSV both consume, so the export
always matches what is on screen.

### Codes and sharing

- Assessment join codes: 6–8 uppercase alphanumerics from `codeGenerator.ts`; `generateUniqueAssessmentCode()` in firebase.ts checks both `assessmentCode` and `joinCode` fields for collisions. `getAssessmentByCodeFromFirestore` reads `assessmentCodes/{CODE}` — one document, no query, and the only path a student has. The legacy resolution against `assessments` (indexed query on each field, direct doc id, full-collection scan) still runs, but only for a non-anonymous session, because `assessments` is teacher-only.
- Student access codes: 3 chars from an ambiguity-free alphabet (`generateStudentCode`, no O/0/I/1).
- `src/lib/encoder.ts` encodes a whole quiz into a URL-safe base64 short code (minified single-letter keys) for offline/link sharing; `submissionStore.ts` has the equivalent for results (`encodeResultCode`/`importSubmissionCode`) so a teacher can paste a student's result code manually.

### Images

**Firebase Cloud Storage is deliberately NOT used** — it requires the paid Blaze plan. Image files
live with **Cloudinary** (free tier, unsigned upload preset); Firestore stores only the reference:
`imageUrl` (= `secure_url`), `imagePath` (= `public_id`), `imageProvider`, `imageName`,
`imageWidth`, `imageHeight`, `imageUploadedAt`. **Image bytes are never written to Firestore.**

Everything vendor-specific is confined to **`src/lib/images/`**:

| File | Role |
|---|---|
| `types.ts` | `ImageProvider` interface, `QuestionImageRef`, `DeleteOutcome` — no vendor names |
| `validation.ts` | Pre-upload type + 5 MB checks, provider-agnostic |
| `cloudinaryProvider.ts` | **The only file that knows Cloudinary exists** |
| `imageService.ts` | The public API; everything else imports from here |

Feature code must never import a provider directly. Swapping backends = editing the provider
registry in `imageService.ts`.

**Security invariants — do not violate:**
- Only `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` are used. Both are public
  identifiers. Any `VITE_` variable is compiled into the public bundle, so the Cloudinary **API
  key/secret must never appear anywhere in this repo**.
- The upload URL is hardcoded to `/image/upload`, never `/auto/upload` — this is what makes
  video/audio/raw uploads structurally impossible.
- The upload sends only `file`, `upload_preset` and `filename_override`. It never sends `folder`,
  `asset_folder`, `public_id` or `resource_type`.
- Known limit: Cloudinary lets *unsigned* clients send `folder`, so folder pinning is enforced by
  our code and the preset, **not cryptographically**. Only signed uploads (needing a server) close
  this. The adapter makes that a one-file change.

Four rules keep images alive across the pipeline:

1. **`pickQuestionImageFields(q)`** must be spread into *every* place a question is copied or remapped (bank → quiz, bank → homework, quiz → bank, submission → report, encoder). Omitting it silently drops the figure.
2. **`buildQuestionImagePayload`** gives `saveBankQuestionToFirestore` three distinct cases: `imageUrl === undefined` omits the image fields from the merge (preserves what's stored), `""` explicitly clears them, a URL writes them. Writing `imageUrl: q.imageUrl || ""` unconditionally — as the code used to — blanks the bank question's image whenever a stripped quiz copy is saved.
3. Deletes go through **`deleteQuestionImageIfUnreferenced`**, since quiz copies share the bank question's remote asset.
4. Rendering goes through **`buildQuestionImageDisplayUrl`**, which injects Cloudinary's `f_auto,q_auto` — roughly halving mobile bytes, which matters because bandwidth is the scarcer free-tier resource.

**Deletion is genuinely limited.** Unsigned uploads can only be deleted from the browser within the
`delete_token`'s ~10 minute window (held in a ref in `QuestionImageUploader`, never persisted —
it expires too fast to be worth storing). After that the Firestore reference is removed but the
remote file survives; `recordOrphanedImage` logs it to the `orphanedImages` collection for later
cleanup. Do not write code that claims to delete outside that window.

Legacy `data:` base64 images (and the inline SVGs from `biologyDiagrams.ts`) still render
everywhere via the `inline` provider, which reports `not-owned` on delete.
`src/lib/migrateLegacyImages.ts` is an optional dev-only migration (`window.__migrateQuestionImages()`).

### Reports

`PrintableReport.tsx` renders into `#pdf-report-template`; the `@media print` block in `src/index.css` hides everything else and forces A4 portrait, single page. WhatsApp delivery (`lib/whatsapp.ts` + `SendWhatsAppModal`) builds a `wa.me/` deep link — phone normalization defaults to country code `20` (Egypt) and special-cases Saudi `05…`. Sends are journalled in `reportDeliveryLogs` and mirrored onto the submission's `reportDelivery` field.

## Conventions

- Path alias `@/*` → repo root (configured in both `tsconfig.json` and `vite.config.ts`), though existing code uses relative imports throughout.
- All domain types live in `src/types.ts`; enums (`Subject`, `QuestionType`, `DifficultyLevel`, `GradeLevel`) are string enums whose values are persisted verbatim to Firestore — changing a value breaks existing documents. `Subject` has **both** `Science` and `IntegratedScience` ("Integrated Science"); they are different subjects the same teacher teaches. Because one name contains the other, any free-text mapping onto the enum must test for `"integ"` before `"science"` (see `BulkQuestionImportModal`), and any subject matching that falls back to a title substring must prefer an explicit `quizSnapshot.subject` first (see `AnalyticsDashboardView`) or results get counted under both.
- Most subject pickers render `Object.values(Subject)` and pick up a new member for free; the exceptions are the `getSubjectTheme` switches in `TeacherPanel` and `StudentQuiz`.
- Styling is Tailwind v4 utility classes inline (via `@tailwindcss/vite`, no `tailwind.config`); theme tokens are declared in the `@theme` block of `src/index.css`. Icons are `lucide-react`, animation is `motion/react`, charts are `recharts`.
- The UI was rebranded from Arabic to English, but Arabic strings survive in `lib/authStore.ts`, `lib/encoder.ts` and a few components. New user-facing strings should be English.
- `@google/genai`, `express`, and `dotenv` are dependencies but currently unused — there is no server and no Gemini call, despite `metadata.json` mentioning `GEMINI_API_KEY`.

## Deployment

Firebase Hosting on the free Spark plan (`firebase.json` → `public: "dist"`, SPA rewrite so
`?code=` join links resolve):

```bash
bun run build
firebase deploy --only hosting
```

`firestore.rules` must be deployed separately (`firebase deploy --only firestore:rules`). There is
no `storage.rules` — Cloud Storage is not used.

## Planned: multi-tenancy (design only — not implemented)

For the future multi-teacher product. **None of this exists yet**; the app is single-tenant and all
data is global (one shared question bank, one shared assessments list).

- Add `ownerId` (teacher uid) to `questions`, `blueprints`, `assessments`, `students`.
- Scope every list query with `where("ownerId","==",uid)`. Combined with the existing
  `orderBy("createdAt","desc")` this **requires composite indexes** in `firestore.indexes.json` —
  unlike today's queries, which are all single-field and auto-indexed.
- Requires real **Firebase Auth** first: `ownerId` is meaningless while `request.auth` is always
  null, and Firestore rules cannot enforce ownership without it.
- Migration: backfill a single `ownerId` on all existing rows *before* enabling any filtering,
  otherwise existing content disappears from the UI.
- Cloudinary folder becomes `science-garden/{ownerId}/questions` — also the point at which signed
  uploads via a Cloudflare Worker become worthwhile, since quota abuse then affects paying users.
