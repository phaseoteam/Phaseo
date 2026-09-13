"use client";

import * as React from "react";
import { toast } from "sonner";
import {
	updateAccount,
	changePasswordAction,
	changeEmailAction,
} from "@/app/(dashboard)/settings/account/actions";
import {
	persistAnalyticsConsent,
	readAnalyticsConsent,
	type AnalyticsConsent,
} from "@/lib/cookieConsent";
import {
	chatCompletionNotificationsEnabled,
	chatCompletionNotificationsSupported,
	disableChatCompletionNotifications,
	enableChatCompletionNotifications,
} from "@/lib/chat/completionNotifications";
import {
	OBFUSCATE_INFO_COOKIE,
	serializeObfuscateInfo,
} from "@/lib/obfuscation";
import { z } from "zod";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import { resolveDefaultWorkspaceId } from "./defaultWorkspace";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { Label } from "@/components/ui/label";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChevronsUpDown, Loader2, Lock, Mail } from "lucide-react";

export type UserPayload = {
	id: string;
	displayName?: string | null;
	email?: string | null;
	defaultWorkspaceId?: string | null;
	declaredCountryCode?: string | null;
	countryStorageAvailable?: boolean;
	obfuscateInfo: boolean;
	createdAt: string;
};

type TeamOption = { id: string; name: string };

type Props = {
	user: UserPayload;
	teams: TeamOption[];
	hasPassword?: boolean;
};

function WorkspaceCombobox({
	teams,
	value,
	onValueChange,
}: {
	teams: TeamOption[];
	value: string | null;
	onValueChange: (value: string) => void;
}) {
	const [open, setOpen] = React.useState(false);
	const selectedTeam = teams.find((team) => team.id === value) ?? null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id="defaultTeam"
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Default workspace"
					className="w-full justify-between rounded-md font-normal"
				>
					<span className="truncate">
						{selectedTeam?.name ?? "Select default workspace"}
					</span>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[var(--anchor-width)] min-w-64 gap-0 p-0">
				<Command>
					<CommandInput placeholder="Search workspaces…" />
					<CommandList className="max-h-64 overscroll-contain pr-1" style={{ scrollbarWidth: "thin" }}>
						<CommandEmpty>No workspace found.</CommandEmpty>
						<CommandGroup>
							{teams.map((team) => (
								<CommandItem
									key={team.id}
									value={`${team.name} ${team.id}`}
									data-checked={team.id === value}
									onSelect={() => {
										onValueChange(team.id);
										setOpen(false);
									}}
								>
									<span className="truncate">{team.name}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

const schema = z.object({
	display_name: z
		.string()
		.trim()
		.max(60, "Display name must be 60 characters or fewer.")
		.optional()
		.nullable(),
	declared_country_code: z.string().length(2).regex(/^[A-Z]{2}$/).nullable().optional(),
	default_workspace_id: z
		.string()
		.trim()
		.min(1, "Workspace ID cannot be empty.")
		.optional()
		.nullable(),
	obfuscate_info: z.boolean(),
});

const passwordChangeSchema = z
	.object({
		currentPassword: z.string().min(1, "Current password is required"),
		newPassword: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.regex(/[A-Z]/, "Must contain an uppercase letter")
			.regex(/[a-z]/, "Must contain a lowercase letter")
			.regex(/[0-9]/, "Must contain a number"),
		confirmPassword: z.string(),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: "Passwords don't match",
		path: ["confirmPassword"],
	});

const emailChangeSchema = z.object({
	newEmail: z.string().email("Invalid email address"),
	currentPassword: z.string().min(1, "Password required for verification"),
});

export default function AccountSettingsClient({
	user,
	teams,
	hasPassword = true,
}: Props) {
	const [displayName, setDisplayName] = React.useState<string | null>(
		user.displayName ?? null
	);

	// Force a default team: if the user has no default and teams exist,
	// select the first team automatically. If there are no teams, we'll
	// display a disabled 'Personal' input (defaultWorkspaceId remains null).
	const initialDefaultTeam = resolveDefaultWorkspaceId(
		user.defaultWorkspaceId,
		teams,
	);
	const [defaultWorkspaceId, setDefaultTeamId] = React.useState<string | null>(
		initialDefaultTeam
	);
	const [declaredCountryCode, setDeclaredCountryCode] = React.useState(user.declaredCountryCode ?? "");
	const [obfuscateInfo, setObfuscateInfo] = React.useState<boolean>(
		!!user.obfuscateInfo
	);

	const [saving, setSaving] = React.useState(false);

	// Password change state
	const [currentPassword, setCurrentPassword] = React.useState("");
	const [newPassword, setNewPassword] = React.useState("");
	const [confirmPassword, setConfirmPassword] = React.useState("");
	const [changingPassword, setChangingPassword] = React.useState(false);

	// Email change state
	const [newEmail, setNewEmail] = React.useState("");
	const [emailPassword, setEmailPassword] = React.useState("");
	const [changingEmail, setChangingEmail] = React.useState(false);

	const [analyticsConsent, setAnalyticsConsent] = React.useState<
		AnalyticsConsent | null
	>(null);
	const [chatNotifyOnComplete, setChatNotifyOnComplete] =
		React.useState<boolean>(false);
	const [chatNotificationsSupported, setChatNotificationsSupported] =
		React.useState(true);
	const [updatingChatNotifications, setUpdatingChatNotifications] =
		React.useState(false);
	const applyObfuscationMode = React.useCallback((next: boolean) => {
		if (typeof document === "undefined") return;
		const serialized = serializeObfuscateInfo(next);
		document.documentElement.setAttribute(
			"data-obfuscate-pii",
			next ? "true" : "false"
		);
		document
			.getElementById("dashboard-shell")
			?.setAttribute("data-obfuscate-pii", next ? "true" : "false");
		document
			.querySelectorAll("[data-obfuscation-sync='true']")
			.forEach((node) =>
				(node as HTMLElement).setAttribute(
					"data-obfuscate-pii",
					next ? "true" : "false"
				)
			);
		document.cookie = `${OBFUSCATE_INFO_COOKIE}=${serialized}; path=/; max-age=${
			60 * 60 * 24 * 365
		}; samesite=lax`;
	}, []);

	React.useEffect(() => {
		setAnalyticsConsent(readAnalyticsConsent());
		applyObfuscationMode(Boolean(user.obfuscateInfo));

		setChatNotificationsSupported(chatCompletionNotificationsSupported());
		setChatNotifyOnComplete(chatCompletionNotificationsEnabled());
	}, [applyObfuscationMode, user.obfuscateInfo]);

	const analyticsEnabled = analyticsConsent === "accepted";

	const initial = React.useMemo(
		() => ({
			display_name: user.displayName ?? null,
			default_workspace_id: user.defaultWorkspaceId ?? null,
			declared_country_code: user.countryStorageAvailable === false ? undefined : user.declaredCountryCode ?? null,
			obfuscate_info: !!user.obfuscateInfo,
		}),
		[user]
	);

	const current = {
		display_name: displayName,
		default_workspace_id: defaultWorkspaceId,
		declared_country_code: user.countryStorageAvailable === false ? undefined : declaredCountryCode || null,
		obfuscate_info: obfuscateInfo,
	};
	const hasChanges = JSON.stringify(initial) !== JSON.stringify(current);

	async function handleSave(e?: React.FormEvent) {
		e?.preventDefault();
		const parsed = schema.safeParse(current);
		if (!parsed.success) {
			const msg =
				parsed.error.issues[0]?.message ?? "Please check your inputs.";
			toast.error(msg);
			return;
		}

		const updatePayload = { ...parsed.data };
		if (updatePayload.declared_country_code === initial.declared_country_code) {
			delete updatePayload.declared_country_code;
		}

		setSaving(true);
		try {
			await toast.promise(updateAccount(updatePayload), {
				loading: "Saving your settings...",
				success: "Account settings updated",
				error: (err: any) => err?.message || "Could not save settings",
			});
			applyObfuscationMode(Boolean(parsed.data.obfuscate_info));
		} catch (e) {
			void e;
		} finally {
			setSaving(false);
		}
	}

	async function handleChatNotificationsChange(checked: boolean) {
		setUpdatingChatNotifications(true);
		try {
			if (!checked) {
				disableChatCompletionNotifications();
				setChatNotifyOnComplete(false);
				return;
			}

			const result = await enableChatCompletionNotifications();
			if (!result.enabled) {
				setChatNotifyOnComplete(false);
				toast.error(
					result.reason === "unsupported"
						? "Browser notifications are not supported here."
						: "Allow notifications in your browser to enable chat alerts.",
				);
				return;
			}
			setChatNotifyOnComplete(true);
			toast.success("Chat completion notifications enabled");
		} finally {
			setUpdatingChatNotifications(false);
		}
	}

	/* async function handleDeleteAccount() {
		setDeleting(true);
		try {
			await toast.promise(deleteAccount(), {
				loading: "Deleting your account...",
				success: "Account deleted. Goodbye ðŸ‘‹",
				error: (err: any) => err?.message || "Could not delete account",
			});
			// Redirect
			window.location.href = "/";
		} catch (e) {
			void e;
		} finally {
			setDeleting(false);
		}
	} */

	async function handleChangePassword(e?: React.FormEvent) {
		e?.preventDefault();

		const parsed = passwordChangeSchema.safeParse({
			currentPassword,
			newPassword,
			confirmPassword,
		});

		if (!parsed.success) {
			const msg =
				parsed.error.issues[0]?.message ?? "Please check your inputs.";
			toast.error(msg);
			return;
		}

		setChangingPassword(true);
		try {
			await toast.promise(
				changePasswordAction(currentPassword, newPassword),
				{
					loading: "Changing your password...",
					success: "Password changed successfully!",
					error: (err: any) =>
						err?.message || "Could not change password",
				}
			);
			// Reset form
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch (e) {
			void e;
		} finally {
			setChangingPassword(false);
		}
	}

	async function handleChangeEmail(e?: React.FormEvent) {
		e?.preventDefault();

		const parsed = emailChangeSchema.safeParse({
			newEmail,
			currentPassword: emailPassword,
		});

		if (!parsed.success) {
			const msg =
				parsed.error.issues[0]?.message ?? "Please check your inputs.";
			toast.error(msg);
			return;
		}

		setChangingEmail(true);
		try {
			const result = await toast.promise(
				changeEmailAction(newEmail, emailPassword),
				{
					loading: "Changing your email...",
					success:
						"Email change initiated. Check both email addresses for confirmation.",
					error: (err: any) => err?.message || "Could not change email",
				}
			);
			// Reset form
			setNewEmail("");
			setEmailPassword("");
		} catch (e) {
			void e;
		} finally {
			setChangingEmail(false);
		}
	}

	/* async function handleDisableMFA() {
		if (!mfaFactorId) {
			toast.error("No MFA factor found");
			return;
		}

		// For email/password users, require password confirmation
		// For OAuth users, skip password requirement
		if (hasPassword && !mfaDisablePassword) {
			toast.error("Password is required");
			return;
		}

		setDisablingMFA(true);
		try {
			await toast.promise(
				unenrollMFAAction(mfaFactorId, mfaDisablePassword),
				{
					loading: "Disabling two-factor authentication...",
					success: "Two-factor authentication disabled",
					error: (err: any) => err?.message || "Could not disable MFA",
				}
			);
			setMfaDisablePassword("");
			// Refresh server component data to update MFA status
			router.refresh();
		} catch (e) {
			void e;
		} finally {
			setDisablingMFA(false);
		}
	}

	function handleMFASuccess() {
		toast.success("MFA enabled successfully!");
		// Refresh server component data to show updated MFA status
		setTimeout(() => {
			router.refresh();
		}, 1000);
	}

	async function handleMFADialogClose(open: boolean) {
		setMfaDialogOpen(open);
		// If closing and MFA not yet enabled, cleanup and refresh
		if (!open && !mfaEnabled) {
			try {
				await cleanupUnverifiedMFAAction();
			} catch (err) {
				// Ignore cleanup errors
			}
			router.refresh();
		}
	} */

	return (
		<div className="space-y-8">
			<section aria-label="Account details">
				<form
					onSubmit={handleSave}
					className="overflow-hidden rounded-xl border bg-background/40"
				>
					<div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
						<div className="min-w-0">
							<Label htmlFor="displayName" className="text-sm font-medium">
								Display Name
							</Label>
							<p className="mt-0.5 text-sm text-muted-foreground">
								This is how your name appears to other people.
							</p>
						</div>
						<div className="w-full shrink-0 sm:w-[min(32rem,55%)]">
								<Input
									id="displayName"
									value={displayName ?? ""}
									maxLength={60}
									placeholder="e.g. Daniel"
									onChange={(e) =>
										setDisplayName(e.target.value ? e.target.value : null)
									}
								/>
						</div>
					</div>

					{user.email ? (
						<div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
							<div className="min-w-0">
								<Label className="text-sm font-medium">Email</Label>
								<p className="mt-0.5 text-sm text-muted-foreground">
									Contact support to change your sign-in email.
								</p>
							</div>
							<div className="w-full shrink-0 sm:w-[min(32rem,55%)]">
									<Input value={user.email} readOnly data-pii="true" />
							</div>
						</div>
						) : null}

					{user.countryStorageAvailable !== false ? (
						<div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
							<div className="min-w-0">
								<Label htmlFor="account-country" className="text-sm font-medium">
									Country
								</Label>
								<p className="mt-0.5 text-sm text-muted-foreground">
									Used to determine provider and service availability. Billing addresses are managed separately.
								</p>
							</div>
							<div className="w-full shrink-0 sm:w-[min(32rem,55%)]">
									<CountryCombobox
										id="account-country"
										value={declaredCountryCode}
										onValueChange={setDeclaredCountryCode}
										className="h-8 rounded-md"
									/>
							</div>
						</div>
						) : null}

					<div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
						<div className="min-w-0">
							<Label htmlFor="defaultTeam" className="text-sm font-medium">
								Default Workspace
							</Label>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Set the workspace shown by default.
							</p>
						</div>
						<div className="w-full shrink-0 sm:w-[min(32rem,55%)]">
								{teams && teams.length > 0 ? (
									<WorkspaceCombobox
										teams={teams}
										value={defaultWorkspaceId}
										onValueChange={setDefaultTeamId}
									/>
								) : (
									<Input id="defaultTeam" value={"Personal"} readOnly disabled />
								)}
						</div>
					</div>

					<div className="flex items-center justify-between gap-4 border-t px-4 py-3.5">
						<div className="min-w-0">
							<Label className="text-sm font-medium">Analytics Cookies</Label>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Allow analytics cookies to improve the product.
							</p>
						</div>
								<Switch
									checked={analyticsEnabled}
									onCheckedChange={(checked) => {
										const next: AnalyticsConsent = checked
											? "accepted"
											: "denied";
										persistAnalyticsConsent(next);
										setAnalyticsConsent(next);
									}}
									aria-label="Toggle analytics cookies"
								/>
						</div>

					<div className="flex items-center justify-between gap-4 border-t px-4 py-3.5">
						<div className="min-w-0">
							<Label className="text-sm font-medium">Obfuscate Info</Label>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Blur sensitive information across the website.
							</p>
						</div>
								<Switch
									checked={obfuscateInfo}
									onCheckedChange={setObfuscateInfo}
									aria-label="Toggle obfuscation"
								/>
					</div>

					<div className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex min-w-0 items-center gap-2">
							<p className="text-xs text-muted-foreground">
								Member since {new Date(user.createdAt).toLocaleDateString()}.
							</p>
							{hasChanges ? <Badge variant="secondary">Unsaved changes</Badge> : null}
						</div>
						<div className="flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setDisplayName(initial.display_name);
									setDefaultTeamId(initialDefaultTeam);
									setDeclaredCountryCode(initial.declared_country_code ?? "");
									setObfuscateInfo(initial.obfuscate_info);
								}}
								disabled={!hasChanges || saving}
							>
								Reset
							</Button>
							<Button type="submit" disabled={!hasChanges || saving}>
								{saving ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : (
									"Save changes"
								)}
							</Button>
						</div>
					</div>
				</form>
			</section>

			<section aria-labelledby="account-notifications-title" className="space-y-3 border-t border-border/60 pt-6">
				<h3
					id="account-notifications-title"
					className="font-heading text-base font-medium"
				>
					Notifications
				</h3>
				<div className="overflow-hidden rounded-xl border bg-background/40">
					<div className="flex items-center justify-between gap-4 px-4 py-3.5">
						<div className="min-w-0">
							<h4 className="text-sm font-medium">Chat Completion</h4>
							<p className="mt-0.5 text-sm text-muted-foreground">
								{chatNotificationsSupported
									? "Show a browser notification when a text chat response finishes while this tab is unfocused."
									: "Browser notifications are not supported in this browser."}
							</p>
						</div>
						<Switch
							checked={chatNotifyOnComplete}
							disabled={!chatNotificationsSupported || updatingChatNotifications}
							onCheckedChange={(checked) => void handleChatNotificationsChange(Boolean(checked))}
							aria-label="Enable chat completion browser notifications"
						/>
					</div>
				</div>
			</section>

			{hasPassword && (
				<section className="space-y-3 border-t border-border/60 pt-6">
					<div className="min-w-0">
						<h3 className="text-sm font-medium flex items-center gap-2">
							<Lock className="h-4 w-4" />
							Change password
						</h3>
						<p className="text-xs text-muted-foreground mt-0.5">
							Update your password to keep your account secure.
						</p>
					</div>

					<form onSubmit={handleChangePassword} className="mt-3">
						<div className="grid gap-3">
							<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
								<Label htmlFor="currentPassword" className="sm:pt-2">
									Current password
								</Label>
								<div className="max-w-lg">
									<Input
										id="currentPassword"
										type="password"
										value={currentPassword}
										onChange={(e) => setCurrentPassword(e.target.value)}
										placeholder="Enter your current password"
									/>
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
								<Label htmlFor="newPassword" className="sm:pt-2">
									New password
								</Label>
								<div className="grid gap-2 max-w-lg">
									<Input
										id="newPassword"
										type="password"
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										placeholder="Enter your new password"
									/>
									{newPassword ? (
										<PasswordStrengthIndicator password={newPassword} />
									) : null}
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
								<Label htmlFor="confirmPassword" className="sm:pt-2">
									Confirm password
								</Label>
								<div className="max-w-lg">
									<Input
										id="confirmPassword"
										type="password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										placeholder="Confirm your new password"
									/>
								</div>
							</div>
						</div>

						<div className="flex items-center justify-end gap-2 mt-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setCurrentPassword("");
									setNewPassword("");
									setConfirmPassword("");
								}}
								disabled={!currentPassword && !newPassword && !confirmPassword}
							>
								Clear
							</Button>
							<Button
								type="submit"
								disabled={
									!currentPassword ||
									!newPassword ||
									!confirmPassword ||
									changingPassword
								}
							>
								{changingPassword ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Changing password...
									</>
								) : (
									"Change password"
								)}
							</Button>
						</div>
					</form>
				</section>
			)}

			{hasPassword && (
				<section className="space-y-3 border-t border-border/60 pt-6">
					<div className="min-w-0">
						<h3 className="text-sm font-medium flex items-center gap-2">
							<Mail className="h-4 w-4" />
							Change email
						</h3>
						<p className="text-xs text-muted-foreground mt-0.5">
							Confirm the change in both your old and new inbox.
						</p>
					</div>

					<form onSubmit={handleChangeEmail} className="mt-3">
						<div className="grid gap-3">
							<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
								<Label className="sm:pt-2">Current email</Label>
								<div className="max-w-lg">
									<Input value={user.email ?? ""} readOnly data-pii="true" />
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
								<Label htmlFor="newEmail" className="sm:pt-2">
									New email
								</Label>
								<div className="max-w-lg">
									<Input
										id="newEmail"
										type="email"
										value={newEmail}
										data-pii="true"
										onChange={(e) => setNewEmail(e.target.value)}
										placeholder="Enter your new email address"
									/>
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
								<Label htmlFor="emailPassword" className="sm:pt-2">
									Confirm with password
								</Label>
								<div className="grid gap-1 max-w-lg">
									<Input
										id="emailPassword"
										type="password"
										value={emailPassword}
										onChange={(e) => setEmailPassword(e.target.value)}
										placeholder="Enter your password to confirm"
									/>
									<p className="text-xs text-muted-foreground">
										For security, we need your password to change your email.
									</p>
								</div>
							</div>
						</div>

						<div className="flex items-center justify-end gap-2 mt-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setNewEmail("");
									setEmailPassword("");
								}}
								disabled={!newEmail && !emailPassword}
							>
								Clear
							</Button>
							<Button
								type="submit"
								disabled={!newEmail || !emailPassword || changingEmail}
							>
								{changingEmail ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Changing email...
									</>
								) : (
									"Change email"
								)}
							</Button>
						</div>
					</form>
				</section>
			)}
		</div>
	);
}
