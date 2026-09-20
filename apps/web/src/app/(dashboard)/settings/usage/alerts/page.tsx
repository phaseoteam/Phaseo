import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import UsageAlertsClient from "./UsageAlertsClient";
export const metadata = { title: "Lifecycle Alerts - Settings" };
export default async function Page() { return <UsageAlertsClient scope={await getPrivateUsageScope()} />; }
