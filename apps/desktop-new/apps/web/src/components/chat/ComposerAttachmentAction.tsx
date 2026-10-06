import type { RefObject } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Upload handling stays shared between the expanded and resting composer. */
export function ComposerAttachmentAction({
  inputRef,
  onAttach,
  onFocus,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onAttach: (files: File[]) => Promise<boolean>;
  onFocus: () => void;
}) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          // Attachment chips refocus after rendering; avoid restoring stale editor text.
          void onAttach(files).then((inserted) => {
            if (!inserted) onFocus();
          });
        }}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => inputRef.current?.click()}
              aria-label="Attach files"
            />
          }
        >
          <PlusIcon />
        </TooltipTrigger>
        <TooltipPopup>Attach files</TooltipPopup>
      </Tooltip>
    </>
  );
}
