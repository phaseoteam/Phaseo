"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Braces, Info, TerminalSquare } from "lucide-react";
import { Logo } from "@/components/Logo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildProviderRoutingExample, ROUTING_LANGUAGES, type RoutingLanguage } from "./providerRoutingExamples";

const CodeBlock = dynamic(() => import("../quickstart/CodeBlock"));

export function ProviderRoutingHelp({ providerId, modelId, serviceTier, endpoint }: {
    providerId: string;
    modelId: string;
    serviceTier: string;
    endpoint: string;
}) {
    const [open, setOpen] = useState(false);
    const [language, setLanguage] = useState<RoutingLanguage>("json");
    const triggerRef = useRef<HTMLButtonElement>(null);
    const pinnedRef = useRef(false);
    const selectedLanguage = ROUTING_LANGUAGES.find(option => option.id === language)!;
    const code = buildProviderRoutingExample({ providerId, modelId, serviceTier, endpoint, language });

    return (
        <HoverCard open={open} onOpenChange={(nextOpen, details) => {
            if (!nextOpen && pinnedRef.current && (details.reason === "trigger-hover" || details.reason === "trigger-focus")) return;
            if (!nextOpen) pinnedRef.current = false;
            setOpen(nextOpen);
        }}>
            <HoverCardTrigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    aria-label="About provider-specific routing"
                    aria-expanded={open}
                    onClick={() => {
                        pinnedRef.current = true;
                        setOpen(true);
                    }}
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                    <Info aria-hidden="true" className="size-3" />
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                align="end"
                className="w-[min(28rem,calc(100vw-2rem))] max-h-[min(36rem,75vh)] overflow-y-auto rounded-xl p-3 font-sans"
                onKeyDown={event => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    event.stopPropagation();
                    pinnedRef.current = false;
                    triggerRef.current?.focus();
                    setOpen(false);
                }}
            >
                <p className="text-xs font-semibold text-foreground">Provider-specific routing</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use this slug to route to this specific provider. You can also add <code>provider.only</code> to your request as shown below.
                </p>
                <a href="/docs/v1/guides/provider-qualified-models" className="mt-2 inline-block text-xs font-medium text-foreground underline underline-offset-4 hover:text-foreground">
                    Read the routing docs
                </a>
                <Separator className="my-3" />
                {serviceTier === "batch" ? (
                    <p className="mb-2 text-xs text-muted-foreground">Use the Batch API for this tier.</p>
                ) : null}
                <Tabs value={language} onValueChange={value => setLanguage(value as RoutingLanguage)}>
                    <TabsList aria-label="Routing example language" className="h-auto! w-full flex-wrap justify-start">
                        {ROUTING_LANGUAGES.map(option => (
                            <TabsTrigger key={option.id} value={option.id} aria-label={option.label} title={option.label} className="h-8 w-9 flex-none">
                                {option.id === "json" ? <Braces aria-hidden="true" className="size-4" />
                                    : option.id === "curl" ? <TerminalSquare aria-hidden="true" className="size-4" />
                                        : <Logo id={option.id} alt="" width={16} height={16} className="object-contain" />}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <TabsContent value={language}>
                        <CodeBlock key={`${language}-${providerId}-${modelId}-${serviceTier}`} code={code} lang={selectedLanguage.lang} label={selectedLanguage.label} />
                    </TabsContent>
                </Tabs>
            </HoverCardContent>
        </HoverCard>
    );
}
