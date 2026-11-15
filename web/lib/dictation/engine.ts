// Dictation: Whisper in the page. Audio never leaves the browser; the model is fetched once from huggingface.co and
// cached. The library and the models are pinned here and in chunks.ts. One session listens at a time; the button that
// started it shows its state through dictation-store.ts.
import { toast } from "@lib/core";
import { openMic, savedMic } from "./mic.ts";
import { ASR_MODELS, SAMPLE_RATE, insertAt, makeChunker, makeOrdered, modelFor } from "./chunks.ts";
import { idleMic, markMic } from "./dictation-store.ts";

const TFJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
// Inference lives in a module Worker so a slow chunk never freezes the board. A function, so a bundle that imports this
// file without mounting a microphone button (the Notebook's kit) drops the source text instead of carrying it.
const workerSrc = () => `import{pipeline}from"${TFJS}";let asr=null;
onmessage=async e=>{const m=e.data;try{
 if(m.type==="load"){const prog=p=>{if(p.status==="progress")postMessage({type:"progress",file:p.file,pct:p.progress||0})};
  // WebGPU first, with the encoder in fp16 only where the adapter has shader-f16; any GPU failure falls back to the CPU.
  const gpu=m.webgpu?{device:"webgpu",dtype:{encoder_model:m.f16?"fp16":"fp32",decoder_model_merged:"q4"}}:null,cpu={device:"wasm",dtype:"q8"};
  try{if(!gpu)throw 0;asr=await pipeline("automatic-speech-recognition",m.model,{...gpu,progress_callback:prog})}
  catch(e){if(gpu)postMessage({type:"fallback",why:String(e&&e.message||e)});asr=await pipeline("automatic-speech-recognition",m.model,{...cpu,progress_callback:prog})}
  postMessage({type:"ready"})}
 if(m.type==="run"){const r=await asr(m.audio,{chunk_length_s:30,return_timestamps:false});postMessage({type:"text",sid:m.sid,seq:m.seq,text:(r.text||"").trim()})}
}catch(err){postMessage({type:"error",sid:m.sid,seq:m.seq,error:String(err&&err.message||err)})}}`;
// The worklet only forwards 128-frame blocks; chunking and silence detection stay on the main thread.
const WORKLET_SRC = `class T extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("kz-tap",T)`;

export const hasMic = () =>
  !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.AudioWorkletNode &&
    window.WebAssembly &&
    window.Worker
  );

// What dictation types into: a textarea or input, or the stand-in for a terminal (terminal-dictation.ts). `classList`,
// `style` and `onStart` are there only when the field has them.
export type Field = {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  isConnected: boolean;
  classList?: DOMTokenList;
  style?: CSSStyleDeclaration;
  focus(): void;
  dispatchEvent(e: Event): boolean;
  onStart?(): void;
};
// One button's claim: its id (the key of its state), the element the level meter is set on, and the field to type into.
export type Owner = { id: string; el?: HTMLElement | null; target(): Field };

// `active` is the one session listening; `sessions` also holds stopped ones still waiting on a chunk.
type Session = { id: string; field: Field; onmsg(m: any): void; stop(): void };
let asrModel: string | null = null,
  asrWorker: Worker | null = null,
  asrReady: Promise<void> | null = null,
  progressTo: string | null = null, // the button whose press is waiting on the model
  active: Session | null = null,
  starting = false;
const sessions = new Set<Session>();
const dropWorker = () => {
  try {
    asrWorker?.terminate();
  } catch {}
  asrWorker = null;
  asrReady = null;
};

// One worker for the page; loading is awaited by whoever pressed first, later presses join. Loads the model named in
// settings; a model changed since the last load replaces the worker.
async function loadAsr(): Promise<void> {
  let want: unknown = "small";
  try {
    const cfg = await fetch("/settings").then((r) => r.json());
    want = (cfg.rows.find((r: any) => r.key === "dictation.model") || {}).value || want;
  } catch {}
  const model = modelFor(want);
  if (asrReady && asrModel !== model) {
    active?.stop(); // a session still listening would post to the worker being dropped
    dropWorker();
    sessions.clear();
    active = null;
  }
  if (asrReady) return asrReady;
  asrModel = model;
  const ready = new Promise<void>(async (res, rej) => {
    const w = (asrWorker = new Worker(URL.createObjectURL(new Blob([workerSrc()], { type: "text/javascript" })), {
      type: "module",
    }));
    const files: Record<string, number> = {};
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") {
        files[m.file] = m.pct;
        const v = Object.values(files);
        if (progressTo) markMic(progressTo, { pct: Math.round(v.reduce((a, b) => a + b, 0) / v.length) });
      } else if (m.type === "ready") res();
      else if (m.type === "fallback") toast("GPU could not run the model, using the CPU: " + m.why);
      else if (m.type === "error" && m.seq == null) rej(new Error(m.error));
      for (const s of sessions) s.onmsg(m);
    };
    w.onerror = (e) => rej(new Error(e.message || "worker failed"));
    // Ask the adapter what it can do: no adapter means the CPU path; no shader-f16 means an fp32 encoder.
    let adapter: any = null;
    try {
      adapter = (navigator as any).gpu && (await (navigator as any).gpu.requestAdapter());
    } catch {}
    if (!adapter) toast("No WebGPU: dictation will run on the CPU and be slower");
    w.postMessage({
      type: "load",
      model: ASR_MODELS[asrModel as string],
      webgpu: !!adapter,
      f16: !!(adapter && adapter.features.has("shader-f16")),
    });
  });
  asrReady = ready;
  ready.catch(() => {
    if (asrReady === ready) dropWorker();
  });
  return ready;
}

// After a re-render only a listener whose field is gone is stopped; closing the panel stops any.
export function stopDictation(all?: boolean) {
  if (active && (all || !active.field.isConnected)) active.stop();
}

// Whether the session `id` is the one listening.
export const listeningFor = (id: string) => active?.id === id;

// A press on a microphone button: stops what is listening (and stops there if that was this button), else loads the model,
// asks for the microphone and starts listening into the owner's target field. Text lands where the caret is when each chunk
// arrives (or after the last insertion when the field is not focused), so typing while the mic is on is kept.
export async function toggleMic(o: Owner) {
  if (active) {
    const mine = active.id === o.id;
    active.stop();
    if (mine) return;
  }
  // One press at a time: the model load and the permission prompt are both awaits a second press could slip through.
  if (starting) return;
  starting = true;
  const fail = (why: string) => {
    idleMic(o.id);
    starting = false;
    toast(why);
  };
  markMic(o.id, { loading: true, busy: true, pct: null });
  progressTo = o.id;
  try {
    await loadAsr();
  } catch (err: any) {
    progressTo = null;
    return fail("Dictation model could not load: " + err.message);
  }
  progressTo = null;
  markMic(o.id, { loading: false, pct: null });
  const gone = () => !!o.el && !o.el.isConnected;
  if (gone()) {
    idleMic(o.id);
    starting = false;
    return;
  }
  let stream: MediaStream;
  try {
    stream = await openMic((audio) => navigator.mediaDevices.getUserMedia({ audio }), savedMic(), toast);
  } catch (err: any) {
    return fail("Microphone not available: " + (err.name === "NotAllowedError" ? "permission denied" : err.message));
  }
  // The field went away while the permission prompt was up (its dialog closed): nothing to type into.
  if (gone()) {
    stream.getTracks().forEach((t) => t.stop());
    idleMic(o.id);
    starting = false;
    return;
  }
  if (active) active.stop();
  let ctx: AudioContext, src: MediaStreamAudioSourceNode, tap: AudioWorkletNode;
  try {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET_SRC], { type: "text/javascript" })));
    src = ctx.createMediaStreamSource(stream);
    tap = new AudioWorkletNode(ctx, "kz-tap");
  } catch (err: any) {
    stream.getTracks().forEach((t) => t.stop());
    return fail("Microphone not available: " + err.message);
  }
  src.connect(tap);
  const f = o.target(),
    id = o.id,
    sid = Math.random().toString(36).slice(2), // chunk seqs are per session, so a result is matched by session id too
    chunker = makeChunker(),
    order = makeOrdered();
  f.onStart?.();
  let at = f.selectionStart ?? f.value.length,
    seq = 0,
    stopping = false;
  const write = (t: string) => {
    if (!t || !f.isConnected) return;
    if (typeof document !== "undefined" && document.activeElement === (f as unknown)) at = f.selectionStart ?? at;
    const r = insertAt(f.value, at, t);
    f.value = r.value;
    at = r.at;
    f.selectionStart = f.selectionEnd = at;
    f.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const flush = () => {
    const a = chunker.take();
    if (!a || !asrWorker) return;
    order.reserve(seq);
    asrWorker.postMessage({ type: "run", sid, seq, audio: a }, [a.buffer]);
    seq++;
    markMic(id, { busy: true });
  };
  const drain = () => {
    if (!order.drain(write)) return;
    markMic(id, { busy: false });
    if (stopping) {
      idleMic(id);
      sessions.delete(sess);
    }
  };
  tap.port.onmessage = (e) => {
    const { level, ready } = chunker.push(e.data);
    f.style?.setProperty("--lvl", level);
    o.el?.style.setProperty("--lvl", level);
    if (ready) flush();
  };
  const sess: Session = {
    id,
    field: f,
    onmsg: (m) => {
      if (m.sid !== sid) return;
      if (m.type === "text") {
        order.set(m.seq, m.text);
        drain();
      } else if (m.type === "error" && m.seq != null) {
        order.set(m.seq, "");
        toast("Dictation failed: " + m.error);
        drain();
      }
    },
    stop: () => {
      if (stopping) return;
      stopping = true;
      markMic(id, { on: false });
      f.classList?.remove("dictating");
      f.style?.removeProperty("--lvl");
      try {
        tap.port.onmessage = null;
        src.disconnect();
        tap.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
      } catch {}
      active = null;
      flush();
      drain();
    },
  };
  sessions.add(sess);
  active = sess;
  starting = false;
  markMic(id, { on: true, busy: false });
  f.classList?.add("dictating");
  f.focus();
}
