export default function ChatPlaygroundShell() {
    return (
        <div className="flex h-dvh w-full">
            <aside className="hidden h-full w-64 flex-col border-r border-border bg-background md:flex">
                <div className="flex flex-1 flex-col gap-4 px-4 py-5">
                    <div className="h-8 w-28 rounded-md bg-muted/50" />
                    <div className="h-9 w-full rounded-md bg-muted/40" />
                    <div className="h-9 w-full rounded-md bg-muted/40" />
                    <div className="h-9 w-full rounded-md bg-muted/40" />
                    <div className="mt-2 h-px w-full bg-border" />
                    <div className="space-y-2">
                        <div className="h-6 w-24 rounded bg-muted/40" />
                        <div className="h-8 w-full rounded-md bg-muted/30" />
                        <div className="h-8 w-full rounded-md bg-muted/30" />
                        <div className="h-8 w-full rounded-md bg-muted/30" />
                    </div>
                </div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 items-center border-b border-border px-4">
                    <div className="h-8 w-40 rounded-md bg-muted/40" />
                </header>
                <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
                        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                            <div className="h-6 w-52 rounded bg-muted/40" />
                            <div className="h-24 w-full rounded-2xl border border-dashed border-border bg-muted/30" />
                            <div className="h-24 w-full rounded-2xl border border-dashed border-border bg-muted/30" />
                        </div>
                    </div>
                </main>
                <footer className="border-t border-border px-4 py-4 md:px-8">
                    <div className="mx-auto w-full max-w-3xl">
                        <div className="h-12 w-full rounded-2xl bg-muted/30" />
                    </div>
                </footer>
            </div>
        </div>
    );
}
