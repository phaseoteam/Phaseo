import { Code2Icon, MessagesSquareIcon, ChevronDownIcon } from "lucide-react";
import { useWorkspaceModeStore } from "../../workspaceModeStore";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";

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
          <MenuRadioItem value="chat"><MessagesSquareIcon />Chat</MenuRadioItem>
          <MenuRadioItem value="code"><Code2Icon />Code</MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
