import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type HttpMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "HEAD"
    | "OPTIONS";

const methodBadgeStyles: Record<HttpMethod, string> = {
    GET: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300",
    POST: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    PUT: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
    PATCH: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300",
    DELETE: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
    HEAD: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300",
    OPTIONS: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300",
};

export function HttpMethodBadge({
    method,
    className,
}: {
    method: HttpMethod;
    className?: string;
}) {
    return (
        <Badge
            variant="outline"
            className={cn(
                "h-5 min-w-[58px] justify-center rounded-md px-1.5 py-0",
                "font-mono text-[10px] font-bold uppercase tracking-[0.08em]",
                "shadow-none",
                methodBadgeStyles[method],
                className,
            )}
        >
            {method}
        </Badge>
    );
}
