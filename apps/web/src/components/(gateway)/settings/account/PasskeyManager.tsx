"use client";

import * as React from "react";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

type Passkey = {
	id: string;
	friendly_name?: string;
	created_at: string;
	last_used_at?: string;
};

export function PasskeyManager() {
	const [passkeys, setPasskeys] = React.useState<Passkey[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [pending, setPending] = React.useState(false);

	const load = React.useCallback(async () => {
		setLoading(true);
		try {
			const { data, error } = await createClient().auth.passkey.list();
			if (error) throw error;
			setPasskeys((data ?? []) as Passkey[]);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not load passkeys";
			if (!message.includes("passkey_disabled")) toast.error(message);
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void load();
	}, [load]);

	async function register() {
		setPending(true);
		try {
			const { error } = await createClient().auth.registerPasskey();
			if (error) throw error;
			toast.success("Passkey added");
			await load();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not add passkey";
			toast.error(message.includes("passkey_disabled") ? "Passkeys are not enabled for this environment yet." : message);
		} finally {
			setPending(false);
		}
	}

	async function remove(passkeyId: string) {
		setPending(true);
		try {
			const { error } = await createClient().auth.passkey.delete({ passkeyId });
			if (error) throw error;
			setPasskeys((items) => items.filter((item) => item.id !== passkeyId));
			toast.success("Passkey removed");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not remove passkey");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="rounded-lg border bg-background p-4 sm:p-5 space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" />Passkeys</h3>
					<p className="mt-1 text-sm text-muted-foreground">Sign in with your device biometrics, PIN, or security key.</p>
				</div>
				<Button onClick={register} disabled={pending}>
					{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Add passkey
				</Button>
			</div>
			{loading ? <p className="text-sm text-muted-foreground">Loading passkeys...</p> : null}
			{!loading && passkeys.length === 0 ? <p className="text-sm text-muted-foreground">No passkeys added yet.</p> : null}
			{passkeys.map((passkey) => (
				<div key={passkey.id} className="flex items-center justify-between gap-3 border-t pt-3">
					<div className="min-w-0 text-sm"><p className="truncate font-medium">{passkey.friendly_name || "Passkey"}</p><p className="text-muted-foreground">Added {new Date(passkey.created_at).toLocaleDateString()}</p></div>
					<Button variant="ghost" size="icon" aria-label="Remove passkey" onClick={() => remove(passkey.id)} disabled={pending}><Trash2 className="h-4 w-4" /></Button>
				</div>
			))}
		</div>
	);
}
