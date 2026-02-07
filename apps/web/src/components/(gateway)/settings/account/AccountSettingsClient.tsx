"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
	updateAccount,
	deleteAccount,
	changePasswordAction,
	changeEmailAction,
	unenrollMFAAction,
	cleanupUnverifiedMFAAction,
} from "@/app/(dashboard)/settings/account/actions";
import { z } from "zod";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import { MFAEnrollmentFlow } from "./MFAEnrollmentFlow";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
	Loader2,
	ShieldAlert,
	Trash2,
	User,
	Lock,
	Mail,
	Shield,
	ShieldCheck,
} from "lucide-react";

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
	mfaEnabled?: boolean;
	mfaFactorId?: string | null;
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
	mfaEnabled = false,
	mfaFactorId = null,
	hasPassword = true,
}: Props) {
	const router = useRouter();

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
	const [deleting, setDeleting] = React.useState(false);

	// Password change state
	const [currentPassword, setCurrentPassword] = React.useState("");
	const [newPassword, setNewPassword] = React.useState("");
	const [confirmPassword, setConfirmPassword] = React.useState("");
	const [changingPassword, setChangingPassword] = React.useState(false);

	// Email change state
	const [newEmail, setNewEmail] = React.useState("");
	const [emailPassword, setEmailPassword] = React.useState("");
	const [changingEmail, setChangingEmail] = React.useState(false);

	// MFA state
	const [mfaDialogOpen, setMfaDialogOpen] = React.useState(false);
	const [disablingMFA, setDisablingMFA] = React.useState(false);
	const [mfaDisablePassword, setMfaDisablePassword] = React.useState("");

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

	async function handleDeleteAccount() {
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
	}

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

	async function handleDisableMFA() {
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
	}

	return (
		<div className="space-y-8">
			{/* Account Card */}
			<Card className="border">
				<CardHeader className="flex flex-row items-start justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2">
							<User className="h-5 w-5" />
							Account
						</CardTitle>
						<CardDescription>
							Edit the basics of your profile.
						</CardDescription>
					</div>
					{hasChanges ? (
						<Badge variant="secondary">Unsaved changes</Badge>
					) : (
						<Badge variant="outline">Up to date</Badge>
					)}
				</CardHeader>

				<Separator />

				<form onSubmit={handleSave}>
					<CardContent className="pt-6 grid gap-6 max-w-2xl">
						{/* Display Name */}
						<div className="grid gap-2">
							<Label htmlFor="displayName">Display name</Label>
							<Input
								id="displayName"
								value={displayName ?? ""}
								maxLength={60}
								placeholder="e.g. Daniel"
								onChange={(e) =>
									setDisplayName(
										e.target.value ? e.target.value : null
									)
								}
							/>
							<p className="text-xs text-muted-foreground">
								This is how your name appears to other people.
							</p>
						</div>

						{/* Email (read-only, nice to show) */}
						{user.email ? (
							<div className="grid gap-2">
								<Label>Email</Label>
								<Input value={user.email} readOnly />
								<p className="text-xs text-muted-foreground">
									Contact support to change your sign-in
									email.
								</p>
							</div>
						) : null}

						{/* Default Team */}
						<div className="grid gap-2">
							<Label htmlFor="defaultTeam">Default team</Label>

							{teams && teams.length > 0 ? (
								<Select
									value={defaultTeamId ?? ""}
									onValueChange={(v) =>
										setDefaultTeamId(v || null)
									}
								>
									<SelectTrigger
										id="defaultTeam"
										className="w-full"
									>
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
								// No teams: show a disabled, non-interactive "Personal" input
								<Input
									id="defaultTeam"
									value={"Personal"}
									readOnly
									disabled
								/>
							)}

							<p className="text-xs text-muted-foreground">
								Set the project that is shown by default.
							</p>
						</div>

						{/*
						<div className="flex items-center justify-between rounded-lg border p-4">
							<div className="space-y-1">
								<Label>Obfuscate info</Label>
								<p className="text-sm text-muted-foreground">
									Hide sensitive information across the UI
									(IDs, tokens, etc.) - this will apply until
									the setting is turned off.
								</p>
							</div>
							<Switch
								checked={obfuscateInfo}
								onCheckedChange={setObfuscateInfo}
								aria-label="Toggle obfuscation"
							/>
						</div>
						*/}
					</CardContent>

					<CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-xs text-muted-foreground">
							Member since{" "}
							{new Date(user.createdAt).toLocaleDateString()}
						</p>

						<div className="flex items-center gap-2 sm:justify-end">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									// Reset to initial
									setDisplayName(initial.display_name);
									setDefaultTeamId(initialDefaultTeam);
									setObfuscateInfo(initial.obfuscate_info);
								}}
								disabled={!hasChanges || saving}
							>
								Reset
							</Button>
							<Button
								type="submit"
								disabled={!hasChanges || saving}
							>
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
					</CardFooter>
				</form>
			</Card>

			{/* Password Change Card - Only show for email/password users */}
			{hasPassword && (
				<Card className="border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Lock className="h-5 w-5" />
							Change password
						</CardTitle>
						<CardDescription>
							Update your password to keep your account secure.
						</CardDescription>
					</CardHeader>

					<Separator />

					<form onSubmit={handleChangePassword}>
						<CardContent className="pt-6 grid gap-6 max-w-2xl">
							<div className="grid gap-2">
								<Label htmlFor="currentPassword">
									Current password
								</Label>
								<Input
									id="currentPassword"
									type="password"
									value={currentPassword}
									onChange={(e) =>
										setCurrentPassword(e.target.value)
									}
									placeholder="Enter your current password"
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="newPassword">New password</Label>
								<Input
									id="newPassword"
									type="password"
									value={newPassword}
									onChange={(e) =>
										setNewPassword(e.target.value)
									}
									placeholder="Enter your new password"
								/>
								{newPassword && (
									<PasswordStrengthIndicator
										password={newPassword}
									/>
								)}
							</div>

							<div className="grid gap-2">
								<Label htmlFor="confirmPassword">
									Confirm new password
								</Label>
								<Input
									id="confirmPassword"
									type="password"
									value={confirmPassword}
									onChange={(e) =>
										setConfirmPassword(e.target.value)
									}
									placeholder="Confirm your new password"
								/>
							</div>
						</CardContent>

						<CardFooter className="flex items-center justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setCurrentPassword("");
									setNewPassword("");
									setConfirmPassword("");
								}}
								disabled={
									!currentPassword &&
									!newPassword &&
									!confirmPassword
								}
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
						</CardFooter>
					</form>
				</Card>
			)}

			{/* Email Change Card */}
			{hasPassword && (
				<Card className="border">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Mail className="h-5 w-5" />
							Change email
						</CardTitle>
						<CardDescription>
							Update the email address associated with your
							account. You'll need to confirm the change in both
							your old and new email.
						</CardDescription>
					</CardHeader>

					<Separator />

					<form onSubmit={handleChangeEmail}>
						<CardContent className="pt-6 grid gap-6 max-w-2xl">
							<div className="grid gap-2">
								<Label>Current email</Label>
								<Input value={user.email ?? ""} readOnly />
							</div>

							<div className="grid gap-2">
								<Label htmlFor="newEmail">New email</Label>
								<Input
									id="newEmail"
									type="email"
									value={newEmail}
									onChange={(e) => setNewEmail(e.target.value)}
									placeholder="Enter your new email address"
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="emailPassword">
									Confirm with password
								</Label>
								<Input
									id="emailPassword"
									type="password"
									value={emailPassword}
									onChange={(e) =>
										setEmailPassword(e.target.value)
									}
									placeholder="Enter your password to confirm"
								/>
								<p className="text-xs text-muted-foreground">
									For security, we need your password to change
									your email.
								</p>
							</div>
						</CardContent>

						<CardFooter className="flex items-center justify-end gap-2">
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
								disabled={
									!newEmail || !emailPassword || changingEmail
								}
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
						</CardFooter>
					</form>
				</Card>
			)}

			{/* Two-Factor Authentication Card - Available for ALL users */}
			<Card className="border">
					<CardHeader className="flex flex-row items-start justify-between gap-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								{mfaEnabled ? (
									<ShieldCheck className="h-5 w-5 text-green-600" />
								) : (
									<Shield className="h-5 w-5" />
								)}
								Two-factor authentication
							</CardTitle>
							<CardDescription>
								Add an extra layer of security to your account
								by requiring a code from your authenticator app
								when signing in.
							</CardDescription>
						</div>
						{mfaEnabled ? (
							<Badge variant="default" className="bg-green-600">
								Enabled
							</Badge>
						) : (
							<Badge variant="outline">Disabled</Badge>
						)}
					</CardHeader>

					<Separator />

					<CardContent className="pt-6 grid gap-6">
						{!mfaEnabled ? (
							<div className="space-y-4">
								<div className="rounded-lg border bg-muted/50 p-4">
									<h4 className="text-sm font-medium mb-2">
										Why enable two-factor authentication?
									</h4>
									<ul className="text-sm text-muted-foreground space-y-1">
										<li className="flex items-start gap-2">
											<span className="text-green-600 mt-0.5">
												[OK]
											</span>
											<span>
												Protects your account even if
												your password is compromised
											</span>
										</li>
										<li className="flex items-start gap-2">
											<span className="text-green-600 mt-0.5">
												[OK]
											</span>
											<span>
												Works with popular authenticator
												apps like Google Authenticator,
												Authy, or 1Password
											</span>
										</li>
										<li className="flex items-start gap-2">
											<span className="text-green-600 mt-0.5">
												[OK]
											</span>
											<span>
												Includes recovery codes for
												backup access
											</span>
										</li>
									</ul>
								</div>

								<div className="flex justify-end">
									<Button
										onClick={() => setMfaDialogOpen(true)}
									>
										Enable two-factor authentication
									</Button>
								</div>
							</div>
						) : (
							<div className="space-y-4">
								<div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-900/10">
									<p className="text-sm text-green-900 dark:text-green-200">
										Your account is protected with
										two-factor authentication. You'll need
										your authenticator app to sign in.
									</p>
								</div>

								<div className="flex items-center justify-between">
									<div>
										<h4 className="text-sm font-medium">
											Disable MFA
										</h4>
										<p className="text-sm text-muted-foreground">
											Remove two-factor authentication from
											your account
										</p>
									</div>

									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button variant="outline">
												Disable
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													Disable two-factor
													authentication?
												</AlertDialogTitle>
												<AlertDialogDescription>
													This will remove the extra
													security layer from your
													account.{" "}
													{hasPassword
														? "You'll only need your password to sign in."
														: "You'll only need your OAuth provider to sign in."}
												</AlertDialogDescription>
											</AlertDialogHeader>

											{hasPassword ? (
												<div className="grid gap-3 py-4">
													<div className="grid gap-2">
														<Label htmlFor="mfaDisablePassword">
															Confirm with password
														</Label>
														<Input
															id="mfaDisablePassword"
															type="password"
															value={
																mfaDisablePassword
															}
															onChange={(e) =>
																setMfaDisablePassword(
																	e.target.value
																)
															}
															placeholder="Enter your password"
															autoFocus
														/>
													</div>
												</div>
											) : (
												<div className="rounded-lg border bg-muted/50 p-4">
													<p className="text-sm text-muted-foreground">
														You're using OAuth
														authentication. No password
														confirmation needed.
													</p>
												</div>
											)}

											<AlertDialogFooter>
												<AlertDialogCancel
													disabled={disablingMFA}
												>
													Cancel
												</AlertDialogCancel>
												<Button
													variant="destructive"
													onClick={handleDisableMFA}
													disabled={
														(hasPassword &&
															!mfaDisablePassword) ||
														disablingMFA
													}
												>
													{disablingMFA ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															Disabling...
														</>
													) : (
														"Disable MFA"
													)}
												</Button>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

			{/* MFA Enrollment Dialog */}
			<MFAEnrollmentFlow
				open={mfaDialogOpen}
				onOpenChange={handleMFADialogClose}
				onSuccess={handleMFASuccess}
			/>

			{/* Danger Zone */}
			<Card className="border border-destructive/30">
				<CardHeader className="flex flex-row items-start justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2 text-destructive">
							<ShieldAlert className="h-5 w-5" />
							Danger zone
						</CardTitle>
						<CardDescription>
							Deleting your account permanently removes all your
							data. This cannot be undone.
						</CardDescription>
					</div>
				</CardHeader>

				<Separator />

				<CardContent className="pt-6 grid sm:grid-cols-[1fr_auto] gap-3 items-center">
					<div className="flex gap-2 justify-end">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="destructive">
									<Trash2 className="mr-2 h-4 w-4" />
									Delete account
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										Delete account?
									</AlertDialogTitle>
									<AlertDialogDescription>
										This will permanently remove your
										account and all associated data. You
										will lose all remaining credits, and
										every team you own will be deleted. Type{" "}
										<span className="font-semibold">
											DELETE
										</span>{" "}
										to confirm.
									</AlertDialogDescription>
								</AlertDialogHeader>

								<ConfirmDelete
									onConfirm={handleDeleteAccount}
									deleting={deleting}
								/>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

/** Small inline confirmation block to guard destructive action */
function ConfirmDelete({
	onConfirm,
	deleting,
}: {
	onConfirm: () => void;
	deleting: boolean;
}) {
	const [text, setText] = React.useState("");
	const ok = text.trim().toUpperCase() === "DELETE";
	return (
		<div className="grid gap-3">
			<div className="grid gap-2">
				<Label htmlFor="confirmDelete">Confirmation</Label>
				<Input
					id="confirmDelete"
					placeholder='Type "DELETE" to confirm'
					value={text}
					onChange={(e) => setText(e.target.value)}
					autoFocus
				/>
			</div>
			<AlertDialogFooter>
				<div className="flex w-full items-center justify-end gap-2">
					<AlertDialogCancel className="w-auto" disabled={deleting}>
						Cancel
					</AlertDialogCancel>

					<Button
						variant="destructive"
						onClick={onConfirm}
						disabled={!ok || deleting}
					>
						{deleting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Deleting...
							</>
						) : (
							"Yes, delete my account"
						)}
					</Button>

					{/* keep the AlertDialogAction present if needed by some implementations, hidden by default */}
					<AlertDialogAction className="hidden" />
				</div>
			</AlertDialogFooter>
		</div>
	);
}
