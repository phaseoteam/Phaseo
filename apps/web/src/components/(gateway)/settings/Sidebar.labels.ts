import type { SettingsMessages } from "@/i18n/settings";

export const SETTINGS_LABEL_KEYS = {
    Settings: "settings", Account: "account", Workspace: "workspace", Profile: "profile", Details: "details", MFA: "mfa",
    "Provider onboarding": "providerOnboarding", "Connected Apps": "connectedApps", "Danger Zone": "dangerZone",
    Workspaces: "workspaces", Billing: "billing", Credits: "credits", Transactions: "transactions", "Payment Methods": "paymentMethods",
    "Feature Preview": "featurePreview", General: "settings", Members: "members", Access: "access", Notifications: "notifications",
    Guardrails: "guardrails", Enterprise: "enterprise", Overview: "overview", Directory: "directory", Departments: "departments",
    "Single Sign-On": "singleSignOn", SCIM: "scim", Privacy: "privacy", Usage: "usage", Trends: "trends", Explore: "explore",
    Geography: "geography", "Guardrail Activity": "guardrailActivity", Alerts: "alerts", Logs: "logs", Requests: "requests",
    "Upstream Requests": "upstreamRequests", Sessions: "sessions", Videos: "videos", Batches: "batches", "API Keys": "apiKeys",
    "Management Keys": "managementKeys", Broadcast: "broadcast", Apps: "apps", Routing: "routing", "Auto routing": "autoRouting",
    "Dynamic Routes": "dynamicRoutes", "Bring Your Own Key": "bringYourOwnKey", Presets: "presets", Feedback: "feedback",
    "OAuth Apps": "oauthApps", Webhooks: "webhooks", "Provider review": "providerReview",
} as const;

export const SETTINGS_NEW_LABEL_KEYS = {
    Preferences: "preferences", "Billing & Credits": "billingCredits", Activity: "activity", "Realtime Sessions": "realtimeSessions",
    "Private Models": "privateModels", "Discovery queue": "discoveryQueue", "Your Models": "yourModels",
    "Provider Review": "providerReview", Integrations: "integrations", Provider: "provider",
} as const;

export type SettingsNavigationCopy = {
    labels: Record<string, string>;
    headings: Record<string, string>;
    badges: Record<string, string>;
};

/** Small serializable copy for the header sheet; catalogs stay on the server. */
export function getSettingsNavigationCopy(settings: SettingsMessages, newLabels: Record<string, string>): SettingsNavigationCopy {
    const labels: Record<string, string> = {};
    for (const [label, key] of Object.entries(SETTINGS_LABEL_KEYS)) {
        labels[label] = key === "workspace" ? settings.sidebar.scope.workspace : settings.sidebar.items[key];
    }
    for (const [label, key] of Object.entries(SETTINGS_NEW_LABEL_KEYS)) {
        if (!newLabels[key]) throw new Error(`Missing settings navigation label: ${key}`);
        labels[label] = newLabels[key];
    }
    return {
        labels,
        headings: {
            General: settings.sidebar.headings.general, Workspace: settings.sidebar.headings.workspace,
            Observe: settings.sidebar.headings.observe, Gateway: settings.sidebar.headings.gateway,
            Developer: settings.sidebar.headings.developer, Internal: settings.sidebar.headings.internal,
        },
        badges: { Beta: settings.common.beta, Alpha: settings.common.alpha, Preview: settings.common.preview },
    };
}
