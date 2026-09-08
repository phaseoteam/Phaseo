<?php
declare(strict_types=1);

namespace Phaseo\Gen;

function addGuardrailKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? "")) . "/keys/add";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function addGuardrailMembers(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? "")) . "/members/add";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function addWorkspaceMembers(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/members/add";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function applyPresetUpstreamVersion(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/" . rawurlencode((string)($path["id"] ?? "")) . "/upstream";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function approveWorkspaceJoinRequest(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/join-requests/" . rawurlencode((string)($path["request_id"] ?? "")) . "/approve";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function calculatePricing(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/pricing/calculate";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function cancelBatch(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/" . rawurlencode((string)($path["batch_id"] ?? "")) . "/cancel";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function cancelBatchAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/" . rawurlencode((string)($path["id"] ?? "")) . "/cancel";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function cancelVideo(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/" . rawurlencode((string)($path["video_id"] ?? "")) . "/cancel";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function cancelVideoAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/" . rawurlencode((string)($path["video_id"] ?? "")) . "/cancel";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createAnthropicMessage(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/messages";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createApiKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createBatch(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createBatchAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createChatCompletion(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/chat/completions";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createDataContributionClassifier(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/data-contribution/classifiers";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createDynamicRoute(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/routing/dynamic-routes";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createEmbedding(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/embeddings";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createGatewayFeedback(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/feedback";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createGatewayObservabilityEvent(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/events";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createGuardrail(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createImage(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/images/generations";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createImageEdit(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/images/edits";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createManagementKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management-keys";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createModeration(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/moderations";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createOAuthClient(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createObservabilityDestination(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/observability/destinations";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createOcr(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/ocr";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createParse(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/parse";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createPreset(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createPresetTestRun(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/preset-test-runs";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createPrivateModel(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/private-models";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createProviderCredential(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/byok";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createRealtimeSession(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/audio/realtime/sessions";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createRerank(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/rerank";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createResponse(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/responses";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createSpeech(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/audio/speech";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createTranscription(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/audio/transcriptions";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createTranslation(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/audio/translations";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createVideo(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createVideoAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createVideoDownloadUrl(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/" . rawurlencode((string)($path["video_id"] ?? "")) . "/download_url";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createVideoDownloadUrlAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/" . rawurlencode((string)($path["video_id"] ?? "")) . "/download_url";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createWebhookEndpoint(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/webhook-endpoints";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createWorkspace(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createWorkspaceBudget(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/budgets";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createWorkspaceDepartment(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/departments";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createWorkspaceGroupMapping(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/group-mappings";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createWorkspaceInvite(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/invites";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createWorkspaceNotificationDestination(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/destinations";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createWorkspaceScimToken(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/scim/tokens";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function deleteApiKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteDataContributionClassifier(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/data-contribution/classifiers/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteDynamicRoute(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/routing/dynamic-routes/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteGuardrail(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteManagementKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management-keys/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteOAuthClient(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients/" . rawurlencode((string)($path["client_id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteObservabilityDestination(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/observability/destinations/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deletePreset(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deletePrivateModel(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/private-models/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteProviderCredential(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/byok/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteVideo(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/" . rawurlencode((string)($path["video_id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteVideoAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/" . rawurlencode((string)($path["video_id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteWebhookEndpoint(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/webhook-endpoints/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteWorkspace(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteWorkspaceBudget(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/budgets/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteWorkspaceDepartment(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/departments/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteWorkspaceDepartmentMember(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/departments/" . rawurlencode((string)($path["departmentId"] ?? "")) . "/members/" . rawurlencode((string)($path["userId"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteWorkspaceGroupMapping(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/group-mappings/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteWorkspaceInvite(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/invites/" . rawurlencode((string)($path["invite_id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteWorkspaceNotificationDestination(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/destinations/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deployDynamicRouteVersion(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/routing/dynamic-routes/" . rawurlencode((string)($path["id"] ?? "")) . "/versions/" . rawurlencode((string)($path["version"] ?? "")) . "/deploy";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function exportAnalyticsCsv(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/analytics/export";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function finalizeRealtimeSession(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/audio/realtime/sessions/" . rawurlencode((string)($path["session_id"] ?? "")) . "/finalize";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function forkPreset(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/" . rawurlencode((string)($path["id"] ?? "")) . "/fork";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function generateMusic(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/music/generate";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function generateMusicAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/music/generations";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function getActivity(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/activity";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getActivityAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/analytics";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getApiKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getCredits(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/credits";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getCurrentApiKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/key";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getDataContributionSettings(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/data-contribution";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getDynamicRoute(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/routing/dynamic-routes/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getGatewayRequestLog(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/logs/" . rawurlencode((string)($path["requestId"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getGeneration(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/generations";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getGuardrail(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getHealth(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/health";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getManagementKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management-keys/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getMusicGeneration(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/music/generate/" . rawurlencode((string)($path["music_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getMusicGenerationAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/music/generations/" . rawurlencode((string)($path["music_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getOAuthClient(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients/" . rawurlencode((string)($path["client_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getObservabilityDestination(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/observability/destinations/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getObservabilityLoggingPolicy(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/observability/logging-policy";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getPreset(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getPresetPublisher(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/publisher";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getPresetTestRun(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/preset-test-runs/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getPrivateModel(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/private-models/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getProviderCredential(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/byok/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getProviderDerankStatus(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/health/providers/" . rawurlencode((string)($path["provider_id"] ?? "")) . "/derank";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideo(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/" . rawurlencode((string)($path["video_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideoAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/" . rawurlencode((string)($path["video_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideoContent(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/" . rawurlencode((string)($path["video_id"] ?? "")) . "/content";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideoContentAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/" . rawurlencode((string)($path["video_id"] ?? "")) . "/content";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getWebhookEndpoint(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/webhook-endpoints/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getWorkspace(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getWorkspaceBudget(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/budgets/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getWorkspaceDirectory(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/directory";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getWorkspaceNotificationSettings(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/settings";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getWorkspaceScim(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/scim";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getWorkspaceSettings(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/settings";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getWorkspaceSso(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/sso";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function invalidateApiKeyCache(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys/" . rawurlencode((string)($path["id"] ?? "")) . "/invalidate";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function listApiKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchCapabilities(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/capabilities";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchCapabilitiesAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/capabilities";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatches(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchesAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchFiles(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/files";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchFilesAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/files";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchModels(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchModelsAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchRequests(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/" . rawurlencode((string)($path["batch_id"] ?? "")) . "/requests";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listBatchRequestsAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/" . rawurlencode((string)($path["id"] ?? "")) . "/requests";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listDataModels(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/data/models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listDynamicRoutes(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/routing/dynamic-routes";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listEndpoints(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/endpoints";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listFiles(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/files";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listGatewayFeedback(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/feedback";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listGatewayObservabilityEvents(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/events";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listGatewayRequestLogs(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/logs";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listGuardrailKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? "")) . "/keys";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listGuardrailMembers(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? "")) . "/members";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listGuardrails(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listManagementKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management-keys";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listModelEndpoints(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/models/" . rawurlencode((string)($path["author"] ?? "")) . "/" . rawurlencode((string)($path["slug"] ?? "")) . "/endpoints";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listModels(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listOAuthClients(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listObservabilityDestinations(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/observability/destinations";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listOrganisations(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/organisations";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listPresets(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listPresetTestRuns(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/preset-test-runs";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listPresetVersions(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/" . rawurlencode((string)($path["id"] ?? "")) . "/versions";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listPricingModels(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/pricing/models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listPrivateModels(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/private-models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listProviderCredentials(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/byok";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listProviders(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/providers";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listTeamModels(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/models/me";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listVideoModels(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listVideoModelsAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listVideos(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listVideosAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWebhookEndpoints(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/webhook-endpoints";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceApps(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/apps";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceAuditEvents(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/audit-events";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceBudgets(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/budgets";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceDepartments(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/departments";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceGroupMappings(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/group-mappings";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceInvites(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/invites";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceJoinRequests(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/join-requests";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceMembers(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/members";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceNotificationDestinations(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/destinations";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceNotificationRoutes(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/routes";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaces(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listWorkspaceScimAuditEvents(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/scim/audit";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function mergeWorkspaceApp(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/apps/" . rawurlencode((string)($path["id"] ?? "")) . "/merge";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function publishPresetVersion(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/" . rawurlencode((string)($path["id"] ?? "")) . "/versions";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function regenerateOAuthClientSecret(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients/" . rawurlencode((string)($path["client_id"] ?? "")) . "/regenerate-secret";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function rejectWorkspaceJoinRequest(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/join-requests/" . rawurlencode((string)($path["request_id"] ?? "")) . "/reject";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function removeGuardrailKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? "")) . "/keys/remove";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function removeGuardrailMembers(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? "")) . "/members/remove";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function removeWorkspaceMembers(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/members/remove";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function reorderProviderCredentials(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/byok/reorder";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function replaceDynamicRouteKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/routing/dynamic-routes/" . rawurlencode((string)($path["id"] ?? "")) . "/keys";
	return $client->request("PUT", $resolvedPath, $query, $headers, $body);
}

function replaceGuardrailKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? "")) . "/keys";
	return $client->request("PUT", $resolvedPath, $query, $headers, $body);
}

function retrieveBatch(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/" . rawurlencode((string)($path["batch_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatchAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatchFile(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/files/" . rawurlencode((string)($path["file_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatchFileAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/files/" . rawurlencode((string)($path["file_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatchFileContent(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/files/" . rawurlencode((string)($path["file_id"] ?? "")) . "/content";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatchFileContentAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/files/" . rawurlencode((string)($path["file_id"] ?? "")) . "/content";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatchResults(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/" . rawurlencode((string)($path["batch_id"] ?? "")) . "/results";
	return $client->requestRaw("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatchResultsAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/" . rawurlencode((string)($path["id"] ?? "")) . "/results";
	return $client->requestRaw("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveFile(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/files/" . rawurlencode((string)($path["file_id"] ?? ""));
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveFileContent(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/files/" . rawurlencode((string)($path["file_id"] ?? "")) . "/content";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function revokeWorkspaceScimToken(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/scim/tokens/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function rotateApiKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys/" . rawurlencode((string)($path["id"] ?? "")) . "/rotate";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function rotateWebhookEndpointSecret(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/webhook-endpoints/" . rawurlencode((string)($path["id"] ?? "")) . "/rotate-secret";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function setWorkspaceDepartmentMember(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/departments/" . rawurlencode((string)($path["departmentId"] ?? "")) . "/members/" . rawurlencode((string)($path["userId"] ?? ""));
	return $client->request("PUT", $resolvedPath, $query, $headers, $body);
}

function summarizeGatewayFeedback(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/feedback/summary";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function testWorkspaceNotificationDestination(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/destinations/" . rawurlencode((string)($path["id"] ?? "")) . "/test";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function testWorkspaceNotificationDestinationConfig(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/destinations/test";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function updateApiKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateDataContributionClassifier(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/data-contribution/classifiers/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateDataContributionConsent(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/data-contribution/consent";
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateDynamicRoute(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/routing/dynamic-routes/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateGuardrail(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/guardrails/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateManagementKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management-keys/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateOAuthClient(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients/" . rawurlencode((string)($path["client_id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateObservabilityDestination(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/observability/destinations/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateObservabilityLoggingPolicy(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/observability/logging-policy";
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updatePreset(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updatePresetPublisher(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/presets/publisher";
	return $client->request("PUT", $resolvedPath, $query, $headers, $body);
}

function updatePresetTestRun(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/preset-test-runs/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updatePrivateModel(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/private-models/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateProviderCredential(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/byok/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWebhookEndpoint(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/webhook-endpoints/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspace(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceApp(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/apps/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceBudget(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/budgets/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceDepartment(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/departments/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceDirectoryMember(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/directory/members/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PUT", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceGroupMapping(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/group-mappings/" . rawurlencode((string)($path["id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceMemberRole(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/workspaces/" . rawurlencode((string)($path["id"] ?? "")) . "/members/" . rawurlencode((string)($path["user_id"] ?? ""));
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceNotificationRoute(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/routes/" . rawurlencode((string)($path["eventKind"] ?? ""));
	return $client->request("PUT", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceNotificationSettings(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/notifications/settings";
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceScim(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/scim";
	return $client->request("PUT", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceSettings(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/settings";
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateWorkspaceSso(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/identity/sso";
	return $client->request("PUT", $resolvedPath, $query, $headers, $body);
}

function uploadBatchFile(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/files";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function uploadBatchFileAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/files";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function uploadFile(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/files";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}
