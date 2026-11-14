import type { ReactNode } from "react";
import { Icon } from "../../ui/icon.tsx";

// An empty list: icon, a line that says what it is, one line of help, and the way forward.
export function EmptyState({
  icon,
  title,
  help,
  children,
  busy,
}: {
  icon?: string;
  title: string;
  help?: string;
  children?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div
      role={busy ? "status" : undefined}
      className="flex flex-col items-center gap-1 px-6 py-14 text-center text-lg text-muted-foreground"
    >
      {icon && <Icon name={icon} className="mb-3 size-8 opacity-60" />}
      <p className="text-[16px] font-medium text-foreground">{title}</p>
      {help && <span>{help}</span>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
