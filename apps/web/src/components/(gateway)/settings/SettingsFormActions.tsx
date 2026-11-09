import type { ReactNode } from "react";

export function SettingsFormActions({ children, status, active = false, error = false }: {
	children: ReactNode;
	status?: ReactNode;
	active?: boolean;
	error?: boolean;
}) {
	return <div className={`border-t bg-background py-4 ${active ? "sticky bottom-0 z-10" : ""}`}>
		<div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
			{status != null ? <div className="me-auto min-w-0 basis-full text-sm text-muted-foreground sm:basis-0 sm:grow" role={error ? "alert" : "status"} aria-live="polite">
				{status}
			</div> : null}
			<div className="flex max-w-full flex-wrap items-center justify-end gap-3">{children}</div>
		</div>
	</div>;
}
