import { qrSrc } from "../../lib/phone/index.ts";

// The QR a phone scans: the server's SVG shown as an image, white with its own quiet zone so it scans in a dark theme.
export function QrCode({ svg, label }: { svg: string; label: string }) {
  return <img src={qrSrc(svg)} alt={label} className="w-[168px] flex-none rounded-md" />;
}
