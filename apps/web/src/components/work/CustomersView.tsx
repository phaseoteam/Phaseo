"use client";

import { useId, useState, type FormEvent } from "react";
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { createCustomer, updateCustomer, type CustomerInput } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { Customer, CustomerRequest, WorkItem, WorkMember } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { AssigneeLabel, PriorityIcon, StateIcon, TimeAgo, useWorkCopy } from "./WorkBits";

export function CustomersView({ customers }: { customers: Customer[] }) {
	const t = useTranslations("Work.customers");
	const [editing, setEditing] = useState<Customer | "new" | null>(null);
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("description")}</p>
				</div>
				<Button type="button" size="sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" />{t("new")}</Button>
			</div>
			{customers.length ? (
				<div className="overflow-x-auto rounded-md border">
					<table className="w-full text-sm">
						<thead className="border-b text-left text-xs text-muted-foreground">
							<tr>
								<th className="px-3 py-2 font-normal">{t("name")}</th>
								<th className="px-3 py-2 font-normal">{t("domain")}</th>
								<th className="px-3 py-2 font-normal">{t("tier")}</th>
								<th className="px-3 py-2 text-right font-normal">{t("requests")}</th>
								<th className="px-3 py-2 text-right font-normal">{t("openItems")}</th>
								<th className="w-10 px-3 py-2"><span className="sr-only">{t("editTitle")}</span></th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{customers.map((customer) => (
								<tr key={customer.id} className="hover:bg-muted/40">
									<td className="px-3 py-2"><Link href={`/work/customers/${customer.id}`} className="font-medium hover:underline">{customer.name}</Link></td>
									<td className="px-3 py-2 font-mono text-xs text-muted-foreground">{customer.domain ?? "—"}</td>
									<td className="px-3 py-2 text-muted-foreground">{customer.tier ?? "—"}</td>
									<td className="px-3 py-2 text-right tabular-nums">{customer.requestCount}</td>
									<td className="px-3 py-2 text-right tabular-nums">{customer.openItemCount}</td>
									<td className="px-3 py-1.5 text-right">
										<Button type="button" variant="ghost" size="icon-sm" aria-label={t("editTitle")} onClick={() => setEditing(customer)}><Pencil aria-hidden="true" /></Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>}
			{editing ? <CustomerDialog key={editing === "new" ? "new" : editing.id} customer={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
		</div>
	);
}

export function CustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
	const t = useTranslations("Work.customers");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [draft, setDraft] = useState({
		name: customer?.name ?? "",
		domain: customer?.domain ?? "",
		tier: customer?.tier ?? "",
		externalRef: customer?.externalRef ?? "",
		notes: customer?.notes ?? "",
	});
	const [error, setError] = useState<string | null>(null);
	const field = (key: keyof typeof draft) => ({ value: draft[key], onChange: (event: { target: { value: string } }) => setDraft({ ...draft, [key]: event.target.value }) });

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!draft.name.trim()) return setError(t("nameRequired"));
		setError(null);
		const input: CustomerInput = {
			name: draft.name.trim(),
			domain: draft.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null,
			tier: draft.tier.trim() || null,
			externalRef: draft.externalRef.trim() || null,
			notes: draft.notes,
		};
		const result = await perform("save", () => (customer ? updateCustomer(customer.id, input) : createCustomer(input)));
		if (result.ok) onClose();
	};

	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-lg">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader><DialogTitle>{customer ? t("editTitle") : t("new")}</DialogTitle></DialogHeader>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor={`${id}-name`}>{t("name")}</Label>
							<Input id={`${id}-name`} autoFocus maxLength={200} className="rounded-md" {...field("name")} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-domain`}>{t("domain")}</Label>
							<Input id={`${id}-domain`} maxLength={253} placeholder={t("domainPlaceholder")} className="rounded-md font-mono" {...field("domain")} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-tier`}>{t("tier")}</Label>
							<Input id={`${id}-tier`} maxLength={60} placeholder={t("tierPlaceholder")} className="rounded-md" {...field("tier")} />
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor={`${id}-ref`}>{t("externalRef")}</Label>
							<Input id={`${id}-ref`} maxLength={200} className="rounded-md font-mono" {...field("externalRef")} />
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor={`${id}-notes`}>{t("notes")}</Label>
							<Textarea id={`${id}-notes`} rows={3} maxLength={5000} className="rounded-md" {...field("notes")} />
						</div>
					</div>
					{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
						<Button type="submit" disabled={busy !== null}>{busy ? tCommon("saving") : tCommon("save")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function CustomerDetail({ customer, requests, items, members }: { customer: Customer; requests: CustomerRequest[]; items: WorkItem[]; members: WorkMember[] }) {
	const t = useTranslations("Work.customers");
	const tRequests = useTranslations("Work.requests");
	const tCommon = useTranslations("Work.common");
	const copy = useWorkCopy();
	const [editing, setEditing] = useState(false);
	return (
		<div className="space-y-6">
			<nav className="flex items-center gap-1 text-xs text-muted-foreground">
				<Link href="/work/customers" className="hover:text-foreground">{t("back")}</Link>
				<ChevronRight className="size-3" aria-hidden="true" />
				<span>{customer.name}</span>
			</nav>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold">{customer.name}</h2>
					<p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
						{customer.domain ? <span className="font-mono text-xs leading-5">{customer.domain}</span> : null}
						{customer.tier ? <span>{customer.tier}</span> : null}
						{customer.externalRef ? <span className="font-mono text-xs leading-5">{customer.externalRef}</span> : null}
					</p>
					{customer.notes ? <p className="max-w-2xl pt-1 text-sm whitespace-pre-wrap">{customer.notes}</p> : null}
				</div>
				<Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />{tCommon("edit")}</Button>
			</div>

			<section aria-labelledby="customer-items" className="space-y-2">
				<h3 id="customer-items" className="text-sm font-medium">{t("items")}</h3>
				{items.length ? (
					<ul className="divide-y rounded-md border">
						{items.map((item) => (
							<li key={item.id} className="relative flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
								<PriorityIcon priority={item.priority} label={copy.priority(item.priority)} />
								<span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">#{item.number}</span>
								<StateIcon state={item.state} label={copy.state(item.state)} />
								<Link href={`/work/${item.number}`} className="min-w-0 flex-1 truncate after:absolute after:inset-0">{item.title}</Link>
								<AssigneeLabel agent={item.assigneeAgent} userId={item.assigneeUserId} members={members} compact />
								<TimeAgo value={item.updatedAt} className="w-24 text-right text-xs text-muted-foreground" />
							</li>
						))}
					</ul>
				) : <p className="text-sm text-muted-foreground">{t("noItems")}</p>}
			</section>

			<section aria-labelledby="customer-requests" className="space-y-2">
				<h3 id="customer-requests" className="text-sm font-medium">{t("requests")}</h3>
				{requests.length ? (
					<ul className="divide-y rounded-md border">
						{requests.map((request) => (
							<li key={request.id} className="space-y-1 px-3 py-2.5">
								<div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
									<span className="font-medium text-foreground">{request.subject ?? tRequests("untitled")}</span>
									<span>· {tRequests(`tabs.${request.status}`)}</span>
									{request.workItemNumber ? <Link href={`/work/${request.workItemNumber}`} className="hover:underline">· {tRequests("linkedTo", { number: request.workItemNumber })}</Link> : null}
									<span className="ml-auto"><TimeAgo value={request.createdAt} /></span>
								</div>
								<p className="line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">{request.body}</p>
							</li>
						))}
					</ul>
				) : <p className="text-sm text-muted-foreground">{t("noRequests")}</p>}
			</section>
			{editing ? <CustomerDialog customer={customer} onClose={() => setEditing(false)} /> : null}
		</div>
	);
}
