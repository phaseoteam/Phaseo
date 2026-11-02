"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowUpRight, Ban, Link2, Lock, Plus, RotateCcw, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { createCustomerRequest, createItemFromRequest, searchWorkItems, updateCustomerRequest } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CUSTOMER_REQUEST_STATUSES, type Customer, type CustomerRequest, type CustomerRequestStatus, type WorkItem } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { StateIcon, TimeAgo, useWorkCopy } from "./WorkBits";

export function RequestsView({ status, requests, customers }: { status: CustomerRequestStatus; requests: CustomerRequest[]; customers: Customer[] }) {
	const t = useTranslations("Work.requests");
	const [creating, setCreating] = useState(false);
	const [linking, setLinking] = useState<CustomerRequest | null>(null);
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("description")}</p>
				</div>
				<Button type="button" size="sm" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t("new")}</Button>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<nav aria-label={t("title")} className="flex gap-1">
					{CUSTOMER_REQUEST_STATUSES.map((name) => (
						<Link
							key={name}
							href={name === "new" ? "/work/requests" : `/work/requests?status=${name}`}
							aria-current={name === status ? "page" : undefined}
							className={cn("rounded-md px-2.5 py-1 text-sm transition-colors", name === status ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
						>
							{t(`tabs.${name}`)}
						</Link>
					))}
				</nav>
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3" aria-hidden="true" />{t("private")}</p>
			</div>
			{requests.length ? (
				<ul className="divide-y rounded-md border">
					{requests.map((request) => <RequestRow key={request.id} request={request} customers={customers} onLink={() => setLinking(request)} />)}
				</ul>
			) : <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t(`empty.${status}`)}</p>}
			{creating ? <NewRequestDialog customers={customers} onClose={() => setCreating(false)} /> : null}
			{linking ? <LinkItemDialog request={linking} onClose={() => setLinking(null)} /> : null}
		</div>
	);
}

function RequestRow({ request, customers, onLink }: { request: CustomerRequest; customers: Customer[]; onLink: () => void }) {
	const t = useTranslations("Work.requests");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const [expanded, setExpanded] = useState(false);
	const contact = [request.contactName, request.contactEmail].filter(Boolean).join(" · ");
	const createItem = async () => {
		const result = await perform("item", () => createItemFromRequest(request.id), { refresh: false });
		if (result.ok) router.push(`/work/${result.item.number}`);
	};
	return (
		<li className="space-y-2 px-3 py-3">
			<div className="flex flex-wrap items-start gap-x-3 gap-y-1">
				<div className="min-w-0 flex-1 space-y-0.5">
					<p className="truncate text-sm font-medium">{request.subject ?? t("untitled")}</p>
					<p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
						{contact ? <span>{contact}</span> : null}
						<span>{t(`sources.${request.source}`)}</span>
						<TimeAgo value={request.createdAt} />
						{request.workItemNumber ? <Link href={`/work/${request.workItemNumber}`} className="text-foreground hover:underline">{t("linkedTo", { number: request.workItemNumber })}</Link> : null}
					</p>
				</div>
				<Select value={request.customerId ?? "none"} disabled={busy !== null} onValueChange={(value) => perform("customer", () => updateCustomerRequest(request.id, { customerId: value === "none" ? null : value }))}>
					<SelectTrigger size="sm" aria-label={t("customer")} className="w-48 rounded-md">
						<SelectValue>{request.customerName ?? customers.find((customer) => customer.id === request.customerId)?.name ?? t("noCustomer")}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">{t("noCustomer")}</SelectItem>
						{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}
					</SelectContent>
				</Select>
			</div>
			<button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className={cn("block w-full text-left text-sm whitespace-pre-wrap text-foreground/90", !expanded && "line-clamp-3")}>
				{request.body}
			</button>
			<div className="flex flex-wrap gap-2">
				{request.status !== "linked" ? (
					<>
						<Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={createItem}><ArrowUpRight aria-hidden="true" />{t("createItem")}</Button>
						<Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={onLink}><Link2 aria-hidden="true" />{t("linkItem")}</Button>
					</>
				) : null}
				{request.status === "new" ? <Button type="button" size="xs" variant="ghost" disabled={busy !== null} onClick={() => perform("dismiss", () => updateCustomerRequest(request.id, { status: "dismissed" }))}><Ban aria-hidden="true" />{t("dismiss")}</Button> : null}
				{request.status === "dismissed" ? <Button type="button" size="xs" variant="ghost" disabled={busy !== null} onClick={() => perform("restore", () => updateCustomerRequest(request.id, { status: "new" }))}><RotateCcw aria-hidden="true" />{t("restore")}</Button> : null}
			</div>
		</li>
	);
}

function NewRequestDialog({ customers, onClose }: { customers: Customer[]; onClose: () => void }) {
	const t = useTranslations("Work.requests");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [draft, setDraft] = useState({ subject: "", body: "", contactName: "", contactEmail: "", customerId: "none" });
	const [error, setError] = useState<string | null>(null);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!draft.body.trim()) return setError(t("bodyRequired"));
		setError(null);
		const result = await perform("create", () => createCustomerRequest({
			body: draft.body.trim(),
			subject: draft.subject.trim() || undefined,
			contactName: draft.contactName.trim() || undefined,
			contactEmail: draft.contactEmail.trim() || undefined,
			customerId: draft.customerId === "none" ? undefined : draft.customerId,
		}));
		if (result.ok) onClose();
	};
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-lg">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader><DialogTitle>{t("new")}</DialogTitle></DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-subject`}>{t("subject")}</Label>
						<Input id={`${id}-subject`} autoFocus maxLength={300} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} className="rounded-md" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-body`}>{t("body")}</Label>
						<Textarea id={`${id}-body`} rows={5} maxLength={60000} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} className="rounded-md" />
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-name`}>{t("contactName")}</Label>
							<Input id={`${id}-name`} maxLength={200} value={draft.contactName} onChange={(event) => setDraft({ ...draft, contactName: event.target.value })} className="rounded-md" />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-email`}>{t("contactEmail")}</Label>
							<Input id={`${id}-email`} type="email" maxLength={320} value={draft.contactEmail} onChange={(event) => setDraft({ ...draft, contactEmail: event.target.value })} className="rounded-md" />
						</div>
					</div>
					<div className="space-y-1.5">
						<Label>{t("customer")}</Label>
						<Select value={draft.customerId} onValueChange={(value) => setDraft({ ...draft, customerId: value })}>
							<SelectTrigger aria-label={t("customer")} className="w-full rounded-md">
								<SelectValue>{customers.find((customer) => customer.id === draft.customerId)?.name ?? t("noCustomer")}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">{t("noCustomer")}</SelectItem>
								{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
						<Button type="submit" disabled={busy !== null}>{busy ? tCommon("saving") : tCommon("create")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function LinkItemDialog({ request, onClose }: { request: CustomerRequest; onClose: () => void }) {
	const t = useTranslations("Work.requests");
	const tCommon = useTranslations("Work.common");
	const copy = useWorkCopy();
	const { perform, busy } = useWorkAction();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<WorkItem[] | null>(null);

	// Search after a short pause in typing.
	useEffect(() => {
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			const result = await searchWorkItems(query.trim()).catch(() => null);
			if (!cancelled) setResults(result?.ok ? result.items : []);
		}, 200);
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [query]);

	const link = async (item: WorkItem) => {
		const result = await perform("link", () => updateCustomerRequest(request.id, { workItemNumber: item.number }));
		if (result.ok) onClose();
	};

	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-lg">
				<DialogHeader><DialogTitle>{t("linkTitle")}</DialogTitle></DialogHeader>
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
					<Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("linkSearch")} aria-label={t("linkSearch")} className="rounded-md pl-8" />
				</div>
				<ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
					{(results ?? []).map((item) => (
						<li key={item.id}>
							<button type="button" disabled={busy !== null} onClick={() => link(item)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50">
								<span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">#{item.number}</span>
								<StateIcon state={item.state} label={copy.state(item.state)} />
								<span className="min-w-0 flex-1 truncate">{item.title}</span>
							</button>
						</li>
					))}
					{results && !results.length ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("linkNoMatches")}</li> : null}
				</ul>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
