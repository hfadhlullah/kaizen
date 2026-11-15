// The chat popup's page (`kaizen chat`): bundled into web/dist/popup.js by `bun run build:web`. It only starts the App
// (pages/popup/App.tsx) in <div id="root">.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../pages/popup/App.tsx";

createRoot(document.getElementById("root")!).render(createElement(App));
