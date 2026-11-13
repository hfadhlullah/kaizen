import { toast as sonner } from "sonner";

// The board's one toast, old pages and new: web/board/toast.ts forwards here. With `report`, the toast carries
// a link to a prefilled GitHub bug form (/issue) and stays long enough to click it. One at a time, as before.
export function toast(message: string, report?: Record<string, string>) {
  sonner(message, {
    id: "kz-toast",
    duration: report ? 8000 : 4000,
    action: report
      ? {
          label: "Report",
          onClick: () => void window.open("/issue?" + new URLSearchParams(report), "_blank", "noopener"),
        }
      : undefined,
  });
}
