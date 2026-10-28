import { NextResponse } from "next/server";
import {
	deriveFirstName,
	sendCheckoutStartedEvent,
	type ResendCheckoutStartedPayload,
} from "@/lib/automations/resend-events";
import { sendBillingDiscordWebhook } from "@/lib/automations/billingDiscord";
import {
	buildStripeCheckoutRedirectUrls,
	resolveConfiguredStripeCheckoutBaseUrl,
} from "@/lib/stripeCheckoutRedirects";
import { getStripe } from "@/lib/stripe";
import { requireActiveWorkspaceStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { normaliseCountryCode } from "@/lib/countryCodes";
import { isValidTopUpAmountPence, TOP_UP_CURRENCY } from "@/lib/server/topUpValidation";
import { CREDIT_TOPUP_METADATA } from "@/lib/server/creditTopups";

type CheckoutKind = "oneoff" | "pay_and_save" | "save_only";
type CheckoutStartedNotificationKind =
	ResendCheckoutStartedPayload["checkoutKind"];

type CreateStripeCheckoutResponseArgs = {
	amountPence?: number;
	countryCode?: string;
	kind: CheckoutKind;
	notificationCheckoutKind?: CheckoutStartedNotificationKind;
	originHeader: string | null;
	refererHeader: string | null;
	requestedWorkspaceId?: string;
	/**
	 * A top-up request from the API or CLI (credit_topup_requests). Bills that request's
	 * workspace instead of the active one, tags the PaymentIntent so the webhook can mark the
	 * request paid, shows the saved-card terms, and expires the session with the request.
	 * The session is created with the request id as the Stripe idempotency key and params that
	 * depend only on the request, so concurrent or repeated clicks get one session, never two.
	 */
	topUpRequest?: {
		id: string;
		workspaceId: string;
		createdAt: string;
		expiresAt: string;
		onSessionCreated: (sessionId: string) => Promise<void>;
	};
};

// Terms shown when an API or CLI top-up saves the card for later top-ups.
const TOP_UP_REQUEST_MANDATE =
	"By paying, you allow Phaseo to save this card and charge it for later credit top-ups. Each top-up requested through the Phaseo API or CLI is charged only after a workspace owner or admin confirms it from an email. You can remove the card at any time in Settings.";
// Stripe needs a session to last at least 30 minutes from its creation; counting from the
// request's own expiry keeps expires_at stable across repeated creates for the same request.
const TOP_UP_REQUEST_SESSION_SECONDS = 31 * 60;

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
		countryCode: countryValue,
		kind,
		notificationCheckoutKind,
		originHeader,
		refererHeader,
		requestedWorkspaceId,
		topUpRequest,
	} = args;
	const configuredBaseUrl = resolveConfiguredStripeCheckoutBaseUrl(process.env);
	if (process.env.NODE_ENV === "production" && !configuredBaseUrl) {
		return NextResponse.json({ error: "Checkout redirect base URL is not configured" }, { status: 503 });
	}
	const allowRequestHeaderFallback = process.env.NODE_ENV !== "production";
	const {
		workspaceId,
		customerId,
		userId,
		userEmail,
		userDisplayName,
	} = await requireActiveWorkspaceStripeCustomer({
		createIfMissing: true,
		...(topUpRequest ? { workspaceId: topUpRequest.workspaceId } : {}),
	});
	const firstName = deriveFirstName(userDisplayName);
	const rateLimit = await createAdminClient().rpc("consume_checkout_rate_limit", {
		p_workspace_id: workspaceId,
		p_user_id: userId,
		p_limit: 10,
	});
	if (rateLimit.error) {
		return NextResponse.json({ error: "Checkout is temporarily unavailable" }, { status: 503 });
	}
	if (rateLimit.data !== true) {
		return NextResponse.json({ error: "Too many checkout attempts" }, {
			status: 429,
			headers: { "Retry-After": "60" },
		});
	}
	const countryCode = normaliseCountryCode(countryValue);
	if (kind !== "save_only" && !countryCode) {
		return NextResponse.json({ error: "Country is required before purchasing credits" }, { status: 400 });
	}

	if (requestedWorkspaceId && requestedWorkspaceId !== workspaceId) {
		return NextResponse.json({ error: "Workspace mismatch" }, { status: 403 });
	}
	if (countryCode) {
		const { error } = await createAdminClient()
			.from("users")
			.update({ declared_country_code: countryCode, country_declared_at: new Date().toISOString() })
			.eq("user_id", userId);
		if (error) {
			return NextResponse.json({ error: "Could not confirm purchase location" }, { status: 503 });
		}
	}

	const { successUrl, cancelUrl } = buildStripeCheckoutRedirectUrls({
		configuredBaseUrl,
		originHeader,
		refererHeader,
		kind,
		allowRequestHeaderFallback,
	});

	const stripe = getStripe();
	const topUpRequestMetadata: Record<string, string> = topUpRequest
		? { [CREDIT_TOPUP_METADATA.requestId]: topUpRequest.id, [CREDIT_TOPUP_METADATA.flow]: "checkout" }
		: {};
	if (topUpRequest && kind !== "pay_and_save") {
		return NextResponse.json({ error: "Top-up requests use pay_and_save checkout" }, { status: 400 });
	}

	if (kind === "oneoff") {
		if (!isValidTopUpAmountPence(amountPence)) {
			return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
		}

		const paymentAttempt = Date.now();
		const { successUrl: paymentSuccessUrl } = buildStripeCheckoutRedirectUrls({
			configuredBaseUrl,
			originHeader,
			refererHeader,
			kind,
			paymentAttempt,
			allowRequestHeaderFallback,
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
						currency: TOP_UP_CURRENCY,
						unit_amount: amountPence,
						product_data: { name: "AI Credits top-up (one-off)" },
					},
				},
			],
			payment_intent_data: {
				metadata: {
					purpose: "top_up_one_off",
					country_code: countryCode!,
					...(workspaceId ? { workspace_id: workspaceId } : {}),
				},
			},
			success_url: paymentSuccessUrl,
			cancel_url: cancelUrl,
			allow_promotion_codes: false,
			billing_address_collection: "required",
			customer_update: { address: "auto", name: "auto" },
			metadata: {
				purpose: "top_up_one_off",
				country_code: countryCode!,
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
			currency: TOP_UP_CURRENCY,
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
		if (!isValidTopUpAmountPence(amountPence)) {
			return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
		}

		const paymentAttempt = topUpRequest ? Date.parse(topUpRequest.createdAt) : Date.now();
		const { successUrl: paymentSuccessUrl } = buildStripeCheckoutRedirectUrls({
			configuredBaseUrl,
			originHeader,
			refererHeader,
			kind,
			paymentAttempt,
			allowRequestHeaderFallback,
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
						currency: TOP_UP_CURRENCY,
						unit_amount: amountPence,
						product_data: { name: "AI Credits top-up (save card)" },
					},
				},
			],
			payment_intent_data: {
				setup_future_usage: "off_session",
				metadata: {
					purpose: "top_up",
					country_code: countryCode!,
					...(workspaceId ? { workspace_id: workspaceId } : {}),
					...topUpRequestMetadata,
				},
			},
			success_url: paymentSuccessUrl,
			cancel_url: cancelUrl,
			billing_address_collection: "required",
			customer_update: { address: "auto", name: "auto" },
			metadata: {
				purpose: "top_up",
				country_code: countryCode!,
				...(workspaceId ? { workspace_id: workspaceId } : {}),
				...topUpRequestMetadata,
			},
			...(topUpRequest
				? {
						custom_text: { submit: { message: TOP_UP_REQUEST_MANDATE } },
						expires_at: Math.floor(Date.parse(topUpRequest.expiresAt) / 1000) + TOP_UP_REQUEST_SESSION_SECONDS,
					}
				: {}),
		}, topUpRequest ? { idempotencyKey: `credit-topup-checkout:${topUpRequest.id}` } : undefined);
		if (topUpRequest) await topUpRequest.onSessionCreated(session.id);

		const startedAtIso = new Date().toISOString();
		const checkoutKindForNotifications =
			notificationCheckoutKind ?? "pay_and_save";
		const checkoutStartedPayload: ResendCheckoutStartedPayload = {
			workspaceId,
			userId,
			firstName,
			checkoutSessionId: session.id,
			checkoutKind: checkoutKindForNotifications,
			currency: TOP_UP_CURRENCY,
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
