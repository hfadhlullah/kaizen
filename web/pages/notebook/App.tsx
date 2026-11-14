import { Toaster, TooltipProvider } from "@web/ui";
import { AddProjectDialog, WsMenu } from "@components/project";
import { SearchPalette } from "@components/search";
import { AskHost } from "@components/shared";
import { Rail, Sprite } from "@components/shell";
import { setPortalRoot } from "@lib/core";
import { NotebookPage } from "../notebook-page.tsx";

// The Notebook app: the providers, the side menu (the board's, with its Projects list), the Notes page and the kit's popups
// (#kz-kit, where every menu, dialog and toast is drawn; the board's is #kz-portal). An embedded note (?embed=1, a tab of
// the run workspace) is the note alone: no side menu, and only toasts and questions.
export function App({ embed }: { embed: boolean }) {
  return (
    <TooltipProvider>
      <Sprite notebook />
      {!embed && <Rail />}
      <NotebookPage />
      <div id="kz-kit" className="kz-ui" ref={setPortalRoot}>
        <div>
          <Toaster />
          <AskHost />
          {!embed && (
            <>
              <SearchPalette />
              <WsMenu />
              <AddProjectDialog />
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
