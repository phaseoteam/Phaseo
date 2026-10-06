import { useCanGoBack } from "@tanstack/react-router";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

export function WorkspaceNavigation() {
  const canGoBack = useCanGoBack();
  return (
    <nav aria-label="Navigation history" className="flex shrink-0 items-center gap-0.5 [-webkit-app-region:no-drag]">
      <Tooltip>
        <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Go back" disabled={!canGoBack} onClick={() => window.history.back()} />}>
          <ArrowLeftIcon />
        </TooltipTrigger>
        <TooltipPopup>Back</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Go forward" onClick={() => window.history.forward()} />}>
          <ArrowRightIcon />
        </TooltipTrigger>
        <TooltipPopup>Forward</TooltipPopup>
      </Tooltip>
    </nav>
  );
}
