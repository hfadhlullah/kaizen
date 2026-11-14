import { useState } from "react";
import { faviconUrl, PLAT } from "../lib/icebox/index.ts";
import { Icon } from "../ui/icon.tsx";

// The mark of where a request came from: a social platform's own mark, else the favicon of the site (asked of that
// site itself, so nothing but its host reaches anyone), else `fallback` from the sprite once the image fails.
export function Favicon({
  url,
  social,
  fallback = "link",
  size = 16,
}: {
  url: string;
  social?: string | null;
  fallback?: string;
  size?: number;
}) {
  const [bad, setBad] = useState(false),
    src = faviconUrl(url);
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {social && PLAT[social] ? (
        <Icon name={"b-" + social} style={{ width: size - 2, height: size - 2 }} />
      ) : src && !bad ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBad(true)}
          className="rounded-xs bg-white p-px"
          style={{ width: size, height: size }}
        />
      ) : (
        <Icon name={fallback} style={{ width: size - 2, height: size - 2 }} />
      )}
    </span>
  );
}
