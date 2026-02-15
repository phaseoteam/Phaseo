// app/terms/page.tsx
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Terms of Service | AI Stats",
	description:
		"Terms governing use of the AI Stats model directory and unified API gateway.",
};

export default async function TermsPage() {
	return (
		<main className="container mx-auto space-y-8 px-4 py-10 text-sm leading-relaxed text-muted-foreground">
			<header className="space-y-3">
				<p className="text-xs text-muted-foreground/80">
					Last updated: 15 November 2025
				</p>
				<h1 className="text-3xl font-semibold text-foreground">
					AI Stats Terms of Service
				</h1>
				<p className="text-sm text-foreground/80">
					These Terms of Service (&quot;Terms&quot;) govern your use
					of the AI Stats website, data directory and unified API
					gateway (collectively, the &quot;Service&quot;).
				</p>
				<p className="text-sm text-foreground/80">
					The Service is operated by{" "}
					<span className="font-medium">Daniel Butler</span> operating
					under the name <span className="font-medium">AI Stats</span>{" "}
					( &quot;AI Stats&quot;, &quot;we&quot;, &quot;us&quot; or
					&quot;our&quot;).
				</p>
				<p className="text-sm text-foreground/80">
					By accessing or using the Service, you agree to be bound by
					these Terms and our{" "}
					<Link href="/privacy" className="text-primary underline">
						Privacy Policy
					</Link>
					. If you do not agree, you must not use the Service.
				</p>
			</header>

			<section aria-labelledby="section-1">
				<h2
					id="section-1"
					className="text-xl font-semibold text-foreground/90"
				>
					1. Service overview
				</h2>
				<p className="mt-2 text-foreground/80">AI Stats provides:</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						a public directory of AI models, providers, benchmarks,
						pricing and other metadata; and
					</li>
					<li>
						an optional API gateway that lets you send requests to
						certain third-party AI providers through a unified
						interface.
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					We may add, change or remove models, providers, endpoints or
					other features at any time. Availability of specific models
					or providers depends on those third parties and is not
					guaranteed.
				</p>
				<p className="mt-2 text-foreground/80">
					Where reasonably possible, we will give advance notice of
					material changes to the Service, including the removal of
					models or providers from the directory or gateway. However,
					we may sometimes need to make immediate changes (for
					example, for security, legal or provider reasons), and we
					cannot guarantee uninterrupted availability.
				</p>
			</section>

			<section aria-labelledby="section-2">
				<h2
					id="section-2"
					className="text-xl font-semibold text-foreground/90"
				>
					2. Eligibility and accounts
				</h2>
				<p className="mt-2 text-foreground/80">
					You must be at least{" "}
					<span className="font-medium">13 years old</span> to use the
					Service. If you are under 18, you should only use the
					Service with the permission of a parent or legal guardian.
				</p>
				<p className="mt-2 text-foreground/80">
					If you use the Service on behalf of a company or
					organisation, you confirm that you are authorised to bind
					that entity to these Terms.
				</p>
				<p className="mt-2 text-foreground/80">
					Most features (including the gateway, dashboards and usage
					analytics) require an account. When you register, you may be
					asked to provide contact details such as your email address
					and, where applicable, basic organisation information. We
					will store and use this information as described in our{" "}
					<Link href="/privacy" className="text-primary underline">
						Privacy Policy
					</Link>
					.
				</p>
				<p className="mt-2 text-foreground/80">
					You are responsible for:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						keeping your account information accurate and up to
						date;
					</li>
					<li>
						maintaining the confidentiality of your password, API
						keys and any other credentials; and
					</li>
					<li>
						all activity that occurs under your account, including
						any usage of the gateway via your keys.
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					If you believe your account or keys have been compromised,
					you must notify us promptly at{" "}
					<a
						href="mailto:support@phaseo.app"
						className="text-primary underline"
					>
						support@phaseo.app
					</a>
					. You should also immediately rotate any affected keys in
					your own systems. We are not responsible for losses arising
					from your failure to keep your credentials secure.
				</p>
			</section>

			<section aria-labelledby="section-3">
				<h2
					id="section-3"
					className="text-xl font-semibold text-foreground/90"
				>
					3. Fees, credits and payment
				</h2>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					3.1 Credits and wallet
				</h3>
				<p className="mt-1 text-foreground/80">
					Some parts of the Service (such as routing requests through
					the AI Stats gateway) may require payment via a pre-paid,
					deposit-based wallet or credit balance
					(&quot;Credits&quot;). The applicable pricing will be shown
					in advance and is currently denominated in{" "}
					<span className="font-medium">US dollars (USD)</span>.
				</p>
				<p className="mt-1 text-foreground/80">
					When you purchase Credits, you are buying a balance that can
					be used to pay for eligible usage of the Service. You are
					responsible for all usage that consumes Credits from your
					account.
				</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					3.2 Payment processing (Stripe)
				</h3>
				<p className="mt-1 text-foreground/80">
					All payments for Credits are processed by third-party
					payment providers such as Stripe. By providing a payment
					method, you authorise us and our payment processors to
					charge the amounts shown at checkout.
				</p>
				<p className="mt-1 text-foreground/80">
					We do not store your full card details on our own servers.
					Storage and processing of card details is handled by Stripe
					in accordance with their security standards and terms.
				</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					3.3 Auto top-up
				</h3>
				<p className="mt-1 text-foreground/80">
					You may choose to enable an automatic top-up feature for
					your wallet (&quot;Auto Top-Up&quot;). If you enable Auto
					Top-Up, you:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						authorise us and our payment processor to automatically
						charge your saved payment method for a specified amount
						in USD whenever your balance falls below a threshold you
						define; and
					</li>
					<li>
						remain responsible for any charges incurred until you
						disable Auto Top-Up in your account settings.
					</li>
				</ul>
				<p className="mt-1 text-foreground/80">
					We still do not store full card details on our servers, even
					when Auto Top-Up is enabled.
				</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					3.4 Refunds and expiry
				</h3>
				<p className="mt-1 text-foreground/80">
					To the extent permitted by law:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						used Credits are{" "}
						<span className="font-medium">non-refundable</span>;
					</li>
					<li>
						we may, at our discretion, set an expiry period for
						unused Credits (for example, 12 months from purchase),
						which will be communicated in advance if introduced; and
					</li>
					<li>
						if you contact us within{" "}
						<span className="font-medium">24 hours</span> of
						purchasing Credits, we will normally refund any{" "}
						<span className="font-medium">unused</span> Credits in
						full, subject to our ability to verify the transaction
						and your usage.
					</li>
				</ul>
				<p className="mt-1 text-foreground/80">
					To request a refund of unused Credits within the 24-hour
					window, email{" "}
					<a
						href="mailto:support@phaseo.app"
						className="text-primary underline"
					>
						support@phaseo.app
					</a>
					. This voluntary policy does not affect any mandatory
					consumer rights you may have under applicable law.
				</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					3.5 Pricing changes and billing errors
				</h3>
				<p className="mt-1 text-foreground/80">
					We may update our pricing from time to time. Where changes
					are material and affect you, we will give reasonable notice
					(for example, via email or in-product notification).
					Continued use of the paid features after the effective date
					of any change constitutes your acceptance of the new
					pricing.
				</p>
				<p className="mt-1 text-foreground/80">
					If we discover a billing error (for example, an incorrect
					rate or token count applied), we may correct the error by
					adjusting your Credits balance. If you believe you have been
					incorrectly charged, please contact us as soon as possible.
					Where we confirm an error in your favour, we will credit or
					refund the overcharged amount.
				</p>
			</section>

			<section aria-labelledby="section-4">
				<h2
					id="section-4"
					className="text-xl font-semibold text-foreground/90"
				>
					4. Inputs, outputs and your content
				</h2>
				<p className="mt-2 text-foreground/80">
					When you use the Service, you may submit text, prompts, data
					or other material (&quot;Inputs&quot;) and receive
					model-generated responses (&quot;Outputs&quot;). Together,
					Inputs and Outputs are referred to as &quot;User
					Content&quot;.
				</p>
				<p className="mt-2 text-foreground/80">
					You retain ownership of your User Content, subject to:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>any licences you grant to us under these Terms; and</li>
					<li>
						any terms imposed by the underlying third-party model
						providers (for example, OpenAI, Anthropic, Google, xAI,
						etc.).
					</li>
				</ul>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					4.1 How we handle prompts and outputs
				</h3>
				<p className="mt-1 text-foreground/80">
					We route your Inputs to third-party providers via the
					gateway and stream Outputs back to you. We do{" "}
					<span className="font-medium">not</span> persistently store
					the raw text of your prompts or the full text of model
					Outputs, other than temporarily as is technically necessary
					to process the request in flight.
				</p>
				<p className="mt-1 text-foreground/80">
					We do, however, store high-level telemetry and billing
					metadata to power analytics and ensure the Service continues
					to function. This telemetry may include, for example:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						timestamps, model identifiers and provider identifiers;
					</li>
					<li>
						request metrics such as token counts, latency,
						throughput and error codes; and
					</li>
					<li>
						aggregated or anonymised usage statistics for
						performance and product improvement.
					</li>
				</ul>
				<p className="mt-1 text-foreground/80">
					We use this telemetry to operate, maintain and improve the
					Service, and to provide you with usage insights. We do not
					use your prompts or Outputs to train our own models.
				</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					4.2 Third-party provider terms
				</h3>
				<p className="mt-1 text-foreground/80">
					When you use the gateway to call a model, your request is
					processed by the relevant third-party provider. By using
					those models through the Service, you agree that you are
					also bound by the applicable terms, policies and
					acceptable-use rules of each provider you access.
				</p>
				<p className="mt-1 text-foreground/80">
					It is your responsibility to review and comply with those
					third-party terms. We are not responsible for how those
					providers handle your data or for any changes they make to
					their services or pricing.
				</p>

				<h3 className="mt-3 text-base font-semibold text-foreground">
					4.3 Your responsibilities for User Content
				</h3>
				<p className="mt-1 text-foreground/80">
					You are responsible for your Inputs and your use of Outputs.
					You confirm that:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						you have all necessary rights, permissions and consents
						to submit the Inputs and to use the Outputs; and
					</li>
					<li>
						your Inputs and your use of the Service will not
						infringe any intellectual property, privacy or other
						rights, or cause us to violate any law or third-party
						terms.
					</li>
				</ul>
				<p className="mt-1 text-foreground/80">
					We are not obliged to monitor User Content. However, we may
					remove or restrict access to User Content where we
					reasonably believe it violates these Terms or applicable
					law.
				</p>
			</section>

			<section aria-labelledby="section-5">
				<h2
					id="section-5"
					className="text-xl font-semibold text-foreground/90"
				>
					5. Prohibited use
				</h2>
				<p className="mt-2 text-foreground/80">
					You must <span className="font-medium">not</span>:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						use the Service in any unlawful way or in breach of any
						applicable law, regulation or third-party provider
						terms;
					</li>
					<li>
						use the Service to generate or distribute harmful,
						abusive, discriminatory, fraudulent or otherwise
						inappropriate content;
					</li>
					<li>
						interfere with or disrupt the Service, including by
						introducing malware, overloading our infrastructure or
						attempting to bypass rate limits or security controls;
					</li>
					<li>
						access or scrape the Service using automated tools (such
						as bots, scripts or crawlers) without our prior written
						permission, except where explicitly allowed by
						documented APIs;
					</li>
					<li>
						reverse engineer, decompile or otherwise attempt to
						derive the source code of the Service, except where such
						restrictions are prohibited by law;
					</li>
					<li>
						use another user&apos;s account or share your
						credentials with others; or
					</li>
					<li>
						attempt to circumvent these Terms or assist anyone else
						in doing so.
					</li>
				</ul>
			</section>

			<section aria-labelledby="section-6">
				<h2
					id="section-6"
					className="text-xl font-semibold text-foreground/90"
				>
					6. Suspension and termination
				</h2>
				<p className="mt-2 text-foreground/80">
					You may stop using the Service at any time. You can request
					closure of your account by contacting us at{" "}
					<a
						href="mailto:support@phaseo.app"
						className="text-primary underline"
					>
						support@phaseo.app
					</a>
					.
				</p>
				<p className="mt-2 text-foreground/80">
					We may suspend or terminate your access to all or part of
					the Service if:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>you materially or repeatedly breach these Terms;</li>
					<li>
						we are required to do so by law or by a third-party
						provider; or
					</li>
					<li>
						we decide to discontinue the Service (in whole or in
						part) for technical, business or legal reasons.
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					Where reasonable, we will give you advance notice of
					suspension or termination. If we permanently discontinue the
					Service, we will use reasonable efforts to allow you to
					export any important data before shutdown.
				</p>
				<p className="mt-2 text-foreground/80">
					To the maximum extent permitted by law, we are not obliged
					to refund any fees or unused Credits where we suspend or
					terminate your access because you have breached these Terms.
				</p>
			</section>

			<section aria-labelledby="section-7">
				<h2
					id="section-7"
					className="text-xl font-semibold text-foreground/90"
				>
					7. Privacy
				</h2>
				<p className="mt-2 text-foreground/80">
					For information about how we collect, use and share personal
					data, please see our{" "}
					<Link href="/privacy" className="text-primary underline">
						Privacy Policy
					</Link>
					. The Privacy Policy forms part of these Terms.
				</p>
			</section>

			<section aria-labelledby="section-8">
				<h2
					id="section-8"
					className="text-xl font-semibold text-foreground/90"
				>
					8. Changes to the Service and to these Terms
				</h2>
				<p className="mt-2 text-foreground/80">
					We are constantly improving AI Stats and may change, add or
					remove features from time to time.
				</p>
				<p className="mt-2 text-foreground/80">
					We may also update these Terms occasionally. If we make
					material changes, we will endeavour to give you reasonable
					notice (for example, via email, a banner on the site, or
					in-app messaging). If you continue to use the Service after
					the updated Terms come into effect, we will treat this as
					your acceptance of the changes.
				</p>
			</section>

			<section aria-labelledby="section-9">
				<h2
					id="section-9"
					className="text-xl font-semibold text-foreground/90"
				>
					9. Intellectual property and open-source components
				</h2>
				<p className="mt-2 text-foreground/80">
					The Service, including its design, content, documentation
					and software, is owned by us or our licensors and is
					protected by intellectual property laws.
				</p>
				<p className="mt-2 text-foreground/80">
					We also use and publish open-source software. Use of our
					open-source repositories is governed by the licences
					included in those repositories (for example, MIT or Apache
					licences), not by these Terms. In case of conflict between
					an open-source licence and these Terms, the open-source
					licence will take precedence for that component.
				</p>
				<p className="mt-2 text-foreground/80">
					Nothing in these Terms grants you any right to use our trade
					names, logos or trademarks without our prior written
					permission.
				</p>
			</section>

			<section aria-labelledby="section-10">
				<h2
					id="section-10"
					className="text-xl font-semibold text-foreground/90"
				>
					10. Feedback
				</h2>
				<p className="mt-2 text-foreground/80">
					If you provide feedback, ideas or suggestions about the
					Service (&quot;Feedback&quot;), you agree that we may use it
					without restriction or obligation to you. You grant us a
					perpetual, irrevocable, worldwide, royalty-free licence to
					use, copy, modify and exploit the Feedback for any purpose
					in connection with our products and services.
				</p>
			</section>

			<section aria-labelledby="section-11">
				<h2
					id="section-11"
					className="text-xl font-semibold text-foreground/90"
				>
					11. Indemnity (for business users)
				</h2>
				<p className="mt-2 text-foreground/80">
					If you are using the Service on behalf of a business, you
					agree to indemnify and hold harmless Daniel Butler (trading
					as Phaseo) from and against any claims, losses, damages,
					liabilities, costs and expenses (including reasonable legal
					fees) arising out of or relating to:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>your use of the Service;</li>
					<li>your User Content; or</li>
					<li>your breach of these Terms or any applicable law.</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					If you are a consumer, this clause only applies to the
					extent permitted by applicable law.
				</p>
			</section>

			<section aria-labelledby="section-12">
				<h2
					id="section-12"
					className="text-xl font-semibold text-foreground/90"
				>
					12. Disclaimers
				</h2>
				<p className="mt-2 text-foreground/80">
					The Service is provided on an{" "}
					<span className="font-medium">
						&quot;as is&quot; and &quot;as available&quot;
					</span>{" "}
					basis. To the maximum extent permitted by law, we do not
					make any promises or warranties (express or implied) about:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>the accuracy or completeness of any model Outputs;</li>
					<li>
						the availability, reliability or performance of the
						Service or any third-party provider; or
					</li>
					<li>
						the Service being free from errors, bugs,
						vulnerabilities or interruptions.
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					AI-generated content can be inaccurate, incomplete or
					misleading. You are responsible for independently evaluating
					Outputs and any information displayed via the Service before
					relying on it.
				</p>
				<p className="mt-2 text-foreground/80">
					We maintain a comprehensive database of models, providers,
					benchmarks and pricing and we aim to keep this information
					as accurate and up-to-date as reasonably possible. However,
					the AI ecosystem changes quickly, and we cannot guarantee
					that all entries, prices or benchmarks are correct, current
					or complete. You should not rely solely on the Site for
					critical decisions (such as procurement or compliance)
					without performing your own checks against primary sources.
				</p>
				<p className="mt-2 text-foreground/80">
					Nothing in these Terms is intended to exclude or limit any
					warranties or rights that cannot be excluded or limited
					under applicable law (for example, certain rights available
					to consumers).
				</p>
			</section>

			<section aria-labelledby="section-13">
				<h2
					id="section-13"
					className="text-xl font-semibold text-foreground/90"
				>
					13. Limitation of liability
				</h2>
				<p className="mt-2 text-foreground/80">
					Nothing in these Terms excludes or limits liability for:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>death or personal injury caused by negligence;</li>
					<li>fraud or fraudulent misrepresentation; or</li>
					<li>
						any other liability that cannot be excluded or limited
						under applicable law.
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					Subject to the above, and to the maximum extent permitted by
					law:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						we will not be liable for any loss of profits, loss of
						business, loss of data, loss of goodwill, or any
						indirect or consequential loss arising out of or in
						connection with your use of (or inability to use) the
						Service, including any failure of the Service, any error
						in our database, or any failure by you to protect your
						keys, passwords or other credentials; and
					</li>
					<li>
						our total aggregate liability to you for all claims
						arising out of or relating to the Service and these
						Terms will be limited to the greater of:
						<ul className="mt-1 list-[circle] space-y-1 pl-5">
							<li>
								the total amount you paid to us for the Service
								in the{" "}
								<span className="font-medium">12 months</span>{" "}
								before the event giving rise to the claim; or
							</li>
							<li>
								<span className="font-medium">£100</span>.
							</li>
						</ul>
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					If there is a specific issue with our pricing or billing
					(for example, an incorrect rate applied by our systems),
					your primary remedy will be an appropriate correction,
					credit or refund of the affected amount, as described in
					Section 3.5.
				</p>
			</section>

			<section aria-labelledby="section-14">
				<h2
					id="section-14"
					className="text-xl font-semibold text-foreground/90"
				>
					14. Governing law and jurisdiction
				</h2>
				<p className="mt-2 text-foreground/80">
					These Terms, and any dispute or claim relating to them or to
					the Service, are governed by the laws of{" "}
					<span className="font-medium">England and Wales</span>.
				</p>
				<p className="mt-2 text-foreground/80">
					If you are a business user, you and we agree that the courts
					of England and Wales will have exclusive jurisdiction.
				</p>
				<p className="mt-2 text-foreground/80">
					If you are a consumer, you may also have the right to bring
					proceedings in your country of residence under applicable
					consumer laws. These Terms do not limit any mandatory rights
					you have under such laws.
				</p>
			</section>

			<section aria-labelledby="section-15">
				<h2
					id="section-15"
					className="text-xl font-semibold text-foreground/90"
				>
					15. General
				</h2>
				<p className="mt-2 text-foreground/80">
					If any part of these Terms is held to be invalid or
					unenforceable, the remainder will remain in full force and
					effect.
				</p>
				<p className="mt-2 text-foreground/80">
					You may not assign or transfer your rights or obligations
					under these Terms without our prior written consent. We may
					transfer our rights and obligations under these Terms to
					another organisation in connection with a business
					reorganisation or sale.
				</p>
				<p className="mt-2 text-foreground/80">
					Our failure to enforce any right or provision of these Terms
					will not be considered a waiver of those rights.
				</p>
				<p className="mt-2 text-foreground/80">
					Upon termination of your access to the Service, the
					following sections will continue to apply: Sections 2, 3, 4,
					5 and 8–15.
				</p>
			</section>

			<section aria-labelledby="section-16">
				<h2
					id="section-16"
					className="text-xl font-semibold text-foreground/90"
				>
					16. Contact
				</h2>
				<p className="mt-2 text-foreground/80">
					The Service is offered by{" "}
					<span className="font-medium">Daniel Butler</span>, trading
					as <span className="font-medium">Phaseo</span>.
				</p>
				<p className="mt-2 text-foreground/80">
					If you have any questions about these Terms, you can contact
					us at:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						Email:{" "}
						<a
							href="mailto:support@phaseo.app"
							className="text-primary underline"
						>
							support@phaseo.app
						</a>
					</li>
				</ul>
			</section>
		</main>
	);
}
