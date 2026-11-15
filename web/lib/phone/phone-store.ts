// The phone's Home (agents, devices, recent runs, usage) and Runs pages: which one shows, the devices and the usage the
// board reads for them. The runs and agents are the side menu's data (lib/rail). components/phone/phone-home.tsx draws it.
import { create } from "zustand";
import type { Net, Usage } from "./phone-home.ts";

export type PhoneMode = "home" | "device" | null;
export const usePhone = create<{ mode: PhoneMode; net: Net; usage: Usage[]; allDevices: boolean }>()(() => ({
  mode: null,
  net: { self: null, computers: [], tailscale: false },
  usage: [],
  allDevices: false,
}));
const fetchNet = async () => {
  try {
    const [p, u] = await Promise.all([
      fetch("/phone").then((r) => r.json()),
      fetch("/usage").then((r) => (r.ok ? r.json() : [])),
    ]);
    usePhone.setState({
      net: { self: p.self ?? null, computers: p.computers ?? [], tailscale: !!p.tailscale },
      usage: u,
    });
  } catch {
    /* the page keeps what it had */
  }
};
// Home (devices) or Runs (this machine); null when neither shows. Home reads the devices each time it opens.
export function openPhone(mode: PhoneMode) {
  usePhone.setState({ mode });
  if (mode === "home") void fetchNet();
}
export const toggleDevices = () => usePhone.setState((s) => ({ allDevices: !s.allDevices }));
