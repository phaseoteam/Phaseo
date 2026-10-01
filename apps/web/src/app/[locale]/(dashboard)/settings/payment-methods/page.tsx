import { Suspense } from "react";
import { connection } from "next/server";
import { StripePortalButton } from "./StripePortalButton";
import { PaymentMethodsManager } from "./PaymentMethodsManager";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { fetchSettingsPaymentMethodsInitialData } from "@/lib/fetchers/internal/fetchSettingsPaymentMethodsInitialData";
import { getPaymentMethodsMessages } from "@/i18n/payment-methods";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const publicLocale = (isPublicLocale(locale) ? locale : "en-GB") as PublicLocale;
	const [messages, t] = await Promise.all([
		Promise.resolve(getPaymentMethodsMessages(publicLocale)),
		getTranslations({ locale: publicLocale, namespace: "SettingsUI" }),
	]);
	return { title: `${messages.title} - ${t("headers.settings" as never)}` };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const messages = getPaymentMethodsMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
		<h1 className="text-2xl font-bold">{messages.title}</h1>
        <p className="text-sm text-muted-foreground">
			{messages.description}
        </p>
      </div>
      <Suspense fallback={<SettingsSectionFallback />}>
		<PaymentMethodsContent messages={messages} />
      </Suspense>
    </div>
  );
}

async function PaymentMethodsContent({ messages }: { messages: ReturnType<typeof getPaymentMethodsMessages> }) {
	await connection();
  const { customerId, initialData, obfuscateInfo } =
    await fetchSettingsPaymentMethodsInitialData();

  return (
    <div
      data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
      data-obfuscation-sync="true"
    >
      {!customerId ? (
        <p className="py-3 text-sm text-muted-foreground">
			{messages.noCustomer}
        </p>
      ) : (
        <PaymentMethodsManager
          initialData={initialData}
			customerPortal={<StripePortalButton customerId={customerId} label={messages.portal} />}
        />
      )}
    </div>
  );
}
