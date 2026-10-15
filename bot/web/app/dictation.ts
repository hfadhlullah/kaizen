import { $, el, icon, toast } from "./dom.ts";

// ---- dictation: Whisper in the page, adapted from the kaizen board (web/board/dictation.ts).
// Audio never leaves the browser. Library and model download only on the first press, from
// cdn.jsdelivr.net and huggingface.co, after a one-time note; nothing is fetched at page load.
const TFJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0",
  ASR_MODEL = "onnx-community/whisper-base";
const WORKER_SRC = `import{pipeline}from"${TFJS}";let asr=null;
onmessage=async e=>{const m=e.data;try{
 if(m.type==="load"){const prog=p=>{if(p.status==="progress")postMessage({type:"progress",file:p.file,pct:p.progress||0})};
  const gpu=m.webgpu?{device:"webgpu",dtype:{encoder_model:m.f16?"fp16":"fp32",decoder_model_merged:"q4"}}:null,cpu={device:"wasm",dtype:"q8"};
  try{if(!gpu)throw 0;asr=await pipeline("automatic-speech-recognition",m.model,{...gpu,progress_callback:prog})}
  catch(e){if(gpu)postMessage({type:"fallback",why:String(e&&e.message||e)});asr=await pipeline("automatic-speech-recognition",m.model,{...cpu,progress_callback:prog})}
  postMessage({type:"ready"})}
 if(m.type==="run"){const r=await asr(m.audio,{chunk_length_s:30,return_timestamps:false});postMessage({type:"text",sid:m.sid,seq:m.seq,text:(r.text||"").trim()})}
}catch(err){postMessage({type:"error",sid:m.sid,seq:m.seq,error:String(err&&err.message||err)})}}`;
const WORKLET_SRC = `class T extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("kz-tap",T)`;
const HAS_MIC = !!(
  navigator.mediaDevices &&
  navigator.mediaDevices.getUserMedia &&
  window.AudioWorkletNode &&
  window.WebAssembly &&
  window.Worker
);
let asrWorker = null,
  asrReady = null,
  asrProgress = () => {},
  active = null,
  starting = false;
const sessions = new Set();
function loadAsr() {
  if (asrReady) return asrReady;
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
      else if (m.type === "fallback") toast("GPU could not run the model, using the CPU");
      else if (m.type === "error" && m.seq == null) rej(new Error(m.error));
      for (const s of sessions) s.onmsg(m);
    };
    asrWorker.onerror = (e) => rej(new Error(e.message || "worker failed"));
    let adapter = null;
    try {
      adapter = navigator.gpu && (await navigator.gpu.requestAdapter());
    } catch {}
    asrWorker.postMessage({
      type: "load",
      model: ASR_MODEL,
      webgpu: !!adapter,
      f16: !!(adapter && adapter.features.has("shader-f16")),
    });
  });
  asrReady.catch(() => {
    asrReady = null;
    try {
      asrWorker.terminate();
    } catch {}
    asrWorker = null;
  });
  return asrReady;
}
export function setupMic() {
  const b = $("mic"),
    f = $("input"),
    form = $("composer");
  if (!HAS_MIC) {
    b.hidden = true;
    return;
  }
  const idle = () => {
    icon(b, "mic");
    b.classList.remove("on", "busy");
  };
  idle();
  b.onclick = async (e) => {
    e.preventDefault();
    if (active) {
      active.stop();
      return;
    }
    if (starting) return;
    let ok = false;
    try {
      ok = localStorage.dictationOk === "1";
    } catch {}
    if (!ok) {
      if (
        !confirm(
          "Dictation downloads a speech model (about 80 MB) once from huggingface.co and cdn.jsdelivr.net, then runs it in this browser. Your audio never leaves the browser. Continue?",
        )
      )
        return;
      try {
        localStorage.dictationOk = "1";
      } catch {}
    }
    starting = true;
    b.classList.add("busy");
    asrProgress = (pct) => b.replaceChildren(el("i", {}, `${pct}%`));
    try {
      await loadAsr();
    } catch (err) {
      idle();
      asrProgress = () => {};
      starting = false;
      toast(`Dictation could not load: ${err.message}. Typing and Enter still work.`);
      return;
    }
    asrProgress = () => {};
    icon(b, "mic");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true },
      });
    } catch (err) {
      idle();
      starting = false;
      toast(`Microphone not available: ${err.name === "NotAllowedError" ? "permission denied" : err.message}`);
      return;
    }
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET_SRC], { type: "text/javascript" })));
    const src = ctx.createMediaStreamSource(stream),
      tap = new AudioWorkletNode(ctx, "kz-tap");
    src.connect(tap);
    let at = f.selectionStart ?? f.value.length;
    const vu = el(
      "span",
      { class: "vu", "aria-hidden": "true" },
      [0.5, 0.9, 1.3, 0.8, 0.45].map(() => el("i")),
    );
    vu.querySelectorAll("i").forEach((i, k) => i.style.setProperty("--w", [0.5, 0.9, 1.3, 0.8, 0.45][k]));
    let buf = [],
      len = 0,
      voiced = 0,
      quiet = 0,
      seq = 0,
      done = 0,
      stopping = false;
    const pending = new Map(),
      SR = 16000,
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
      const l = Math.min(1, rms * 8).toFixed(2);
      form.style.setProperty("--lvl", l);
      vu.style.setProperty("--lvl", l);
      if (len >= MAX || (voiced >= MIN && quiet >= SIL)) flush();
    };
    const sid = Math.random().toString(36).slice(2);
    const sess = {
      onmsg: (m) => {
        if (m.sid !== sid) return;
        if (m.type === "text") {
          pending.set(m.seq, m.text);
          drain();
        } else if (m.type === "error" && m.seq != null) {
          pending.set(m.seq, "");
          toast(`Dictation failed: ${m.error}`);
          drain();
        }
      },
      stop: () => {
        if (stopping) return;
        stopping = true;
        b.classList.remove("on");
        form.classList.remove("dictating");
        icon(b, "mic");
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
    b.classList.remove("busy");
    b.classList.add("on");
    form.classList.add("dictating");
    b.replaceChildren(vu);
    f.focus();
  };
}
