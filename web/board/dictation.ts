import { ico } from "./dom.ts";
import { toast } from "./toast.ts";

// ---- dictation: Whisper in the page. Audio never leaves the browser; the model is
// fetched once from huggingface.co and cached. Library and model are pinned here.
const TFJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0",
  ASR_MODELS = {
    tiny: "onnx-community/whisper-tiny",
    base: "onnx-community/whisper-base",
    small: "onnx-community/whisper-small",
    "large-v3-turbo": "onnx-community/whisper-large-v3-turbo",
  };
// The model is a setting (dictation.model); the worker is rebuilt when it changes.
let asrModel = null;
// Inference lives in a module Worker so a slow chunk never freezes the board.
const WORKER_SRC = `import{pipeline}from"${TFJS}";let asr=null;
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
const HAS_MIC = !!(
  navigator.mediaDevices &&
  navigator.mediaDevices.getUserMedia &&
  window.AudioWorkletNode &&
  window.WebAssembly &&
  window.Worker
);
// `active` is the one session listening; `sessions` also holds stopped ones still waiting on a chunk.
let asrWorker = null,
  asrReady = null,
  asrProgress = () => {},
  active = null,
  starting = false;
const sessions = new Set();
// One worker for the page; loading is awaited by whoever pressed first, later presses join.
// Loads the model named in settings; a model changed since the last load replaces the worker.
async function loadAsr() {
  let want = "small";
  try {
    const cfg = await fetch("/settings").then((r) => r.json());
    want = (cfg.rows.find((r) => r.key === "dictation.model") || {}).value || want;
  } catch (e) {}
  if (!ASR_MODELS[want]) want = "small";
  if (asrReady && asrModel !== want) {
    try {
      asrWorker.terminate();
    } catch (e) {}
    asrWorker = null;
    asrReady = null;
    sessions.clear();
    active = null;
  }
  if (asrReady) return asrReady;
  asrModel = want;
  asrReady = new Promise(async (res, rej) => {
    asrWorker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })), {
      type: "module",
    });
    const files = {};
    asrWorker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") {
        files[m.file] = m.pct;
        const v = Object.values(files);
        asrProgress(Math.round(v.reduce((a, b) => a + b, 0) / v.length));
      } else if (m.type === "ready") res();
      else if (m.type === "fallback") toast("GPU could not run the model, using the CPU: " + m.why);
      else if (m.type === "error" && m.seq == null) rej(new Error(m.error));
      for (const s of sessions) s.onmsg(m);
    };
    asrWorker.onerror = (e) => rej(new Error(e.message || "worker failed"));
    // Ask the adapter what it can do: no adapter means the CPU path; no shader-f16 means an fp32 encoder.
    let adapter = null;
    try {
      adapter = navigator.gpu && (await navigator.gpu.requestAdapter());
    } catch (e) {}
    if (!adapter) toast("No WebGPU: dictation will run on the CPU and be slower");
    asrWorker.postMessage({
      type: "load",
      model: ASR_MODELS[asrModel],
      webgpu: !!adapter,
      f16: !!(adapter && adapter.features.has("shader-f16")),
    });
  });
  asrReady.catch(() => {
    asrReady = null;
    try {
      asrWorker.terminate();
    } catch (e) {}
    asrWorker = null;
  });
  return asrReady;
}
// After a re-render only a listener whose field is gone is stopped; closing the panel stops any.
export function stopDictation(all) {
  if (active && (all || !active.field.isConnected)) active.stop();
}
// mic(fields): a button that dictates into the last-focused of `fields` at its caret.
export function mic(fields) {
  if (!HAS_MIC) return null;
  const b = document.createElement("button");
  b.className = "ib sm mic";
  b.title = "Dictate";
  b.setAttribute("aria-label", "Dictate");
  b.type = "button";
  const idle = () => {
    b.innerHTML = ico("mic");
    b.classList.remove("on", "busy");
  };
  idle();
  let target = fields[0];
  fields.forEach((f) => f.addEventListener("focus", () => (target = f)));
  b.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (active) {
      const mine = active.btn === b;
      active.stop();
      if (mine) return;
    }
    // One press at a time: the model load and the permission prompt are both awaits a second press could slip through.
    if (starting) return;
    starting = true;
    b.classList.add("busy");
    asrProgress = (pct) => {
      b.innerHTML = `<i>${pct}%</i>`;
    };
    try {
      await loadAsr();
    } catch (err) {
      idle();
      asrProgress = () => {};
      starting = false;
      toast("Dictation model could not load: " + err.message);
      return;
    }
    asrProgress = () => {};
    b.innerHTML = ico("mic");
    if (!b.isConnected) {
      idle();
      starting = false;
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true },
      });
    } catch (err) {
      idle();
      starting = false;
      toast("Microphone not available: " + (err.name === "NotAllowedError" ? "permission denied" : err.message));
      return;
    }
    if (active) active.stop();
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET_SRC], { type: "text/javascript" })));
    const src = ctx.createMediaStreamSource(stream),
      tap = new AudioWorkletNode(ctx, "kz-tap");
    src.connect(tap);
    // Text lands where the caret is when each chunk arrives (or after the last insertion when the
    // field is not focused), so typing while the mic is on is kept.
    const f = target;
    let at = f.selectionStart ?? f.value.length;
    const vu = document.createElement("span");
    vu.className = "vu";
    vu.setAttribute("aria-hidden", "true");
    vu.innerHTML = [0.5, 0.9, 1.3, 0.8, 0.45].map((w) => `<i style="--w:${w}"></i>`).join("");
    let buf = [],
      len = 0,
      voiced = 0,
      quiet = 0,
      seq = 0,
      done = 0,
      pending = new Map(),
      stopping = false;
    const SR = 16000,
      MAX = 6 * SR,
      SIL = 0.8 * SR,
      MIN = 1 * SR;
    const insert = (t) => {
      if (!t || !f.isConnected) return;
      const v = f.value;
      if (document.activeElement === f) at = f.selectionStart;
      at = Math.min(at, v.length);
      const head = v.slice(0, at),
        sep = head && !/\s$/.test(head) ? " " : "";
      f.value = head + sep + t + v.slice(at);
      at = head.length + sep.length + t.length;
      f.selectionStart = f.selectionEnd = at;
      f.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const flush = () => {
      if (!len || voiced < MIN) {
        buf = [];
        len = 0;
        voiced = 0;
        quiet = 0;
        return;
      }
      const a = new Float32Array(len);
      let o = 0;
      for (const c of buf) {
        a.set(c, o);
        o += c.length;
      }
      buf = [];
      len = 0;
      voiced = 0;
      quiet = 0;
      pending.set(seq, null);
      asrWorker.postMessage({ type: "run", sid, seq, audio: a }, [a.buffer]);
      seq++;
      b.classList.add("busy");
    };
    const drain = () => {
      while (pending.has(done) && pending.get(done) !== null) {
        insert(pending.get(done));
        pending.delete(done);
        done++;
      }
      if (!pending.size) {
        b.classList.remove("busy");
        if (stopping) {
          idle();
          sessions.delete(sess);
        }
      }
    };
    tap.port.onmessage = (e) => {
      const c = e.data;
      buf.push(c);
      len += c.length;
      let s = 0;
      for (let i = 0; i < c.length; i++) s += c[i] * c[i];
      const rms = Math.sqrt(s / c.length);
      if (rms > 0.01) {
        voiced += c.length;
        quiet = 0;
      } else quiet += c.length;
      {
        const l = Math.min(1, rms * 8).toFixed(2);
        f.style.setProperty("--lvl", l);
        vu.style.setProperty("--lvl", l);
      }
      if (len >= MAX || (voiced >= MIN && quiet >= SIL)) flush();
    };
    // Chunk seqs are per session, so a result is matched by session id too.
    const sid = Math.random().toString(36).slice(2);
    const sess = {
      btn: b,
      field: f,
      onmsg: (m) => {
        if (m.sid !== sid) return;
        if (m.type === "text") {
          pending.set(m.seq, m.text);
          drain();
        } else if (m.type === "error" && m.seq != null) {
          pending.set(m.seq, "");
          toast("Dictation failed: " + m.error);
          drain();
        }
      },
      stop: () => {
        if (stopping) return;
        stopping = true;
        b.classList.remove("on");
        f.classList.remove("dictating");
        f.style.removeProperty("--lvl");
        b.innerHTML = ico("mic");
        try {
          tap.port.onmessage = null;
          src.disconnect();
          tap.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          ctx.close();
        } catch (e) {}
        active = null;
        flush();
        drain();
      },
    };
    sessions.add(sess);
    active = sess;
    starting = false;
    b.classList.remove("busy");
    b.classList.add("on");
    f.classList.add("dictating");
    b.replaceChildren(vu);
    f.focus();
  };
  return b;
}
