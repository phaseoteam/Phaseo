// src/routes/v1/control/index.ts
// Purpose: Platform API route handler for management and discovery operations.
// Why: Separates product/platform traffic from inference requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.
import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { modelsRoutes } from "./models";
import { generationsRoutes } from "./generations";
import { placeholdersRoutes } from "./placeholders";
import { healthRoutes } from "./health";
import { analyticsRoutes } from "./analytics";
import { pricingRoutes } from "./pricing";
import { organisationsRoutes } from "./organisations";
import { providersRoutes } from "./providers";
import { activityRoutes, creditsRoutes } from "./credits";
import { logsRoutes } from "./logs";
import { currentKeyRoutes, keysRoutes } from "./keys";
import { securityRoutes } from "./security";
import { workspacesRoutes } from "./workspaces";
import { workspaceMembershipRoutes } from "./workspace-membership";
import oauthClientsRoutes from "./oauth-clients";
import webhookEndpointsRoutes from "./webhook-endpoints";
import { meRoutes } from "./me";
import { meAccountRoutes } from "./me-account";
import { invitesRoutes } from "./invites";
import { presetsRoutes } from "./presets";
import { settingsRoutes } from "./settings";
import { guardrailsRoutes } from "./guardrails";
import { managementKeysRoutes } from "./management-keys";
import { dataContributionRoutes } from "./data-contribution";
import { auditEventsRoutes } from "./audit-events";
import { observabilityRoutes } from "./observability";
import { observabilityTestRoutes } from "./observability-tests";
import { routingRoutes } from "./routing";
import { identityRoutes } from "./identity";
import { enterpriseDirectoryRoutes } from "./enterprise-directory";
import { notificationRoutes } from "./notifications";
import { appRoutes } from "./apps";
import { providerCredentialsRoutes } from "./provider-credentials";
import { budgetsRoutes } from "./budgets";
import { departmentBudgetsRoutes } from "./department-budgets";
import { rateLimitsRoutes } from "./rate-limits";
import { workloadIdentityRoutes } from "./workload-identity";
import { spendRulesRoutes } from "./spend-rules";
import { spendBlocksRoutes } from "./spend-blocks";
import { classifiersRoutes } from "./classifiers";
import { classifierTestRoutes } from "./classifier-test";
import { privateModelsRoutes } from "./private-models";
import {
	feedbackRoutes,
	observabilityEventsRoutes,
	presetTestRunsRoutes,
} from "./feedback";

export const platformRouter = new Hono<Env>();

platformRouter.route("/models", modelsRoutes);
platformRouter.route("/generations", generationsRoutes);
platformRouter.route("/organisations", organisationsRoutes);
platformRouter.route("/providers", providersRoutes);
platformRouter.route("/health", healthRoutes);
platformRouter.route("/analytics", analyticsRoutes);
platformRouter.route("/pricing", pricingRoutes);
platformRouter.route("/credits", creditsRoutes);
platformRouter.route("/activity", activityRoutes);
platformRouter.route("/audit-events", auditEventsRoutes);
platformRouter.route("/observability", observabilityRoutes);
platformRouter.route("/observability", observabilityTestRoutes);
platformRouter.route("/routing", routingRoutes);
platformRouter.route("/logs", logsRoutes);
platformRouter.route("/security", securityRoutes);
platformRouter.route("/key", currentKeyRoutes);
platformRouter.route("/keys", keysRoutes);
platformRouter.route("/workspaces", workspacesRoutes);
platformRouter.route("/workspaces", workspaceMembershipRoutes);
platformRouter.route("/invites", invitesRoutes);
platformRouter.route("/oauth-clients", oauthClientsRoutes);
platformRouter.route("/webhook-endpoints", webhookEndpointsRoutes);
platformRouter.route("/presets", presetsRoutes);
platformRouter.route("/feedback", feedbackRoutes);
platformRouter.route("/events", observabilityEventsRoutes);
platformRouter.route("/preset-test-runs", presetTestRunsRoutes);
platformRouter.route("/settings", settingsRoutes);
platformRouter.route("/guardrails", guardrailsRoutes);
platformRouter.route("/management-keys", managementKeysRoutes);
platformRouter.route("/data-contribution", dataContributionRoutes);
platformRouter.route("/identity", identityRoutes);
platformRouter.route("/identity", enterpriseDirectoryRoutes);
platformRouter.route("/notifications", notificationRoutes);
platformRouter.route("/apps", appRoutes);
platformRouter.route("/byok", providerCredentialsRoutes);
platformRouter.route("/budgets", budgetsRoutes);
platformRouter.route("/department-budgets", departmentBudgetsRoutes);
platformRouter.route("/rate-limits", rateLimitsRoutes);
platformRouter.route("/workload-identity", workloadIdentityRoutes);
platformRouter.route("/spend-rules", spendRulesRoutes);
platformRouter.route("/spend-blocks", spendBlocksRoutes);
platformRouter.route("/classifiers", classifierTestRoutes);
platformRouter.route("/classifiers", classifiersRoutes);
platformRouter.route("/private-models", privateModelsRoutes);
platformRouter.route("/me", meRoutes);
platformRouter.route("/me", meAccountRoutes);
platformRouter.route("/", placeholdersRoutes);

// Backward-compatible alias for existing imports.
export const controlRouter = platformRouter;
