// The rules dictation listens by, apart from the microphone: where a recording is cut into chunks, what the level meter
// shows, in what order the transcripts of chunks are written, and where text lands in a field. Pure, so it is tested.
export const SAMPLE_RATE = 16000;
export const MAX_CHUNK = 6 * SAMPLE_RATE; // a chunk is cut at six seconds...
export const SILENCE = 0.8 * SAMPLE_RATE; // ...or after 0.8 s of quiet that follows speech...
export const MIN_VOICED = 1 * SAMPLE_RATE; // ...and a chunk with under a second of speech is dropped.
export const VOICED_RMS = 0.01;

export const rms = (c: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < c.length; i++) s += c[i] * c[i];
  return Math.sqrt(s / c.length);
};
// The meter: 0 to 1 (two decimals, as the CSS variable has always been written).
export const meter = (r: number) => Math.min(1, r * 8).toFixed(2);

// Collects the audio blocks the worklet forwards. push() says how loud the block was and whether a chunk is ready;
// take() hands the chunk over (null when it held too little speech) and starts the next.
export function makeChunker() {
  let buf: Float32Array[] = [],
    len = 0,
    voiced = 0,
    quiet = 0;
  const reset = () => {
    buf = [];
    len = 0;
    voiced = 0;
    quiet = 0;
  };
  return {
    push(c: Float32Array) {
      buf.push(c);
      len += c.length;
      const r = rms(c);
      if (r > VOICED_RMS) {
        voiced += c.length;
        quiet = 0;
      } else quiet += c.length;
      return { level: meter(r), ready: len >= MAX_CHUNK || (voiced >= MIN_VOICED && quiet >= SILENCE) };
    },
    take(): Float32Array | null {
      if (!len || voiced < MIN_VOICED) return (reset(), null);
      const a = new Float32Array(len);
      let o = 0;
      for (const c of buf) {
        a.set(c, o);
        o += c.length;
      }
      reset();
      return a;
    },
  };
}

// Transcripts come back in any order; they are written in the order the chunks were cut. A chunk that failed counts as "".
export function makeOrdered() {
  const pending = new Map<number, string | null>();
  let done = 0;
  return {
    reserve: (seq: number) => void pending.set(seq, null),
    set: (seq: number, text: string) => void pending.set(seq, text),
    // Calls `write` for every transcript that is next in line; true when nothing is left waiting.
    drain(write: (t: string) => void) {
      while (pending.has(done) && pending.get(done) !== null) {
        write(pending.get(done) as string);
        pending.delete(done);
        done++;
      }
      return !pending.size;
    },
    get waiting() {
      return pending.size;
    },
  };
}

// Text lands at `at` (clamped to the field), with a space before it unless one is there already. Returns the new value
// and the caret after the text.
export function insertAt(value: string, at: number, text: string) {
  at = Math.min(at, value.length);
  const head = value.slice(0, at),
    sep = head && !/\s$/.test(head) ? " " : "";
  return { value: head + sep + text + value.slice(at), at: head.length + sep.length + text.length };
}

// The model is a setting (dictation.model). Library and models are pinned.
export const ASR_MODELS: Record<string, string> = {
  tiny: "onnx-community/whisper-tiny",
  base: "onnx-community/whisper-base",
  small: "onnx-community/whisper-small",
  "large-v3-turbo": "onnx-community/whisper-large-v3-turbo",
};
export const modelFor = (want: unknown) => (typeof want === "string" && ASR_MODELS[want] ? want : "small");
