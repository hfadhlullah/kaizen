// The footer's words, with no DOM: what the phone chip says, and how the terminal count reads.
export type PhoneNet = { tailscale?: boolean; online?: boolean; phones?: number; devices?: { name: string; os: string }[] };
// `icons` are the sprite's i-<name>: one per online phone, apple or android, or the plain phone when the kind is unknown.
export type PhoneStatus = { text: string; on: boolean; tip: string };
export function phoneStatus(d: PhoneNet): PhoneStatus {
  if (!d.tailscale) return { text: "Tailscale off", on: false, tip: "Tailscale is not running on this computer" };
  if (d.online) {
    const names = (d.devices ?? []).map((x) => x.name).filter(Boolean);
    const who = names.length ? names.join(" + ") : "Phone";
    return { text: `${who} connected`, on: true, tip: `${names.length ? who : "A phone"} is online on your tailnet` };
  }
  return {
    text: "Phone offline",
    on: false,
    tip: d.phones ? "Your phone is not online on the tailnet" : "No phone on your tailnet",
  };
}
export const terminalsTitle = (n: number) => `${n} live terminal${n === 1 ? "" : "s"}: show them all`;
