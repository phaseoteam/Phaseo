import { NextResponse } from "next/server";
import {
	deriveFirstName,
	sendCheckoutStartedEvent,
	type ResendCheckoutStartedPayload,
} from "@/lib/automations/resend-events";
import { sendBillingDiscordWebhook } from "@/lib/automations/billingDiscord";
import { buildStripeCheckoutRedirectUrls } from "@/lib/stripeCheckoutRedirects";
import { getStripe } from "@/lib/stripe";
import { requireActiveWorkspaceStripeCustomer } from "@/lib/server/activeTeamStripe";

type CheckoutKind = "oneoff" | "pay_and_save" | "save_only";
type CheckoutStartedNotificationKind =
	ResendCheckoutStartedPayload["checkoutKind"];

type CreateStripeCheckoutResponseArgs = {
	amountPence?: number;
	currency?: string;
	kind: CheckoutKind;
	notificationCheckoutKind?: CheckoutStartedNotificationKind;
	originHeader: string | null;
	refererHeader: string | null;
	requestedWorkspaceId?: string;
};

function isPositiveCheckoutAmount(value: number | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 500;
}

async function sendCheckoutStartedNotifications(args: {
	checkoutSessionId: string;
	payload: ResendCheckoutStartedPayload;
	userEmail: string | null;
	logContext: Record<string, unknown>;
}) {
	if (args.userEmail) {
		try {
			await sendCheckoutStartedEvent({
				email: args.userEmail,
				payload: args.payload,
			});
		} catch (error) {
			// eslint-disable-next-line no-console
			console.error("Failed sending checkout.started event", {
				...args.logContext,
				checkoutSessionId: args.checkoutSessionId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	try {
		await sendBillingDiscordWebhook({
			event: "checkout_started",
			email: args.userEmail,
			payload: args.payload,
		});
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("Failed sending billing Discord webhook", {
			...args.logContext,
			checkoutSessionId: args.checkoutSessionId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function createStripeCheckoutResponse(
	args: CreateStripeCheckoutResponseArgs,
): Promise<NextResponse> {
	const {
		amountPence,
		currency = "usd",
		kind,
		notificationCheckoutKind,
		originHeader,
		refererHeader,
		requestedWorkspaceId,
	} = args;
	const {
		workspaceId,
		customerId,
		userId,
		userEmail,
		userDisplayName,
	} = await requireActiveWorkspaceStripeCustomer({
		createIfMissing: true,
	});
	const firstName = deriveFirstName(userDisplayName);

	if (requestedWorkspaceId && requestedWorkspaceId !== workspaceId) {
		return NextResponse.json({ error: "Workspace mismatch" }, { status: 403 });
	}

	const { successUrl, cancelUrl } = buildStripeCheckoutRedirectUrls({
		configuredBaseUrl: process.env.NEXT_PUBLIC_BASE_URL,
		originHeader,
		refererHeader,
		kind,
	});

	const stripe = getStripe();

	if (kind === "oneoff") {
		if (!isPositiveCheckoutAmount(amountPence)) {
			return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
		}

		const paymentAttempt = Date.now();
		const { successUrl: paymentSuccessUrl } = buildStripeCheckoutRedirectUrls({
			configuredBaseUrl: process.env.NEXT_PUBLIC_BASE_URL,
			originHeader,
			refererHeader,
			kind,
			paymentAttempt,
		});

		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			payment_method_types: ["card", "link"],
			payment_method_options: {
				card: {
					request_three_d_secure: "automatic",
				},
			},
			customer: customerId,
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency,
						unit_amount: amountPence,
						product_data: { name: "AI Credits top-up (one-off)" },
					},
				},
			],
			payment_intent_data: {
				metadata: {
					purpose: "top_up_one_off",
					...(workspaceId ? { workspace_id: workspaceId } : {}),
				},
			},
			success_url: paymentSuccessUrl,
			cancel_url: cancelUrl,
			allow_promotion_codes: false,
			billing_address_collection: "auto",
			metadata: {
				purpose: "top_up_one_off",
				...(workspaceId ? { workspace_id: workspaceId } : {}),
			},
		});

		const startedAtIso = new Date().toISOString();
		const checkoutKindForNotifications =
			notificationCheckoutKind ?? "oneoff";
		const checkoutStartedPayload: ResendCheckoutStartedPayload = {
			workspaceId,
			userId,
			firstName,
			checkoutSessionId: session.id,
			checkoutKind: checkoutKindForNotifications,
			currency,
			amountPence,
			startedAtIso,
		};

		await sendCheckoutStartedNotifications({
			checkoutSessionId: session.id,
			payload: checkoutStartedPayload,
			userEmail,
			logContext: {
				workspaceId,
				userId,
				checkoutKind: checkoutKindForNotifications,
			},
		});

		return NextResponse.json({ url: session.url });
	}

	if (kind === "pay_and_save") {
		if (!isPositiveCheckoutAmount(amountPence)) {
			return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
		}

		const paymentAttempt = Date.now();
		const { successUrl: paymentSuccessUrl } = buildStripeCheckoutRedirectUrls({
			configuredBaseUrl: process.env.NEXT_PUBLIC_BASE_URL,
			originHeader,
			refererHeader,
			kind,
			paymentAttempt,
		});

		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			payment_method_types: ["card", "link"],
			payment_method_options: {
				card: { request_three_d_secure: "automatic" },
			},
			customer: customerId,
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency,
						unit_amount: amountPence,
						product_data: { name: "AI Credits top-up (save card)" },
					},
				},
			],
			payment_intent_data: {
				setup_future_usage: "off_session",
				metadata: {
					purpose: "top_up",
					...(workspaceId ? { workspace_id: workspaceId } : {}),
				},
			},
			success_url: paymentSuccessUrl,
			cancel_url: cancelUrl,
		});

		const startedAtIso = new Date().toISOString();
		const checkoutKindForNotifications =
			notificationCheckoutKind ?? "pay_and_save";
		const checkoutStartedPayload: ResendCheckoutStartedPayload = {
			workspaceId,
			userId,
			firstName,
			checkoutSessionId: session.id,
			checkoutKind: checkoutKindForNotifications,
			currency,
			amountPence,
			startedAtIso,
		};

		await sendCheckoutStartedNotifications({
			checkoutSessionId: session.id,
			payload: checkoutStartedPayload,
			userEmail,
			logContext: {
				workspaceId,
				userId,
				checkoutKind: checkoutKindForNotifications,
			},
		});

		return NextResponse.json({ url: session.url });
	}

	if (kind === "save_only") {
		// eslint-disable-next-line no-console
		console.log(`creating setup session (save_only) customerId=${customerId}`);
		const session = await stripe.checkout.sessions.create({
			mode: "setup",
			payment_method_types: ["card", "link"],
			customer: customerId,
			success_url: successUrl,
			cancel_url: cancelUrl,
			setup_intent_data: {
				metadata: {
					purpose: "auto_topup_setup",
					...(workspaceId ? { workspace_id: workspaceId } : {}),
				},
			},
		});

		return NextResponse.json({ url: session.url });
	}

	return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}
