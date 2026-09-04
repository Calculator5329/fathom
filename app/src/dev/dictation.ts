// Reused from agent-orchestrator/apps/forge-shell/src/dictation.ts, 2026-09-04.
// Port kept verbatim below for a bounded Fathom dev-only prototype.
// Backlog item 56: voice in the shell composer.
//
// The wiring is lifted from the Realm game's `NeitherSheet`
// (`components/realm/games/GamesPane.tsx`), which is the only dictation in this
// codebase that has ever worked. It is lifted rather than copied, because the
// original has a defect that only shows up on the unhappy path:
//
//   recognition.onend = () => setListening(false);
//
// ...and nothing else. There is no `onerror`. A denied microphone permission,
// an offline speech service, or a browser with no engine at all fires `error`
// and — depending on the browser — may never fire `end`. The button stays lit,
// the class stays `listening`, and the user is watching an indicator for a
// process that is not running. That is this repo's named defect class in the
// UI: a control whose displayed state is not read from anything real.
//
// So the state machine below has one invariant, and it is the reason this file
// exists rather than a second copy of six lines:
//
//   **Every terminal event returns to `idle`.** `stop`, `end`, and `error` all
//   land in a non-listening state. There is no path that leaves the indicator
//   on. The only way to be `listening` is to have started.
//
// The transcript join rule is kept verbatim from the Realm original, because
// that part demonstrably works and a subtle rewrite would be gratuitous.

/** What the composer's mic control may be doing. */
export type DictationState =
  | { readonly status: "idle" }
  | { readonly status: "listening" }
  /** Terminal, and NOT listening. The message is shown to the user. */
  | { readonly status: "error"; readonly message: string };

export type DictationEvent =
  | { readonly type: "start" }
  | { readonly type: "transcript"; readonly text: string }
  | { readonly type: "end" }
  | { readonly type: "error"; readonly code?: string };

export const DICTATION_IDLE: DictationState = { status: "idle" };

/**
 * The messages are written for someone who just pressed a mic button and got
 * nothing. "not-allowed" is by far the most common and is not an error the user
 * can debug from the word "error".
 */
export function dictationErrorMessage(code: string | undefined): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone blocked — allow it for this site and try again";
    case "no-speech":
      return "Heard nothing";
    case "audio-capture":
      return "No microphone found";
    case "network":
      return "Speech service unreachable";
    default:
      return code ? `Dictation stopped: ${code}` : "Dictation stopped";
  }
}

export function dictationReducer(state: DictationState, event: DictationEvent): DictationState {
  switch (event.type) {
    case "start":
      return { status: "listening" };
    case "transcript":
      // A transcript arriving is not a reason to change state: `continuous`
      // recognition emits several before `end`.
      return state;
    case "end":
      // An `end` after an `error` must not erase the message the user needs.
      return state.status === "error" ? state : DICTATION_IDLE;
    case "error":
      return { status: "error", message: dictationErrorMessage(event.code) };
    default:
      return state;
  }
}

/** True only while actually listening. Never derived from a separate boolean. */
export function isListening(state: DictationState): boolean {
  return state.status === "listening";
}

/**
 * Append a transcript to the existing draft. Verbatim from the Realm original:
 * one space between what was there and what was said, and no leading space on
 * an empty draft. Trailing whitespace in the draft is respected rather than
 * doubled.
 */
export function appendTranscript(draft: string, transcript: string): string {
  const spoken = transcript.trim();
  if (!spoken) return draft;
  if (!draft) return spoken;
  return /\s$/u.test(draft) ? `${draft}${spoken}` : `${draft} ${spoken}`;
}

/** The minimum of the Web Speech API this module drives. */
export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  abort?: () => void;
  stop?: () => void;
}

export interface SpeechCapableWindow {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

/**
 * Is dictation available at all?
 *
 * The Realm original checks only `webkitSpeechRecognition`, which is right for
 * Chrome and wrong everywhere the standard name is exposed. Checking both costs
 * one line; checking one means the control is hidden on a browser that supports
 * it.
 */
export function speechRecognitionConstructor(
  win: SpeechCapableWindow | undefined,
): (new () => SpeechRecognitionLike) | undefined {
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition;
}

export function dictationSupported(win: SpeechCapableWindow | undefined): boolean {
  return speechRecognitionConstructor(win) !== undefined;
}

export interface DictationHandle {
  /** Stop listening. Safe to call more than once, and after it has ended. */
  readonly cancel: () => void;
}

/**
 * Start one dictation. Returns a handle whose `cancel` is idempotent, so an
 * unmounting component can always call it.
 *
 * Every callback path — result, end, error, and a throw from `start()` itself —
 * routes through `onEvent`, which is what makes the "never stuck listening"
 * invariant hold against the real API rather than only against the reducer.
 * A browser that throws synchronously from `start()` (Safari, when a previous
 * recognition is still running) would otherwise leave the indicator on forever.
 */
export function startDictation(input: {
  readonly win: SpeechCapableWindow | undefined;
  readonly onEvent: (event: DictationEvent) => void;
}): DictationHandle | undefined {
  const Recognition = speechRecognitionConstructor(input.win);
  if (!Recognition) return undefined;

  const recognition = new Recognition();
  let finished = false;
  const finish = (event: DictationEvent) => {
    if (finished) return;
    finished = true;
    input.onEvent(event);
  };

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const spoken = event.results?.[0]?.[0]?.transcript;
    if (typeof spoken === "string") input.onEvent({ type: "transcript", text: spoken });
  };
  recognition.onend = () => finish({ type: "end" });
  recognition.onerror = (event) => finish({ type: "error", code: event?.error });

  input.onEvent({ type: "start" });
  try {
    recognition.start();
  } catch (error) {
    finish({ type: "error", code: error instanceof Error ? error.message : undefined });
    return { cancel: () => {} };
  }

  return {
    cancel: () => {
      try {
        recognition.abort?.();
      } catch {
        // An abort that throws is still an abort as far as this UI is
        // concerned; what must not happen is the indicator staying lit.
      }
      finish({ type: "end" });
    },
  };
}
