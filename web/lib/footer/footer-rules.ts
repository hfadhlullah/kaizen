// The footer's words, with no DOM: what the phone chip says, and how the terminal count reads.
export type PhoneNet = { tailscale?: boolean; online?: boolean; phones?: number };
export type PhoneStatus = { text: string; on: boolean; tip: string };
export function phoneStatus(d: PhoneNet): PhoneStatus {
  if (!d.tailscale) return { text: "Tailscale off", on: false, tip: "Tailscale is not running on this computer" };
  if (d.online) return { text: "Phone connected", on: true, tip: "A phone is online on your tailnet" };
  return {
    text: "Phone offline",
    on: false,
    tip: d.phones ? "Your phone is not online on the tailnet" : "No phone on your tailnet",
  };
}
export const terminalsTitle = (n: number) => `${n} live terminal${n === 1 ? "" : "s"}: show them all`;
