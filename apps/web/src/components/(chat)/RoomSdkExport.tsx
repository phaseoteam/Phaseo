"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Code, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sdkCode, sdkExportStore } from "@/lib/chat/sdkExport";

export function RoomSdkExport() {
  const request = useSyncExternalStore(sdkExportStore.subscribe, sdkExportStore.get, () => null);
  const pathname = usePathname();
  const [language, setLanguage] = useState<"typescript" | "python">("typescript");
  const [notice, setNotice] = useState("");
  useEffect(() => { sdkExportStore.set(null); }, [pathname]);
  if (!request) return null;
  const code = sdkCode(request, language);
  const trigger = (
    <Tooltip>
      <TooltipTrigger asChild>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Get code">
            <Code className="size-4" />
          </Button>
        </DialogTrigger>
      </TooltipTrigger>
      <TooltipContent>Get code</TooltipContent>
    </Tooltip>
  );
  return <Dialog>
    {trigger}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Use this request in your app</DialogTitle><DialogDescription>Code for the last submitted request, including its model and settings. Run it on your server.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={language === "typescript" ? "secondary" : "ghost"} size="sm" aria-pressed={language === "typescript"} onClick={() => { setLanguage("typescript"); setNotice(""); }}>TypeScript</Button>
          <Button variant={language === "python" ? "secondary" : "ghost"} size="sm" aria-pressed={language === "python"} onClick={() => { setLanguage("python"); setNotice(""); }}>Python</Button>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => { void navigator.clipboard.writeText(code).then(() => setNotice("Copied"), () => setNotice("Could not copy. Select the code below.")); }}><Copy className="size-4" />Copy</Button>
          <span role="status" className="text-xs">{notice}</span>
        </div>
        <pre tabIndex={0} className="max-h-[55vh] overflow-auto rounded-md bg-muted p-4 text-xs"><code>{code}</code></pre>
      </DialogContent>
    </Dialog>;
}
