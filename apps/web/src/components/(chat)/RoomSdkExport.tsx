"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Bot, Check, Code, Copy, Terminal, WrapText } from "lucide-react";
import type { BundledLanguage } from "shiki";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  agentSdkSupportReason,
  convertTextProtocol,
  protocolSwitchSupportReason,
  sdkCode,
  sdkExportStore,
  textProtocolForRequest,
  type SdkLanguage,
  type SdkSample,
  type TextProtocol,
} from "@/lib/chat/sdkExport";
import { cn } from "@/lib/utils";

type Integration = {
  id: SdkSample;
  group: "HTTP" | "SDK" | "Agent SDK";
  title: string;
  packageName: string;
  language: SdkLanguage | "bash";
  isAgent?: boolean;
};

const clientLanguages: Array<[SdkLanguage, string, string]> = [
  ["typescript", "TypeScript", "@phaseo/sdk"], ["python", "Python", "phaseo"],
  ["go", "Go", "sdk-go/v3"], ["csharp", "C#", "Phaseo.Sdk"],
  ["java", "Java", "app.phaseo:phaseo-sdk"], ["php", "PHP", "phaseo/sdk"],
  ["ruby", "Ruby", "phaseo_sdk"], ["cpp", "C++", "phaseo-cpp"], ["rust", "Rust", "phaseo"],
];
const agentLanguages = clientLanguages.filter(([language]) => language !== "cpp");
const agentPackages: Partial<Record<SdkLanguage, string>> = {
  typescript: "@phaseo/agent-sdk", python: "phaseo-agent-sdk", go: "agent-sdk-go",
  csharp: "Phaseo.AgentSdk", java: "app.phaseo:phaseo-agent-sdk", php: "phaseo/agent-sdk",
  ruby: "phaseo_agent_sdk", rust: "phaseo-agent",
};
const integrations: Integration[] = [
  { id: "curl", group: "HTTP", title: "cURL", packageName: "Raw HTTP", language: "bash" },
  ...clientLanguages.map(([language, title, packageName]) => ({ id: `sdk-${language}` as SdkSample, group: "SDK" as const, title, packageName, language })),
  ...agentLanguages.map(([language, title]) => ({ id: `agent-${language}` as SdkSample, group: "Agent SDK" as const, title, packageName: agentPackages[language]!, language, isAgent: true })),
];
const protocolOptions: Array<{ id: TextProtocol; label: string }> = [
  { id: "responses", label: "Responses" },
  { id: "chat-completions", label: "Chat Completions" },
  { id: "messages", label: "Messages" },
];
const shikiLanguages: Record<Integration["language"], BundledLanguage> = {
  bash: "bash", typescript: "ts", python: "python", go: "go", csharp: "csharp",
  java: "java", php: "php", ruby: "ruby", cpp: "cpp", rust: "rust",
};

function IntegrationMark({ language, isAgent }: Pick<Integration, "language" | "isAgent">) {
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background shadow-xs">
      {language === "bash" ? <Terminal className="size-4 text-foreground" aria-hidden /> : <Logo id={language} alt="" width={18} height={18} className="size-4.5" />}
      {isAgent && (
        <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full border border-border bg-background">
          <Logo id="phaseo" alt="" width={9} height={9} className="size-2" />
        </span>
      )}
    </span>
  );
}

export function RoomSdkExport() {
  const request = useSyncExternalStore(sdkExportStore.subscribe, sdkExportStore.get, () => null);
  const pathname = usePathname();
  const { preferences } = useDisplayPreferences();
  const [selection, setSelection] = useState<SdkSample>(() =>
    preferences.codeLanguage === "python" ? "sdk-python" : "sdk-typescript",
  );
  const [protocol, setProtocol] = useState<TextProtocol | null>(null);
  const [wrap, setWrap] = useState(false);
  const [notice, setNotice] = useState("");
  const copyGeneration = useRef(0);

  useEffect(() => { sdkExportStore.set(null); }, [pathname]);

  if (!request) return null;

  const sourceProtocol = textProtocolForRequest(request);
  const requestedProtocol = protocol ?? sourceProtocol;
  const requestedProtocolReason = requestedProtocol ? protocolSwitchSupportReason(request, requestedProtocol) : null;
  const activeProtocol = requestedProtocolReason ? sourceProtocol : requestedProtocol;
  const activeRequest = activeProtocol && sourceProtocol && activeProtocol !== sourceProtocol ? convertTextProtocol(request, activeProtocol) : request;
  const agentSupport = agentSdkSupportReason(activeRequest);
  const selectedIntegration = integrations.find((integration) => integration.id === selection) ?? integrations[0];
  const activeIntegration = selectedIntegration.isAgent && agentSupport ? integrations[0] : selectedIntegration;
  const code = sdkCode(activeRequest, activeIntegration.id);

  const selectIntegration = (id: SdkSample) => {
    copyGeneration.current += 1;
    setSelection(id);
    setNotice("");
  };
  const copyCode = () => {
    const generation = ++copyGeneration.current;
    void navigator.clipboard.writeText(code).then(
      () => { if (copyGeneration.current === generation) setNotice("Copied"); },
      () => { if (copyGeneration.current === generation) setNotice("Could not copy. Select the code below."); },
    );
  };

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Get code"><Code className="size-4" /></Button></DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Get code</TooltipContent>
      </Tooltip>

      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-border/70 px-5 py-4 pr-14">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-muted/40"><Logo id="phaseo" alt="Phaseo" width={20} height={20} className="size-5" /></span>
            <div className="min-w-0">
              <DialogTitle>Request samples</DialogTitle>
              <DialogDescription className="mt-0.5">Run this request with HTTP, a Phaseo SDK, or an Agent SDK.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 sm:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="max-h-[34vh] overflow-y-auto border-b border-border/70 bg-muted/20 p-3 sm:max-h-[calc(92vh-5rem)] sm:border-r sm:border-b-0">
            <div role="tablist" aria-label="Request sample integration" className="space-y-3">
              {(["HTTP", "SDK", "Agent SDK"] as const).map((group) => (
                <div key={group}>
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {group === "Agent SDK" && <Bot className="size-3" aria-hidden />}{group}
                  </div>
                  <div className={cn("grid gap-1", group !== "HTTP" && "grid-cols-2 sm:grid-cols-1")}>
                    {integrations.filter((integration) => integration.group === group).map((integration) => {
                      const unavailableReason = integration.isAgent ? agentSupport : null;
                      const selected = integration.id === activeIntegration.id;
                      return (
                        <button key={integration.id} type="button" role="tab" aria-selected={selected} aria-controls="request-sample-panel"
                          disabled={Boolean(unavailableReason)} title={unavailableReason ?? undefined} onClick={() => selectIntegration(integration.id)}
                          className={cn("flex min-w-0 items-center gap-2.5 rounded-md border px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45", selected ? "border-border bg-background shadow-xs" : "border-transparent hover:border-border/60 hover:bg-background/70")}>
                          <IntegrationMark language={integration.language} isAgent={integration.isAgent} />
                          <span className="min-w-0"><span className="block truncate text-sm font-medium">{integration.title}</span><span className="block truncate font-mono text-[10px] text-muted-foreground">{unavailableReason ?? integration.packageName}</span></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section id="request-sample-panel" role="tabpanel" className="min-w-0 overflow-y-auto p-4 sm:max-h-[calc(92vh-5rem)] sm:p-5">
            {sourceProtocol && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium text-muted-foreground">API shape</span>
                <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5" aria-label="Text API shape">
                  {protocolOptions.map((option) => {
                    const unavailableReason = protocolSwitchSupportReason(request, option.id);
                    const disabled = Boolean(unavailableReason && option.id !== sourceProtocol);
                    return <button key={option.id} type="button" disabled={disabled} title={disabled ? unavailableReason ?? undefined : undefined} onClick={() => setProtocol(option.id)} className={cn("rounded-sm px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40", activeProtocol === option.id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>;
                  })}
                </div>
              </div>
            )}

            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <IntegrationMark language={activeIntegration.language} isAgent={activeIntegration.isAgent} />
                <div className="min-w-0"><p className="truncate text-sm font-medium">{activeIntegration.title} {activeIntegration.group}</p><p className="truncate font-mono text-xs text-muted-foreground">{activeIntegration.packageName}</p></div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span role="status" className="hidden text-xs text-muted-foreground md:inline">{notice}</span>
                <Tooltip><TooltipTrigger asChild><Button type="button" variant={wrap ? "secondary" : "outline"} size="icon-sm" aria-label="Wrap code" aria-pressed={wrap} onClick={() => setWrap(value => !value)}><WrapText className="size-3.5" /></Button></TooltipTrigger><TooltipContent>{wrap ? "Disable word wrap" : "Wrap long lines"}</TooltipContent></Tooltip>
                <Button type="button" variant="outline" size="sm" onClick={copyCode}>{notice === "Copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{notice === "Copied" ? "Copied" : "Copy"}</Button>
              </div>
            </div>
            <CodeBlock code={code} language={shikiLanguages[activeIntegration.language]} showLineNumbers tabIndex={0} aria-label={`${activeIntegration.title} ${activeIntegration.group} request sample`}
              className={cn("[&_pre]:max-h-[45vh] [&_pre]:overflow-auto sm:[&_pre]:max-h-[59vh]", wrap ? "[&_code]:break-words [&_pre]:whitespace-pre-wrap [&_[data-line]]:whitespace-pre-wrap" : "[&_[data-line]]:min-w-max")} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
