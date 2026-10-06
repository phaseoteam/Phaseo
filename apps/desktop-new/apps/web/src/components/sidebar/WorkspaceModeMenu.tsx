import { Code2Icon, MessagesSquareIcon, ChevronDownIcon } from "lucide-react";
import { useWorkspaceModeStore } from "../../workspaceModeStore";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuRadioItemIndicator, MenuTrigger } from "../ui/menu";

export function WorkspaceModeMenu() {
  const mode = useWorkspaceModeStore((state) => state.mode);
  const setMode = useWorkspaceModeStore((state) => state.setMode);
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="sm" aria-label="Workspace mode" className="shrink-0" />}>
        {mode === "chat" ? "Chat" : "Code"}
        <ChevronDownIcon className="size-3" />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup value={mode} onValueChange={(value) => {
          if (value === "chat" || value === "code") setMode(value);
        }}>
          <MenuRadioItem value="chat">
            <span className="flex items-center gap-2"><MessagesSquareIcon /><span className="flex-1">Chat</span><MenuRadioItemIndicator /></span>
          </MenuRadioItem>
          <MenuRadioItem value="code">
            <span className="flex items-center gap-2"><Code2Icon /><span className="flex-1">Code</span><MenuRadioItemIndicator /></span>
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
