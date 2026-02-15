// app/privacy/page.tsx
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Privacy Policy | AI Stats",
	description:
		"How AI Stats collects, uses, and protects personal data related to the Service.",
};

export default async function PrivacyPage() {
	return (
		<main className="container mx-auto space-y-8 px-4 py-10 text-sm leading-relaxed text-muted-foreground">
			<header className="space-y-3">
				<p className="text-xs text-muted-foreground/80">
					Last updated: 15 November 2025
				</p>
				<h1 className="text-3xl font-semibold text-foreground">
					AI Stats Privacy Policy
				</h1>
				<p className="text-foreground/80">
					This Privacy Policy explains how{" "}
					<span className="font-medium">Daniel Butler</span> operating
					under the name <span className="font-medium">AI Stats</span>{" "}
					( &quot;AI Stats&quot;, &quot;we&quot;, &quot;us&quot; or
					&quot;our&quot;) collects, uses and protects personal data
					when you use our websites, dashboards and API gateway
					(together, the &quot;Service&quot;).
				</p>

				<p className="text-foreground/80">
					This page is a high-level description of how we handle
					personal data. It is not legal advice. Capitalised terms not
					defined here have the meaning given in our{" "}
					<Link href="/terms" className="text-primary underline">
						Terms of Service
					</Link>
					.
				</p>
				<p className="text-foreground/80">
					By using the Service, you agree that we may process your
					personal data as described in this Privacy Policy and the
					Terms of Service. If you do not agree, you should not use
					the Service.
				</p>
			</header>

			<section aria-labelledby="privacy-scope">
				<h2
					id="privacy-scope"
					className="text-xl font-semibold text-foreground/90"
				>
					1. Who we are and how this Policy applies
				</h2>
				<p className="mt-2 text-foreground/80">
					For the purposes of UK and EU data protection law,{" "}
					<span className="font-medium">Daniel Butler</span>, trading
					as <span className="font-medium">Phaseo</span>, is the
					&quot;data controller&quot; responsible for personal data
					collected through AI Stats.
				</p>
				<p className="mt-2 text-foreground/80">
					This Privacy Policy applies when you:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>browse the AI Stats website or documentation;</li>
					<li>create and use an AI Stats account;</li>
					<li>
						use the AI Stats Gateway to route requests to
						third-party model providers; or
					</li>
					<li>
						interact with us via email, support channels or other
						communications.
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					Third-party model providers (for example OpenAI, Anthropic,
					Google, xAI and others) have their own privacy and data
					handling practices. When we forward your requests to them,
					they usually act as independent controllers of your data
					under their own terms and policies. You should review those
					policies separately.
				</p>
			</section>

			<section aria-labelledby="privacy-data-we-collect">
				<h2
					id="privacy-data-we-collect"
					className="text-xl font-semibold text-foreground/90"
				>
					2. Data we collect
				</h2>

				<h3 className="mt-3 text-lg font-semibold text-foreground/80">
					2.1 Information you provide to us
				</h3>
				<p className="mt-1 text-foreground/80">
					We collect information that you choose to provide directly,
					such as:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						<strong>Account details</strong> – for example your
						name, email address, organisation name, and password
						(stored as a hashed value) when you register.
					</li>
					<li>
						<strong>Profile and team information</strong> – details
						you add to your account or team profile, such as display
						names or project labels.
					</li>
					<li>
						<strong>Billing information</strong> – records relating
						to your purchases of Credits or subscriptions (for
						example currency, amount paid, timestamps). Card details
						are handled by our payment providers (such as Stripe)
						and are not stored in full on our servers.
					</li>
					<li>
						<strong>Support and communication</strong> – emails,
						messages and other communications you send to us (for
						example bug reports, feedback, or feature requests).
					</li>
					<li>
						<strong>Optional public data</strong> – if you opt in to
						sharing certain usage or app information publicly (for
						example, public app-usage pages or sponsor listings), we
						will process and display that information in accordance
						with your choices.
					</li>
				</ul>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					2.2 Inputs and Outputs sent through the Gateway
				</h3>
				<p className="mt-1 text-foreground/80">
					When you call models via the AI Stats Gateway, you send
					requests (&quot;Inputs&quot;) and receive responses
					(&quot;Outputs&quot;). These may include text or other data
					that could contain personal information, depending on what
					you choose to send.
				</p>
				<p className="mt-1 text-foreground/80">
					Our design goal is to minimise what we store:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						We{" "}
						<span className="font-medium">
							do not persistently store
						</span>{" "}
						the raw text of your prompts or the full text of model
						Outputs in our primary database or analytics tools.
					</li>
					<li>
						We may temporarily hold Inputs and Outputs in memory or
						transient buffers while processing a request or managing
						streaming, but these buffers are not used as long-term
						storage or training data.
					</li>
					<li>
						We send the necessary content from your request to the
						relevant third-party provider(s) so they can generate an
						Output. Those providers may log or store the data in
						line with their own policies.
					</li>
				</ul>
				<p className="mt-1 text-foreground/80">
					Because you control what you send, you should avoid
					including sensitive personal data in prompts or outputs
					unless it is strictly necessary and you are satisfied with
					the privacy practices of the relevant model providers.
				</p>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					2.3 Telemetry and technical data
				</h3>
				<p className="mt-1 text-foreground/80">
					We automatically collect certain technical and usage
					information when you use the Service, such as:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						<strong>Log and device data</strong> – IP address,
						browser type, operating system, device identifiers, the
						pages you visit, the features you use, timestamps, and
						referrer URLs.
					</li>
					<li>
						<strong>Gateway metrics</strong> – model and provider
						identifiers, request and response timestamps, token
						usage (input, output and other meters), latency, error
						codes, and similar metadata needed to run billing and
						health checks.
					</li>
					<li>
						<strong>Location indicators</strong> – a rough
						geographic approximation (such as country or region)
						derived from your IP address or other signals, used for
						analytics and abuse prevention.
					</li>
					<li>
						<strong>Configuration data</strong> – such as your
						chosen theme/appearance, feature flags, and other
						preferences stored in local storage or cookies.
					</li>
				</ul>
				<p className="mt-1 text-foreground/80">
					We use this telemetry to operate, secure, and improve the
					Service, to calculate usage and pricing, and to give you
					analytics and observability dashboards. We design our
					telemetry to avoid including raw prompt or output text.
				</p>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					2.4 Cookies and similar technologies
				</h3>
				<p className="mt-1 text-foreground/80">
					We use cookies and similar technologies (such as local
					storage, pixels, and scripts) to help our site function and
					to understand how it is used. These may include:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						<strong>Strictly necessary cookies</strong> – required
						for security and core features such as login and CSRF
						protection.
					</li>
					<li>
						<strong>Preference cookies</strong> – to remember
						settings like dark mode or your last selected filters.
					</li>
					<li>
						<strong>Analytics cookies</strong> – to measure usage,
						performance and errors, for example via tools like
						Google Analytics or PostHog.
					</li>
				</ul>
				<p className="mt-1 text-foreground/80">
					You can control cookies through your browser settings.
					Blocking some types of cookies may impact your experience or
					prevent certain features from working.
				</p>

				<h3 className="mt-4 text-lg font-semibold text-foreground/80">
					2.5 Analytics and product telemetry
				</h3>
				<p className="mt-1 text-foreground/80">
					We may use third-party analytics and error tracking tools
					(for example, Google Analytics, PostHog, or similar
					services) to help us understand how people use AI Stats and
					to identify where the product can be improved.
				</p>
				<p className="mt-1 text-foreground/80">
					These tools collect information such as pages visited,
					actions taken, device and browser information, and rough
					location data (such as country). We configure these tools so
					that they are not used to store raw prompts, Outputs, or
					other highly sensitive content flowing through the Gateway.
				</p>
			</section>

			<section aria-labelledby="privacy-how-we-use">
				<h2
					id="privacy-how-we-use"
					className="text-xl font-semibold text-foreground/90"
				>
					3. How we use personal data (and our legal bases)
				</h2>
				<p className="mt-2 text-foreground/80">
					We use personal data for the following purposes, under these
					legal bases (for UK/EU users):
				</p>
				<ul className="mt-2 list-disc space-y-2 pl-5 text-foreground/80">
					<li>
						<strong>To provide and operate the Service</strong> –
						including account creation, gateway routing, usage
						dashboards, billing, and customer support.
						<br />
						<span className="text-xs text-foreground/70">
							Lawful basis: performance of a contract; legitimate
							interests.
						</span>
					</li>
					<li>
						<strong>To personalise and improve the Service</strong>{" "}
						– such as understanding which features are used most,
						testing new functionality, and adjusting the UI.
						<br />
						<span className="text-xs text-foreground/70">
							Lawful basis: legitimate interests.
						</span>
					</li>
					<li>
						<strong>To communicate with you</strong> – for example,
						sending service announcements, responding to support
						requests, and informing you about changes to our terms
						or policies.
						<br />
						<span className="text-xs text-foreground/70">
							Lawful basis: performance of a contract; legitimate
							interests; legal obligations.
						</span>
					</li>
					<li>
						<strong>
							To send optional updates or product news
						</strong>{" "}
						– where you have signed up to receive them or where
						local law allows us to do so.
						<br />
						<span className="text-xs text-foreground/70">
							Lawful basis: consent (or legitimate interests,
							where permitted).
						</span>
					</li>
					<li>
						<strong>
							To prevent abuse, enforce our Terms, and protect the
							Service
						</strong>{" "}
						– for example by monitoring high-risk patterns of usage,
						rate limit bypass attempts, or fraud.
						<br />
						<span className="text-xs text-foreground/70">
							Lawful basis: legitimate interests; legal
							obligations.
						</span>
					</li>
					<li>
						<strong>To comply with legal obligations</strong> – such
						as keeping records for tax, accounting, or responding to
						legitimate requests from authorities.
						<br />
						<span className="text-xs text-foreground/70">
							Lawful basis: legal obligations.
						</span>
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					We may also create aggregated, anonymised statistics about
					model adoption, benchmark results, or API performance. These
					statistics do not identify individual users.
				</p>
			</section>

			<section aria-labelledby="privacy-sharing">
				<h2
					id="privacy-sharing"
					className="text-xl font-semibold text-foreground/90"
				>
					4. How we share personal data
				</h2>
				<p className="mt-2 text-foreground/80">
					We do <span className="font-medium">not</span> sell your
					personal data. We may share personal data in the following
					limited situations:
				</p>
				<ul className="mt-2 list-disc space-y-2 pl-5 text-foreground/80">
					<li>
						<strong>Service providers</strong> – We use trusted
						third parties to help us operate the Service (for
						example, hosting providers, database providers such as
						Supabase, analytics platforms, payment processors such
						as Stripe, email providers, and customer support tools).
						They may access personal data only to perform services
						for us and are contractually required to protect it.
					</li>
					<li>
						<strong>Third-party model providers</strong> – When you
						send requests through the Gateway, we share your Inputs
						and necessary metadata with the model provider(s) you
						choose or that we route to. Those providers process the
						data under their own terms and privacy policies.
					</li>
					<li>
						<strong>Public data you choose to share</strong> – If
						you opt into public usage pages, share integrations, or
						otherwise choose to publish certain information via AI
						Stats, we will display that information according to
						your settings.
					</li>
					<li>
						<strong>Legal and safety reasons</strong> – We may
						disclose data if we reasonably believe it is necessary
						to comply with a law, court order, or other legal
						request, or to protect the rights, property or safety of
						ourselves, our users, or others.
					</li>
					<li>
						<strong>Business transfers</strong> – If we explore or
						undertake a merger, acquisition, reorganisation or sale
						of assets, personal data may be transferred as part of
						that process. We will take reasonable steps to ensure
						the recipient continues to protect your data in line
						with this Policy.
					</li>
					<li>
						<strong>With your consent</strong> – We may share your
						information for other purposes if you explicitly ask us
						to or consent to it.
					</li>
				</ul>
			</section>

			<section aria-labelledby="privacy-international">
				<h2
					id="privacy-international"
					className="text-xl font-semibold text-foreground/90"
				>
					5. International transfers
				</h2>
				<p className="mt-2 text-foreground/80">
					We are based in the United Kingdom, but we use service
					providers and infrastructure located in other countries (for
					example, within the European Economic Area and the United
					States). This means your personal data may be transferred to
					and processed in countries that may have different data
					protection laws to those in your home jurisdiction.
				</p>
				<p className="mt-2 text-foreground/80">
					Where we transfer personal data outside of the UK or EEA, we
					take steps to ensure an appropriate level of protection,
					such as relying on:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						countries that the UK or EU has deemed
						&quot;adequate&quot;;
					</li>
					<li>
						standard contractual clauses or equivalent safeguards
						approved by the UK/EU; or
					</li>
					<li>
						other lawful transfer mechanisms as they become
						available.
					</li>
				</ul>
			</section>

			<section aria-labelledby="privacy-retention">
				<h2
					id="privacy-retention"
					className="text-xl font-semibold text-foreground/90"
				>
					6. How long we keep your data
				</h2>
				<p className="mt-2 text-foreground/80">
					We retain personal data for as long as reasonably necessary
					to fulfil the purposes described in this Policy, including:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						to operate and maintain your account and any paid
						features;
					</li>
					<li>
						to comply with our legal and regulatory obligations (for
						example, record-keeping for tax and accounting); and
					</li>
					<li>to resolve disputes and enforce our agreements.</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					When we no longer need personal data, we will either delete
					it or irreversibly anonymise it. Telemetry that has been
					aggregated and fully anonymised may be kept for longer for
					statistical purposes.
				</p>
			</section>

			<section aria-labelledby="privacy-rights">
				<h2
					id="privacy-rights"
					className="text-xl font-semibold text-foreground/90"
				>
					7. Your rights and choices
				</h2>
				<p className="mt-2 text-foreground/80">
					Depending on where you live, you may have certain rights in
					relation to your personal data. Subject to limits and
					exceptions under applicable law, these may include:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						<strong>Access</strong> – to ask whether we process your
						personal data and to request a copy.
					</li>
					<li>
						<strong>Correction</strong> – to ask us to correct
						inaccurate or incomplete personal data.
					</li>
					<li>
						<strong>Deletion</strong> – to request that we delete
						certain personal data.
					</li>
					<li>
						<strong>Restriction</strong> – to ask us to restrict how
						we process your data in certain circumstances.
					</li>
					<li>
						<strong>Portability</strong> – to receive your personal
						data in a structured, commonly used, machine-readable
						format and (where technically feasible) to have it
						transmitted to another controller.
					</li>
					<li>
						<strong>Objection</strong> – to object to certain types
						of processing, including direct marketing or processing
						based on legitimate interests.
					</li>
					<li>
						<strong>Withdraw consent</strong> – where we rely on
						consent, you can withdraw it at any time without
						affecting the lawfulness of processing before
						withdrawal.
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					You can exercise many of these rights by logging into your
					account (settings, profile and API keys), or by contacting
					us at{" "}
					<a
						href="mailto:privacy@phaseo.app"
						className="text-primary underline"
					>
						privacy@phaseo.app
					</a>
					. We may ask you to verify your identity before responding
					to a request.
				</p>
				<p className="mt-2 text-foreground/80">
					You can opt out of non-essential emails by using the
					unsubscribe link in the message or by contacting us. We may
					still send you administrative messages about your account or
					important changes to the Service.
				</p>
			</section>

			<section aria-labelledby="privacy-children">
				<h2
					id="privacy-children"
					className="text-xl font-semibold text-foreground/90"
				>
					8. Children
				</h2>
				<p className="mt-2 text-foreground/80">
					The Service is intended for users aged{" "}
					<span className="font-medium">13 and over</span>. We do not
					knowingly collect personal data from children under 13. If
					you believe a child has provided us with personal data
					without appropriate consent, please contact us and we will
					take steps to delete that information.
				</p>
			</section>

			<section aria-labelledby="privacy-security">
				<h2
					id="privacy-security"
					className="text-xl font-semibold text-foreground/90"
				>
					9. How we protect your data
				</h2>
				<p className="mt-2 text-foreground/80">
					We use a combination of technical, organisational and
					administrative security measures to protect personal data,
					including encryption in transit, role-based access controls,
					and monitoring for unusual activity.
				</p>
				<p className="mt-2 text-foreground/80">
					However, no online service can be completely secure. You are
					responsible for keeping your password, API keys and other
					credentials confidential, and for rotating keys if you
					suspect compromise. If you believe your account has been
					compromised, please contact us immediately at{" "}
					<a
						href="mailto:support@phaseo.app"
						className="text-primary underline"
					>
						support@phaseo.app
					</a>
					.
				</p>
			</section>

			<section aria-labelledby="privacy-third-parties">
				<h2
					id="privacy-third-parties"
					className="text-xl font-semibold text-foreground/90"
				>
					10. Third-party sites and services
				</h2>
				<p className="mt-2 text-foreground/80">
					The Service may contain links to third-party websites or
					integrations, including providers of AI models,
					documentation, payments, analytics and developer tools. We
					are not responsible for the privacy practices of those third
					parties. We recommend you review their privacy policies
					before providing personal data to them.
				</p>
			</section>

			<section aria-labelledby="privacy-changes">
				<h2
					id="privacy-changes"
					className="text-xl font-semibold text-foreground/90"
				>
					11. Changes to this Privacy Policy
				</h2>
				<p className="mt-2 text-foreground/80">
					We may update this Privacy Policy from time to time. If we
					make changes that materially affect your rights or how we
					use personal data, we will take reasonable steps to notify
					you (for example by email, a notice on the site, or in-app
					messages).
				</p>
				<p className="mt-2 text-foreground/80">
					Your continued use of the Service after any changes take
					effect will mean you accept the updated Policy.
				</p>
			</section>

			<section aria-labelledby="privacy-contact">
				<h2
					id="privacy-contact"
					className="text-xl font-semibold text-foreground/90"
				>
					12. Contact and complaints
				</h2>
				<p className="mt-2 text-foreground/80">
					If you have any questions about this Privacy Policy or how
					we handle personal data, you can contact us at:
				</p>
				<ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/80">
					<li>
						Email:{" "}
						<a
							href="mailto:privacy@phaseo.app"
							className="text-primary underline"
						>
							privacy@phaseo.app
						</a>
					</li>
					<li>
						Support:{" "}
						<a
							href="mailto:support@phaseo.app"
							className="text-primary underline"
						>
							support@phaseo.app
						</a>
					</li>
				</ul>
				<p className="mt-2 text-foreground/80">
					If you are in the UK, you also have the right to lodge a
					complaint with the Information Commissioner&apos;s Office
					(ICO) or with your local data protection authority if you
					are in the EU. We would, however, appreciate the chance to
					address your concerns first, so please consider contacting
					us in the first instance.
				</p>
			</section>
		</main>
	);
}
