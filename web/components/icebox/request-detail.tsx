import { ago, iceKey, isLive, srcName, webUrl, type IceItem, type RowCtx } from "@lib/icebox";
import { cn } from "@lib/core";
import { PromoteForm } from "./promote-form.tsx";
import { ReplyBox } from "./reply-box.tsx";
import { RequestActions } from "./request-actions.tsx";
import { RequestImages } from "./request-images.tsx";

// An open request: what was gathered (notes, pictures, where from), the reply box for a gathered post and the promote
// form. A phone row also offers what its gestures do, for anyone who cannot swipe or hold.
export function RequestDetail({
  item,
  ctx,
  chat,
  phone,
}: {
  item: IceItem;
  ctx: RowCtx;
  chat: boolean;
  phone?: boolean;
}) {
  return (
    <div className={cn("-mt-px grid gap-2 rounded-b-sm bg-muted py-1.5 pr-3 pb-3 pl-[61px]", phone && "pl-3")}>
      {item.notes && (
        <div className="whitespace-pre-wrap break-words text-sm leading-[1.45] text-muted-foreground">{item.notes}</div>
      )}
      <RequestImages item={item} />
      <span className="text-sm text-muted-foreground">
        From {srcName(ctx.list, item)} · {ago(item.at)}
        {item.post && (
          <>
            {" · "}
            <a href={webUrl(item.post)} target="_blank" rel="noopener" className="underline">
              open post
            </a>
          </>
        )}
      </span>
      {phone && isLive(item) && <RequestActions item={item} boards={ctx.boards} variant="phone" />}
      <ReplyBox item={item} chat={chat} />
      {ctx.armed === iceKey(item) && <PromoteForm item={item} chat={chat} />}
    </div>
  );
}
