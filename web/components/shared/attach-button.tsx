import { useRef } from "react";
import { IconButton } from "./icon-button.tsx";

// The paper-clip: opens the file picker, hands back what was chosen. The names are listed by the form.
export function AttachButton({ onFiles, className }: { onFiles: (files: File[]) => void; className?: string }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
      <IconButton icon="clip" label="Attach files" className={className} onClick={() => file.current?.click()} />
      <input
        ref={file}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          e.target.value = "";
          onFiles(fs);
        }}
      />
    </>
  );
}
