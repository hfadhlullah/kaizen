import { useEffect, useState } from "react";
import { getText } from "../api.ts";
import { TEXT_LIMIT } from "../task-results.ts";

// A saved text output, fetched when its viewer opens; over 1 MB is cut short.
export function useSavedText(url: string) {
  const [text, setText] = useState("Loading saved text…");
  useEffect(() => {
    let live = true;
    setText("Loading saved text…");
    getText(url)
      .then(
        (v) =>
          live &&
          setText(
            v.length > TEXT_LIMIT ? v.slice(0, TEXT_LIMIT) + "\nPreview shortened. Download for the whole file." : v,
          ),
      )
      .catch(() => live && setText("The saved file could not be read. Try Download or refresh the task."));
    return () => {
      live = false;
    };
  }, [url]);
  return text;
}
