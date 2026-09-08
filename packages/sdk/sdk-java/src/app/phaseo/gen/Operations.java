package app.phaseo.gen;

import java.io.IOException;
import java.util.Map;

public final class Operations {
	private Operations() {}

	public static Object addGuardrailKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/keys/add";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object addGuardrailMembers(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/members/add";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object addWorkspaceMembers(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/members/add";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object applyPresetUpstreamVersion(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/upstream";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object approveWorkspaceJoinRequest(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/join-requests/" + (path != null && path.containsKey("request_id") ? path.get("request_id") : "") + "/approve";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object calculatePricing(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/pricing/calculate";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object cancelBatch(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/" + (path != null && path.containsKey("batch_id") ? path.get("batch_id") : "") + "/cancel";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object cancelBatchAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/cancel";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object cancelVideo(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/cancel";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object cancelVideoAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/cancel";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createAnthropicMessage(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/messages";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createBatch(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createBatchAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createChatCompletion(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/chat/completions";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createDataContributionClassifier(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/data-contribution/classifiers";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createDynamicRoute(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/routing/dynamic-routes";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createEmbedding(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/embeddings";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createGatewayFeedback(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/feedback";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createGatewayObservabilityEvent(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/events";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createGuardrail(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createImage(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/images/generations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createImageEdit(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/images/edits";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createManagementKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management-keys";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createModeration(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/moderations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createOAuthClient(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createObservabilityDestination(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/observability/destinations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createOcr(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/ocr";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createParse(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/parse";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createPreset(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createPresetTestRun(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/preset-test-runs";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createPrivateModel(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/private-models";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createProviderCredential(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/byok";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createRealtimeSession(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audio/realtime/sessions";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createRerank(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/rerank";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createResponse(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/responses";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createSpeech(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audio/speech";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createTranscription(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audio/transcriptions";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createTranslation(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audio/translations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createVideo(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createVideoAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createVideoDownloadUrl(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/download_url";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createVideoDownloadUrlAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/download_url";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWebhookEndpoint(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWorkspace(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWorkspaceBudget(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/budgets";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWorkspaceDepartment(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/departments";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWorkspaceGroupMapping(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/group-mappings";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWorkspaceInvite(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/invites";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWorkspaceNotificationDestination(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/destinations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object createWorkspaceScimToken(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/scim/tokens";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object deleteApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteDataContributionClassifier(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/data-contribution/classifiers/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteDynamicRoute(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/routing/dynamic-routes/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteGuardrail(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteManagementKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management-keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteOAuthClient(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients/" + (path != null && path.containsKey("client_id") ? path.get("client_id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteObservabilityDestination(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/observability/destinations/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deletePreset(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deletePrivateModel(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/private-models/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteProviderCredential(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/byok/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteVideo(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteVideoAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWebhookEndpoint(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWorkspace(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWorkspaceBudget(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/budgets/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWorkspaceDepartment(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/departments/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWorkspaceDepartmentMember(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/departments/" + (path != null && path.containsKey("departmentId") ? path.get("departmentId") : "") + "/members/" + (path != null && path.containsKey("userId") ? path.get("userId") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWorkspaceGroupMapping(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/group-mappings/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWorkspaceInvite(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/invites/" + (path != null && path.containsKey("invite_id") ? path.get("invite_id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deleteWorkspaceNotificationDestination(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/destinations/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object deployDynamicRouteVersion(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/routing/dynamic-routes/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/versions/" + (path != null && path.containsKey("version") ? path.get("version") : "") + "/deploy";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object exportAnalyticsCsv(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/analytics/export";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object finalizeRealtimeSession(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audio/realtime/sessions/" + (path != null && path.containsKey("session_id") ? path.get("session_id") : "") + "/finalize";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object forkPreset(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/fork";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object generateMusic(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/music/generate";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object generateMusicAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/music/generations";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object getActivity(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/activity";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getActivityAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/analytics";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getCredits(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/credits";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getCurrentApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/key";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getDataContributionSettings(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/data-contribution";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getDynamicRoute(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/routing/dynamic-routes/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getGatewayRequestLog(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/logs/" + (path != null && path.containsKey("requestId") ? path.get("requestId") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getGeneration(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/generations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getGuardrail(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getHealth(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/health";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getManagementKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management-keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getMusicGeneration(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/music/generate/" + (path != null && path.containsKey("music_id") ? path.get("music_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getMusicGenerationAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/music/generations/" + (path != null && path.containsKey("music_id") ? path.get("music_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getOAuthClient(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients/" + (path != null && path.containsKey("client_id") ? path.get("client_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getObservabilityDestination(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/observability/destinations/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getObservabilityLoggingPolicy(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/observability/logging-policy";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getPreset(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getPresetPublisher(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/publisher";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getPresetTestRun(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/preset-test-runs/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getPrivateModel(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/private-models/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getProviderCredential(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/byok/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getProviderDerankStatus(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/health/providers/" + (path != null && path.containsKey("provider_id") ? path.get("provider_id") : "") + "/derank";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getVideo(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getVideoAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getVideoContent(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getVideoContentAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/" + (path != null && path.containsKey("video_id") ? path.get("video_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWebhookEndpoint(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWorkspace(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWorkspaceBudget(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/budgets/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWorkspaceDirectory(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/directory";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWorkspaceNotificationSettings(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/settings";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWorkspaceScim(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/scim";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWorkspaceSettings(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/settings";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object getWorkspaceSso(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/sso";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object invalidateApiKeyCache(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/invalidate";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object listApiKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchCapabilities(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/capabilities";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchCapabilitiesAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/capabilities";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatches(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchesAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchFiles(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/files";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchFilesAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/files";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchModelsAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchRequests(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/" + (path != null && path.containsKey("batch_id") ? path.get("batch_id") : "") + "/requests";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listBatchRequestsAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/requests";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listDataModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/data/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listDynamicRoutes(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/routing/dynamic-routes";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listEndpoints(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/endpoints";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listFiles(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listGatewayFeedback(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/feedback";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listGatewayObservabilityEvents(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/events";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listGatewayRequestLogs(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/logs";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listGuardrailKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/keys";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listGuardrailMembers(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/members";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listGuardrails(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listManagementKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management-keys";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listModelEndpoints(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/models/" + (path != null && path.containsKey("author") ? path.get("author") : "") + "/" + (path != null && path.containsKey("slug") ? path.get("slug") : "") + "/endpoints";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listOAuthClients(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listObservabilityDestinations(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/observability/destinations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listOrganisations(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/organisations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listPresets(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listPresetTestRuns(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/preset-test-runs";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listPresetVersions(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/versions";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listPricingModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/pricing/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listPrivateModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/private-models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listProviderCredentials(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/byok";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listProviders(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/providers";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listTeamModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/models/me";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listVideoModels(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listVideoModelsAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations/models";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listVideos(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/videos";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listVideosAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/video/generations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWebhookEndpoints(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceApps(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/apps";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceAuditEvents(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/audit-events";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceBudgets(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/budgets";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceDepartments(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/departments";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceGroupMappings(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/group-mappings";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceInvites(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/invites";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceJoinRequests(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/join-requests";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceMembers(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/members";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceNotificationDestinations(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/destinations";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceNotificationRoutes(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/routes";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaces(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object listWorkspaceScimAuditEvents(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/scim/audit";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object mergeWorkspaceApp(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/apps/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/merge";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object publishPresetVersion(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/versions";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object regenerateOAuthClientSecret(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients/" + (path != null && path.containsKey("client_id") ? path.get("client_id") : "") + "/regenerate-secret";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object rejectWorkspaceJoinRequest(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/join-requests/" + (path != null && path.containsKey("request_id") ? path.get("request_id") : "") + "/reject";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object removeGuardrailKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/keys/remove";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object removeGuardrailMembers(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/members/remove";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object removeWorkspaceMembers(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/members/remove";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object reorderProviderCredentials(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/byok/reorder";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object replaceDynamicRouteKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/routing/dynamic-routes/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/keys";
		return client.request("PUT", resolvedPath, query, headers, body);
	}

	public static Object replaceGuardrailKeys(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/keys";
		return client.request("PUT", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatch(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/" + (path != null && path.containsKey("batch_id") ? path.get("batch_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchFileAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchFileContent(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchFileContentAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchResults(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/" + (path != null && path.containsKey("batch_id") ? path.get("batch_id") : "") + "/results";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveBatchResultsAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/results";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "");
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object retrieveFileContent(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files/" + (path != null && path.containsKey("file_id") ? path.get("file_id") : "") + "/content";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object revokeWorkspaceScimToken(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/scim/tokens/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("DELETE", resolvedPath, query, headers, body);
	}

	public static Object rotateApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/rotate";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object rotateWebhookEndpointSecret(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/rotate-secret";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object setWorkspaceDepartmentMember(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/departments/" + (path != null && path.containsKey("departmentId") ? path.get("departmentId") : "") + "/members/" + (path != null && path.containsKey("userId") ? path.get("userId") : "");
		return client.request("PUT", resolvedPath, query, headers, body);
	}

	public static Object summarizeGatewayFeedback(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/feedback/summary";
		return client.request("GET", resolvedPath, query, headers, body);
	}

	public static Object testWorkspaceNotificationDestination(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/destinations/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/test";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object testWorkspaceNotificationDestinationConfig(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/destinations/test";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object updateApiKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateDataContributionClassifier(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/data-contribution/classifiers/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateDataContributionConsent(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/data-contribution/consent";
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateDynamicRoute(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/routing/dynamic-routes/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateGuardrail(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/guardrails/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateManagementKey(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/management-keys/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateOAuthClient(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/oauth-clients/" + (path != null && path.containsKey("client_id") ? path.get("client_id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateObservabilityDestination(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/observability/destinations/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateObservabilityLoggingPolicy(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/observability/logging-policy";
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updatePreset(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updatePresetPublisher(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/presets/publisher";
		return client.request("PUT", resolvedPath, query, headers, body);
	}

	public static Object updatePresetTestRun(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/preset-test-runs/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updatePrivateModel(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/private-models/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateProviderCredential(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/byok/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWebhookEndpoint(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/webhook-endpoints/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspace(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceApp(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/apps/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceBudget(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/budgets/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceDepartment(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/departments/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceDirectoryMember(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/directory/members/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PUT", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceGroupMapping(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/group-mappings/" + (path != null && path.containsKey("id") ? path.get("id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceMemberRole(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/workspaces/" + (path != null && path.containsKey("id") ? path.get("id") : "") + "/members/" + (path != null && path.containsKey("user_id") ? path.get("user_id") : "");
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceNotificationRoute(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/routes/" + (path != null && path.containsKey("eventKind") ? path.get("eventKind") : "");
		return client.request("PUT", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceNotificationSettings(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/notifications/settings";
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceScim(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/scim";
		return client.request("PUT", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceSettings(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/settings";
		return client.request("PATCH", resolvedPath, query, headers, body);
	}

	public static Object updateWorkspaceSso(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/identity/sso";
		return client.request("PUT", resolvedPath, query, headers, body);
	}

	public static Object uploadBatchFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batches/files";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object uploadBatchFileAlias(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/batch/files";
		return client.request("POST", resolvedPath, query, headers, body);
	}

	public static Object uploadFile(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {
		String resolvedPath = "/files";
		return client.request("POST", resolvedPath, query, headers, body);
	}

}
