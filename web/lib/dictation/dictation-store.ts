// What each microphone button shows. The engine (engine.ts) writes it; the button (components/shared MicButton) reads its own
// entry. Nothing here is the recording: the worker, the stream and the chunks stay in the engine.
import { create } from "zustand";

export type MicState = {
  loading: boolean; // the model is being fetched or started
  pct: number | null; // how far the fetch is, once it reports
  on: boolean; // listening
  busy: boolean; // loading, or a chunk is being turned into text
};
export const IDLE: MicState = { loading: false, pct: null, on: false, busy: false };

export const useMic = create<{ st: Record<string, MicState> }>()(() => ({ st: {} }));
export const micOf = (id: string) => useMic.getState().st[id] ?? IDLE;
export const markMic = (id: string, p: Partial<MicState>) =>
  useMic.setState((s) => ({ st: { ...s.st, [id]: { ...(s.st[id] ?? IDLE), ...p } } }));
export const idleMic = (id: string) =>
  useMic.setState((s) => {
    if (!(id in s.st)) return s;
    const { [id]: _gone, ...st } = s.st;
    return { st };
  });
