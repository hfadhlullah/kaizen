import { PAGE_SIZES } from "@lib/shared";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@web/ui";

// Rows per page, the range and Prev/Next; absent while the whole list fits the smallest page.
export function Pager({
  at,
  size,
  total,
  onAt,
  onSize,
}: {
  at: number;
  size: number;
  total: number;
  onAt: (n: number) => void;
  onSize: (n: number) => void;
}) {
  if (total <= PAGE_SIZES[0]) return null;
  const from = at * size + 1,
    to = Math.min(total, from + size - 1);
  return (
    <div className="sticky bottom-0 z-[1] flex items-center justify-end gap-2.5 border-t border-border bg-background px-3 py-2 text-sm text-muted-foreground">
      <label className="mr-auto flex items-center gap-1.5">
        Rows
        <Select value={String(size)} onValueChange={(v) => onSize(Number(v))}>
          <SelectTrigger aria-label="Rows per page" size="sm" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <span>
        {from}–{to} of {total}
      </span>
      <Button size="sm" disabled={!at} onClick={() => onAt(at - 1)}>
        Prev
      </Button>
      <Button size="sm" disabled={to >= total} onClick={() => onAt(at + 1)}>
        Next
      </Button>
    </div>
  );
}
