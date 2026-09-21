"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Bot, Check, Code, Copy } from "lucide-react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { agentSdkSupportReason, sdkCode, sdkExportStore, type SdkSample } from "@/lib/chat/sdkExport";
import { cn } from "@/lib/utils";

type Integration = {
  id: SdkSample;
  group: "SDK" | "Agent SDK";
  title: string;
  packageName: string;
  language: "typescript" | "python";
  isAgent?: boolean;
};

const integrations: Integration[] = [
  { id: "sdk-typescript", group: "SDK", title: "TypeScript", packageName: "@phaseo/sdk", language: "typescript" },
  { id: "sdk-python", group: "SDK", title: "Python", packageName: "phaseo", language: "python" },
  { id: "agent-typescript", group: "Agent SDK", title: "TypeScript", packageName: "@phaseo/agent-sdk", language: "typescript", isAgent: true },
  { id: "agent-python", group: "Agent SDK", title: "Python", packageName: "phaseo-agent-sdk", language: "python", isAgent: true },
];

function IntegrationMark({ language, isAgent }: Pick<Integration, "language" | "isAgent">) {
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background shadow-xs">
      <Logo id={language} alt="" width={20} height={20} className="size-5" />
      {isAgent && (
        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border border-border bg-background">
          <Logo id="phaseo" alt="" width={10} height={10} className="size-2.5" />
        </span>
      )}
    </span>
  );
}

export function RoomSdkExport() {
  const request = useSyncExternalStore(sdkExportStore.subscribe, sdkExportStore.get, () => null);
  const pathname = usePathname();
  const [selection, setSelection] = useState<SdkSample>("sdk-typescript");
  const [notice, setNotice] = useState("");
  const copyGeneration = useRef(0);

  useEffect(() => { sdkExportStore.set(null); }, [pathname]);

  if (!request) return null;

  const agentSupport = agentSdkSupportReason(request);
  const selectedIntegration = integrations.find((integration) => integration.id === selection) ?? integrations[0];
  const activeIntegration = selectedIntegration.isAgent && agentSupport ? integrations[0] : selectedIntegration;
  const code = sdkCode(request, activeIntegration.id);

  const selectIntegration = (id: SdkSample) => {
    copyGeneration.current += 1;
    setSelection(id);
    setNotice("");
  };

  const copyCode = () => {
    const generation = ++copyGeneration.current;
    void navigator.clipboard.writeText(code).then(
      () => {
        if (copyGeneration.current === generation) setNotice("Copied");
      },
      () => {
        if (copyGeneration.current === generation) setNotice("Could not copy. Select the code below.");
      },
    );
  };

  return (
    <Dialog>
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

      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto p-0 sm:max-w-5xl sm:overflow-hidden">
        <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
              <Logo id="phaseo" alt="Phaseo" width={20} height={20} className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>Request samples</DialogTitle>
              <DialogDescription className="mt-1">
                Use the submitted request with a Phaseo SDK, or start an agent from the same model and input.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 sm:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="border-b border-border/70 bg-muted/20 p-3 sm:border-r sm:border-b-0">
            <div role="tablist" aria-label="Request sample integration" className="grid grid-cols-2 gap-3 sm:grid-cols-1">
              {(["SDK", "Agent SDK"] as const).map((group) => (
                <div key={group} className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {group === "Agent SDK" && <Bot className="size-3" aria-hidden />}
                    {group}
                  </div>
                  <div className="space-y-1">
                    {integrations.filter((integration) => integration.group === group).map((integration) => {
                      const unavailableReason = integration.isAgent ? agentSupport : null;
                      const selected = integration.id === activeIntegration.id;
                      return (
                        <button
                          key={integration.id}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls="request-sample-panel"
                          disabled={Boolean(unavailableReason)}
                          title={unavailableReason ?? undefined}
                          onClick={() => selectIntegration(integration.id)}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-3 rounded-lg border px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                            selected
                              ? "border-border bg-background shadow-xs"
                              : "border-transparent hover:border-border/60 hover:bg-background/70",
                          )}
                        >
                          <IntegrationMark language={integration.language} isAgent={integration.isAgent} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{integration.title}</span>
                            <span className="block truncate font-mono text-[11px] text-muted-foreground">
                              {unavailableReason ?? integration.packageName}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section id="request-sample-panel" role="tabpanel" className="min-w-0 p-4 sm:p-5">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <IntegrationMark language={activeIntegration.language} isAgent={activeIntegration.isAgent} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {activeIntegration.title} {activeIntegration.group}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{activeIntegration.packageName}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span role="status" className="text-xs text-muted-foreground">{notice}</span>
                <Button type="button" variant="outline" size="sm" onClick={copyCode}>
                  {notice === "Copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {notice === "Copied" ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <CodeBlock
              code={code}
              language={activeIntegration.language === "typescript" ? "ts" : "python"}
              showLineNumbers
              tabIndex={0}
              aria-label={`${activeIntegration.title} ${activeIntegration.group} request sample`}
              className="[&_[data-line]]:min-w-max [&_pre]:max-h-[42vh] [&_pre]:overflow-auto sm:[&_pre]:max-h-[55vh]"
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
