"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search } from "lucide-react";

export default function InvestigateGeneration() {
	const [open, setOpen] = React.useState(false);
	const [id, setId] = React.useState("");
	const [loading, setLoading] = React.useState(false);
	const [result, setResult] = React.useState<any | null>(null);
	const [apiKey, setApiKey] = React.useState("");

	React.useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const stored = window.localStorage.getItem(
				"aistats_gateway_api_key"
			);
			if (stored) setApiKey(stored);
		} catch {
			// ignore storage errors
		}
	}, []);

	React.useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			if (apiKey) {
				window.localStorage.setItem("aistats_gateway_api_key", apiKey);
			} else {
				window.localStorage.removeItem("aistats_gateway_api_key");
			}
		} catch {
			// ignore storage errors
		}
	}, [apiKey]);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!id.trim()) return;
		try {
			if (!apiKey.trim()) {
				toast.error("Conduit API key required");
				return;
			}
			setLoading(true);
			setResult(null);
			const base = (
				process.env.NEXT_PUBLIC_GATEWAY_API_BASE_URL ?? ""
			).replace(/\/+$/, "");
			const target = `${base}/v1/generation?id=${encodeURIComponent(
				id.trim()
			)}`;
			const res = await fetch(
				target.startsWith("http")
					? target
					: target ||
							"/v1/generation?id=" +
								encodeURIComponent(id.trim()),
				{
					cache: "no-store",
					headers: {
						Authorization: `Bearer ${apiKey.trim()}`,
					},
				}
			);
			if (!res.ok) {
				toast.error(
					res.status === 404
						? "Not found / not authorized"
						: "Failed to fetch"
				);
				return;
			}
			const json = await res.json();
			setResult(json);
			toast.success("Loaded generation");
		} catch {
			toast.error("Failed to load generation");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Search className="mr-2" />
					Investigate Generation
				</Button>
			</DialogTrigger>
			<DialogContent
				className={result ? "w-[80vw] max-w-none" : undefined}
				style={result ? { width: "80vw" } : undefined}
			>
				<DialogHeader>
					<DialogTitle>Investigate Generation</DialogTitle>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-3">
					<div className="flex gap-2">
						<Input
							placeholder="Enter request_id"
							value={id}
							onChange={(e) => setId(e.target.value)}
						/>
						<Button type="submit" disabled={loading}>
							{loading ? "Loading..." : "Lookup"}
						</Button>
					</div>
					<Input
						type="password"
						placeholder="Conduit API key"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
					/>
				</form>
				{result ? (
					<div className="max-h-[60vh] overflow-auto">
						<pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap break-words">
							{JSON.stringify(result, null, 2)}
						</pre>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
