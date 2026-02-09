import { Loader2 } from "lucide-react";

export default function AuthLoading() {
	return (
		<div className="flex min-h-[45vh] items-center justify-center px-4 py-10">
			<div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin text-primary" />
				<span>Loading auth...</span>
			</div>
		</div>
	);
}
