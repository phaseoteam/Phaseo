import { Spinner } from "@/components/ui/spinner";

export function AuthSuspenseFallback() {
	return (
		<div className="grid min-h-svh place-items-center">
			<Spinner className="size-5 text-muted-foreground" />
		</div>
	);
}
