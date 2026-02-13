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
	PERSONALIZATION_ACCENT_COLORS,
	STORAGE_KEYS,
} from "@/components/(chat)/playground/chat-playground-core";
import { z } from "zod";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, User, Lock, Mail } from "lucide-react";

export type UserPayload = {
	id: string;
	displayName?: string | null;
	email?: string | null;
	defaultTeamId?: string | null;
	obfuscateInfo: boolean;
	createdAt: string;
};

type TeamOption = { id: string; name: string };

type Props = {
	user: UserPayload;
	teams: TeamOption[];
	hasPassword?: boolean;
};

const schema = z.object({
	display_name: z
		.string()
		.trim()
		.max(60, "Display name must be 60 characters or fewer.")
		.optional()
		.nullable(),
	default_team_id: z
		.string()
		.trim()
		.min(1, "Team ID cannot be empty.")
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
	// display a disabled 'Personal' input (defaultTeamId remains null).
	const initialDefaultTeam =
		user.defaultTeamId ?? (teams && teams.length > 0 ? teams[0].id : null);
	const [defaultTeamId, setDefaultTeamId] = React.useState<string | null>(
		initialDefaultTeam
	);
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
	const [chatAccentColor, setChatAccentColor] = React.useState<string>(
		PERSONALIZATION_ACCENT_COLORS[0]?.value ?? "#111111",
	);
	const [chatNotifyOnComplete, setChatNotifyOnComplete] =
		React.useState<boolean>(false);

	React.useEffect(() => {
		setAnalyticsConsent(readAnalyticsConsent());

		try {
			const storedAccent =
				window.localStorage.getItem(STORAGE_KEYS.personalizationAccent) ??
				"";
			if (storedAccent) {
				setChatAccentColor(storedAccent);
			}
			const storedNotify =
				window.localStorage.getItem(STORAGE_KEYS.notifyOnComplete) ?? "";
			if (storedNotify === "true") {
				setChatNotifyOnComplete(true);
			}
		} catch {
			// Ignore storage access errors.
		}
	}, []);

	const analyticsEnabled = analyticsConsent === "accepted";

	const initial = React.useMemo(
		() => ({
			display_name: user.displayName ?? null,
			default_team_id: user.defaultTeamId ?? null,
			obfuscate_info: !!user.obfuscateInfo,
		}),
		[user]
	);

	const current = {
		display_name: displayName,
		default_team_id: defaultTeamId,
		obfuscate_info: obfuscateInfo,
	};
	const hasChanges = JSON.stringify(initial) !== JSON.stringify(current);

	async function handleSave(e?: React.FormEvent) {
		e?.preventDefault();
		const parsed = schema.safeParse(current);
		if (!parsed.success) {
			const msg =
				parsed.error.errors[0]?.message ?? "Please check your inputs.";
			toast.error(msg);
			return;
		}

		setSaving(true);
		try {
			await toast.promise(updateAccount(parsed.data), {
				loading: "Saving your settings...",
				success: "Saved [PASS]",
				error: (err: any) => err?.message || "Could not save settings",
			});
		} catch (e) {
			void e;
		} finally {
			setSaving(false);
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
				parsed.error.errors[0]?.message ?? "Please check your inputs.";
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
				parsed.error.errors[0]?.message ?? "Please check your inputs.";
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
		<div className="rounded-lg border bg-background divide-y">
			{/* Account Card */}
			<section className="px-4 py-4 sm:px-5">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h3 className="text-sm font-medium flex items-center gap-2">
							<User className="h-4 w-4" />
							Account
						</h3>
						<p className="text-xs text-muted-foreground mt-0.5">
							Edit the basics of your profile. Member since{" "}
							{new Date(user.createdAt).toLocaleDateString()}.
						</p>
					</div>
					{hasChanges ? (
						<Badge variant="secondary">Unsaved changes</Badge>
					) : (
						<Badge variant="outline">Up to date</Badge>
					)}
				</div>

				<form onSubmit={handleSave} className="mt-3">
					<div className="grid gap-3">
						<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
							<Label htmlFor="displayName" className="sm:pt-2">
								Display name
							</Label>
							<div className="grid gap-1 max-w-lg">
								<Input
									id="displayName"
									value={displayName ?? ""}
									maxLength={60}
									placeholder="e.g. Daniel"
									onChange={(e) =>
										setDisplayName(e.target.value ? e.target.value : null)
									}
								/>
								<p className="text-xs text-muted-foreground">
									This is how your name appears to other people.
								</p>
							</div>
						</div>

						{user.email ? (
							<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
								<Label className="sm:pt-2">Email</Label>
								<div className="grid gap-1 max-w-lg">
									<Input value={user.email} readOnly />
									<p className="text-xs text-muted-foreground">
										Contact support to change your sign-in email.
									</p>
								</div>
							</div>
						) : null}

						<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
							<Label htmlFor="defaultTeam" className="sm:pt-2">
								Default team
							</Label>
							<div className="grid gap-1 max-w-lg">
								{teams && teams.length > 0 ? (
									<Select
										value={defaultTeamId ?? ""}
										onValueChange={(v) => setDefaultTeamId(v || null)}
									>
										<SelectTrigger id="defaultTeam" className="w-full">
											<SelectValue placeholder="Select default team" />
										</SelectTrigger>
										<SelectContent>
											{teams.map((t) => (
												<SelectItem key={t.id} value={t.id}>
													{t.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<Input id="defaultTeam" value={"Personal"} readOnly disabled />
								)}
								<p className="text-xs text-muted-foreground">
									Set the project that is shown by default.
								</p>
							</div>
						</div>

						<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
							<Label htmlFor="chatAccent" className="sm:pt-2">
								Chatroom colour
							</Label>
							<div className="grid gap-1 max-w-lg">
								<Select
									value={chatAccentColor}
									onValueChange={(v) => {
										setChatAccentColor(v);
										try {
											window.localStorage.setItem(
												STORAGE_KEYS.personalizationAccent,
												v,
											);
										} catch {
											// Ignore storage access errors.
										}
									}}
								>
									<SelectTrigger id="chatAccent" className="w-full">
										<SelectValue placeholder="Select a color" />
									</SelectTrigger>
									<SelectContent>
										{PERSONALIZATION_ACCENT_COLORS.map((color: { label: string; value: string }) => (
											<SelectItem key={color.value} value={color.value}>
												<span className="flex items-center gap-2">
													<span
														className="h-3 w-3 rounded-full border border-border"
														style={{ backgroundColor: color.value }}
													/>
													{color.label}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									Applied to the chat playground on this device.
								</p>
							</div>
						</div>

						<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
							<Label className="sm:pt-2">Chat notifications</Label>
							<div className="flex items-center justify-between rounded-md border px-3 py-2 max-w-lg">
								<p className="text-xs text-muted-foreground">
									Notify when chat responses finish (only when this tab is
									unfocused).
								</p>
								<Switch
									checked={chatNotifyOnComplete}
									onCheckedChange={(checked) => {
										setChatNotifyOnComplete(checked);
										try {
											window.localStorage.setItem(
												STORAGE_KEYS.notifyOnComplete,
												checked ? "true" : "false",
											);
										} catch {
											// Ignore storage access errors.
										}
									}}
									aria-label="Toggle chat completion notifications"
								/>
							</div>
						</div>

						<div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
							<Label className="sm:pt-2">Analytics cookies</Label>
							<div className="flex items-center justify-between rounded-md border px-3 py-2 max-w-lg">
								<p className="text-xs text-muted-foreground">
									Allow analytics cookies to improve the product.
								</p>
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
						</div>

						{/*
						<div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-start">
							<Label className="sm:pt-2">Obfuscate info</Label>
							<div className="flex items-center justify-between rounded-md border px-3 py-2">
								<p className="text-xs text-muted-foreground">
									Hide sensitive information across the UI (IDs, tokens, etc.).
								</p>
								<Switch
									checked={obfuscateInfo}
									onCheckedChange={setObfuscateInfo}
									aria-label="Toggle obfuscation"
								/>
							</div>
						</div>
						*/}
					</div>

					<div className="flex items-center justify-end gap-2 mt-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setDisplayName(initial.display_name);
								setDefaultTeamId(initialDefaultTeam);
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
				</form>
			</section>

			{/* Password Change Card - Only show for email/password users */}
			{hasPassword && (
				<section className="px-4 py-4 sm:px-5">
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

			{/* Email Change Card */}
			{hasPassword && (
				<section className="px-4 py-4 sm:px-5">
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
									<Input value={user.email ?? ""} readOnly />
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
