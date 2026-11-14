import { useState } from "react";
import { host } from "@lib/core";
import { short } from "@lib/icebox";

// A project's mark: its own logo when the board found one, else its initial (also when the logo cannot be drawn).
export function ProjectMark({ dir, label = "", size = 16 }: { dir: string; label?: string; size?: number }) {
  const [bad, setBad] = useState(false),
    logo = host.projects().some((p) => p.dir === dir && p.logo);
  return logo && !bad ? (
    <img
      src={"/project-logo?dir=" + encodeURIComponent(dir)}
      alt=""
      loading="lazy"
      onError={() => setBad(true)}
      className="shrink-0 rounded-xs object-contain"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-xs bg-muted text-[10px] font-semibold text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {(short(label) || "?").charAt(0).toUpperCase()}
    </span>
  );
}
