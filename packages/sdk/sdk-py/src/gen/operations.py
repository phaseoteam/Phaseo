from __future__ import annotations

from typing import Any, Dict, Optional
from .client import Client
from . import models

def addGuardrailKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailKeyAddResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}/keys/add"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def addGuardrailMembers(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailMemberAddResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}/members/add"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def addWorkspaceMembers(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceMemberAddResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/members/add"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def applyPresetUpstreamVersion(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetUpstreamApplyResponse:
	path = path or {}
	resolved_path = f"/presets/{path.get('id', '')}/upstream"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def approveWorkspaceJoinRequest(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceJoinRequestResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/join-requests/{path.get('request_id', '')}/approve"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def calculatePricing(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/pricing/calculate"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def cancelBatch(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchResponse:
	path = path or {}
	resolved_path = f"/batches/{path.get('batch_id', '')}/cancel"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def cancelBatchAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchResponse:
	path = path or {}
	resolved_path = f"/batch/{path.get('id', '')}/cancel"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def cancelVideo(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/videos/{path.get('video_id', '')}/cancel"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def cancelVideoAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/video/generations/{path.get('video_id', '')}/cancel"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createAnthropicMessage(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> AnthropicMessagesResponse:
	path = path or {}
	resolved_path = "/messages"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createApiKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ApiKeyWithValueResponse:
	path = path or {}
	resolved_path = "/keys"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createBatch(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchResponse:
	path = path or {}
	resolved_path = "/batches"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createBatchAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchResponse:
	path = path or {}
	resolved_path = "/batch"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createChatCompletion(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ChatCompletionsResponse:
	path = path or {}
	resolved_path = "/chat/completions"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createDataContributionClassifier(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DataContributionClassifierResponse:
	path = path or {}
	resolved_path = "/data-contribution/classifiers"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createDynamicRoute(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DynamicRouteResponse:
	path = path or {}
	resolved_path = "/routing/dynamic-routes"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createEmbedding(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> EmbeddingsResponse:
	path = path or {}
	resolved_path = "/embeddings"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createGatewayFeedback(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayFeedbackResponse:
	path = path or {}
	resolved_path = "/feedback"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createGatewayObservabilityEvent(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayObservabilityEventResponse:
	path = path or {}
	resolved_path = "/events"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createGuardrail(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailResponse:
	path = path or {}
	resolved_path = "/guardrails"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createImage(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/images/generations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createImageEdit(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ImagesEditResponse:
	path = path or {}
	resolved_path = "/images/edits"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createManagementKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ManagementKeyRuntimeCreateResponse:
	path = path or {}
	resolved_path = "/management-keys"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createModeration(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ModerationsResponse:
	path = path or {}
	resolved_path = "/moderations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createOAuthClient(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> OAuthClientCreateResponse:
	path = path or {}
	resolved_path = "/oauth-clients"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createObservabilityDestination(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ObservabilityDestinationResponse:
	path = path or {}
	resolved_path = "/observability/destinations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createOcr(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> OcrResponse:
	path = path or {}
	resolved_path = "/ocr"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createParse(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ParseResponse:
	path = path or {}
	resolved_path = "/parse"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createPreset(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetCreateResponse:
	path = path or {}
	resolved_path = "/presets"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createPresetTestRun(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetTestRunResponse:
	path = path or {}
	resolved_path = "/preset-test-runs"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createPrivateModel(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PrivateModelResponse:
	path = path or {}
	resolved_path = "/private-models"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createProviderCredential(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ProviderCredentialResponse:
	path = path or {}
	resolved_path = "/byok"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createRealtimeSession(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/audio/realtime/sessions"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createRerank(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> RerankResponse:
	path = path or {}
	resolved_path = "/rerank"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createResponse(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ResponsesResponse:
	path = path or {}
	resolved_path = "/responses"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createSpeech(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/audio/speech"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createTranscription(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> AudioTranscriptionResponse:
	path = path or {}
	resolved_path = "/audio/transcriptions"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createTranslation(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> AudioTranslationResponse:
	path = path or {}
	resolved_path = "/audio/translations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createVideo(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoGenerationResponse:
	path = path or {}
	resolved_path = "/videos"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createVideoAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoGenerationResponse:
	path = path or {}
	resolved_path = "/video/generations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createVideoDownloadUrl(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/videos/{path.get('video_id', '')}/download_url"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createVideoDownloadUrlAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/video/generations/{path.get('video_id', '')}/download_url"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createWebhookEndpoint(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WebhookEndpointSecretResponse:
	path = path or {}
	resolved_path = "/webhook-endpoints"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createWorkspace(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceResponse:
	path = path or {}
	resolved_path = "/workspaces"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createWorkspaceBudget(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceBudgetResponse:
	path = path or {}
	resolved_path = "/budgets"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createWorkspaceDepartment(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceDepartmentResponse:
	path = path or {}
	resolved_path = "/identity/departments"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createWorkspaceGroupMapping(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceGroupMappingResponse:
	path = path or {}
	resolved_path = "/identity/group-mappings"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createWorkspaceInvite(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceInviteCreateResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/invites"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createWorkspaceNotificationDestination(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceNotificationDestinationResponse:
	path = path or {}
	resolved_path = "/notifications/destinations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createWorkspaceScimToken(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceScimTokenCreateResponse:
	path = path or {}
	resolved_path = "/identity/scim/tokens"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def deleteApiKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ManagementKeyRuntimeDeleteResponse:
	path = path or {}
	resolved_path = f"/keys/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteDataContributionClassifier(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DataContributionClassifierDeleteResponse:
	path = path or {}
	resolved_path = f"/data-contribution/classifiers/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteDynamicRoute(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DynamicRouteDeleteResponse:
	path = path or {}
	resolved_path = f"/routing/dynamic-routes/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteGuardrail(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailDeleteResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteManagementKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ManagementKeyRuntimeDeleteResponse:
	path = path or {}
	resolved_path = f"/management-keys/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteOAuthClient(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> OAuthClientDeleteResponse:
	path = path or {}
	resolved_path = f"/oauth-clients/{path.get('client_id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteObservabilityDestination(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/observability/destinations/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deletePreset(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/presets/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deletePrivateModel(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PrivateModelDeleteResponse:
	path = path or {}
	resolved_path = f"/private-models/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteProviderCredential(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ProviderCredentialDeleteResponse:
	path = path or {}
	resolved_path = f"/byok/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteVideo(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoDeleteResponse:
	path = path or {}
	resolved_path = f"/videos/{path.get('video_id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteVideoAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoDeleteResponse:
	path = path or {}
	resolved_path = f"/video/generations/{path.get('video_id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteWebhookEndpoint(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WebhookEndpointDeleteResponse:
	path = path or {}
	resolved_path = f"/webhook-endpoints/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteWorkspace(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteWorkspaceBudget(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceBudgetDeleteResponse:
	path = path or {}
	resolved_path = f"/budgets/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteWorkspaceDepartment(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/identity/departments/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteWorkspaceDepartmentMember(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/identity/departments/{path.get('departmentId', '')}/members/{path.get('userId', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteWorkspaceGroupMapping(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/identity/group-mappings/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteWorkspaceInvite(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/invites/{path.get('invite_id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteWorkspaceNotificationDestination(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/notifications/destinations/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deployDynamicRouteVersion(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DynamicRouteDeployResponse:
	path = path or {}
	resolved_path = f"/routing/dynamic-routes/{path.get('id', '')}/versions/{path.get('version', '')}/deploy"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def exportAnalyticsCsv(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> str:
	path = path or {}
	resolved_path = "/analytics/export"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def finalizeRealtimeSession(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/audio/realtime/sessions/{path.get('session_id', '')}/finalize"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def forkPreset(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetResponse:
	path = path or {}
	resolved_path = f"/presets/{path.get('id', '')}/fork"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def generateMusic(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> MusicGenerateResponse:
	path = path or {}
	resolved_path = "/music/generate"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def generateMusicAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> MusicGenerateResponse:
	path = path or {}
	resolved_path = "/music/generations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def getActivity(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceActivityResponse:
	path = path or {}
	resolved_path = "/activity"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getActivityAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> AnalyticsResponse:
	path = path or {}
	resolved_path = "/analytics"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getApiKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ApiKeyResponse:
	path = path or {}
	resolved_path = f"/keys/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getCredits(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> CreditsResponse:
	path = path or {}
	resolved_path = "/credits"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getCurrentApiKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ApiKeyResponse:
	path = path or {}
	resolved_path = "/key"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getDataContributionSettings(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DataContributionOverviewResponse:
	path = path or {}
	resolved_path = "/data-contribution"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getDynamicRoute(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DynamicRouteResponse:
	path = path or {}
	resolved_path = f"/routing/dynamic-routes/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getGatewayRequestLog(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayRequestLogResponse:
	path = path or {}
	resolved_path = f"/logs/{path.get('requestId', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getGeneration(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GenerationResponse:
	path = path or {}
	resolved_path = "/generations"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getGuardrail(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailDetailResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getHealth(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/health"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getManagementKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ManagementKeyRuntimeResponse:
	path = path or {}
	resolved_path = f"/management-keys/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getMusicGeneration(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> MusicGenerateResponse:
	path = path or {}
	resolved_path = f"/music/generate/{path.get('music_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getMusicGenerationAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> MusicGenerateResponse:
	path = path or {}
	resolved_path = f"/music/generations/{path.get('music_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getOAuthClient(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> OAuthClient:
	path = path or {}
	resolved_path = f"/oauth-clients/{path.get('client_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getObservabilityDestination(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ObservabilityDestinationResponse:
	path = path or {}
	resolved_path = f"/observability/destinations/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getObservabilityLoggingPolicy(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ObservabilityLoggingPolicyResponse:
	path = path or {}
	resolved_path = "/observability/logging-policy"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getPreset(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetResponse:
	path = path or {}
	resolved_path = f"/presets/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getPresetPublisher(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetPublisherResponse:
	path = path or {}
	resolved_path = "/presets/publisher"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getPresetTestRun(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetTestRunDetailResponse:
	path = path or {}
	resolved_path = f"/preset-test-runs/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getPrivateModel(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PrivateModelResponse:
	path = path or {}
	resolved_path = f"/private-models/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getProviderCredential(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ProviderCredentialResponse:
	path = path or {}
	resolved_path = f"/byok/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getProviderDerankStatus(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/health/providers/{path.get('provider_id', '')}/derank"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getVideo(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoGenerationResponse:
	path = path or {}
	resolved_path = f"/videos/{path.get('video_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getVideoAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoGenerationResponse:
	path = path or {}
	resolved_path = f"/video/generations/{path.get('video_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getVideoContent(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/videos/{path.get('video_id', '')}/content"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getVideoContentAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/video/generations/{path.get('video_id', '')}/content"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getWebhookEndpoint(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WebhookEndpoint:
	path = path or {}
	resolved_path = f"/webhook-endpoints/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getWorkspace(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getWorkspaceBudget(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceBudgetResponse:
	path = path or {}
	resolved_path = f"/budgets/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getWorkspaceDirectory(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceDirectoryResponse:
	path = path or {}
	resolved_path = "/identity/directory"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getWorkspaceNotificationSettings(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceNotificationSettingsResponse:
	path = path or {}
	resolved_path = "/notifications/settings"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getWorkspaceScim(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceScimResponse:
	path = path or {}
	resolved_path = "/identity/scim"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getWorkspaceSettings(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceSettingsResponse:
	path = path or {}
	resolved_path = "/settings"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getWorkspaceSso(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceSsoResponse:
	path = path or {}
	resolved_path = "/identity/sso"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def invalidateApiKeyCache(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> KeyInvalidateResponse:
	path = path or {}
	resolved_path = f"/keys/{path.get('id', '')}/invalidate"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def listApiKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ApiKeyListResponse:
	path = path or {}
	resolved_path = "/keys"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchCapabilities(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/batches/capabilities"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchCapabilitiesAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/batch/capabilities"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatches(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchListResponse:
	path = path or {}
	resolved_path = "/batches"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchesAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchListResponse:
	path = path or {}
	resolved_path = "/batch"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchFiles(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/batches/files"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchFilesAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/batch/files"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchModelsResponse:
	path = path or {}
	resolved_path = "/batches/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchModelsAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchModelsResponse:
	path = path or {}
	resolved_path = "/batch/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchRequests(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/batches/{path.get('batch_id', '')}/requests"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listBatchRequestsAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/batch/{path.get('id', '')}/requests"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listDataModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/data/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listDynamicRoutes(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DynamicRouteListResponse:
	path = path or {}
	resolved_path = "/routing/dynamic-routes"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listEndpoints(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> EndpointCatalogueResponse:
	path = path or {}
	resolved_path = "/endpoints"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listFiles(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/files"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listGatewayFeedback(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayFeedbackListResponse:
	path = path or {}
	resolved_path = "/feedback"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listGatewayObservabilityEvents(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayObservabilityEventListResponse:
	path = path or {}
	resolved_path = "/events"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listGatewayRequestLogs(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayRequestLogListResponse:
	path = path or {}
	resolved_path = "/logs"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listGuardrailKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailKeyListResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}/keys"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listGuardrailMembers(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailMemberListResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}/members"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listGuardrails(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailListResponse:
	path = path or {}
	resolved_path = "/guardrails"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listManagementKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ManagementKeyCollectionResponse:
	path = path or {}
	resolved_path = "/management-keys"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listModelEndpoints(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ModelEndpointsResponse:
	path = path or {}
	resolved_path = f"/models/{path.get('author', '')}/{path.get('slug', '')}/endpoints"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayModelsResponse:
	path = path or {}
	resolved_path = "/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listOAuthClients(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> OAuthClientListResponse:
	path = path or {}
	resolved_path = "/oauth-clients"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listObservabilityDestinations(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ObservabilityDestinationListResponse:
	path = path or {}
	resolved_path = "/observability/destinations"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listOrganisations(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/organisations"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listPresets(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetListResponse:
	path = path or {}
	resolved_path = "/presets"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listPresetTestRuns(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetTestRunListResponse:
	path = path or {}
	resolved_path = "/preset-test-runs"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listPresetVersions(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetVersionListResponse:
	path = path or {}
	resolved_path = f"/presets/{path.get('id', '')}/versions"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listPricingModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/pricing/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listPrivateModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PrivateModelListResponse:
	path = path or {}
	resolved_path = "/private-models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listProviderCredentials(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ProviderCredentialListResponse:
	path = path or {}
	resolved_path = "/byok"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listProviders(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/providers"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listTeamModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayModelsResponse:
	path = path or {}
	resolved_path = "/models/me"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listVideoModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoModelsResponse:
	path = path or {}
	resolved_path = "/videos/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listVideoModelsAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoModelsResponse:
	path = path or {}
	resolved_path = "/video/generations/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listVideos(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoListResponse:
	path = path or {}
	resolved_path = "/videos"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listVideosAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> VideoListResponse:
	path = path or {}
	resolved_path = "/video/generations"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWebhookEndpoints(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WebhookEndpointListResponse:
	path = path or {}
	resolved_path = "/webhook-endpoints"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceApps(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceAppListResponse:
	path = path or {}
	resolved_path = "/apps"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceAuditEvents(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceAuditEventListResponse:
	path = path or {}
	resolved_path = "/audit-events"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceBudgets(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceBudgetListResponse:
	path = path or {}
	resolved_path = "/budgets"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceDepartments(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceDepartmentListResponse:
	path = path or {}
	resolved_path = "/identity/departments"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceGroupMappings(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceGroupMappingListResponse:
	path = path or {}
	resolved_path = "/identity/group-mappings"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceInvites(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceInviteListResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/invites"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceJoinRequests(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceJoinRequestListResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/join-requests"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceMembers(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceMemberListResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/members"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceNotificationDestinations(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceNotificationDestinationListResponse:
	path = path or {}
	resolved_path = "/notifications/destinations"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceNotificationRoutes(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceNotificationRoutesResponse:
	path = path or {}
	resolved_path = "/notifications/routes"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaces(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceListResponse:
	path = path or {}
	resolved_path = "/workspaces"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listWorkspaceScimAuditEvents(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceScimAuditResponse:
	path = path or {}
	resolved_path = "/identity/scim/audit"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def mergeWorkspaceApp(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceAppMergeResponse:
	path = path or {}
	resolved_path = f"/apps/{path.get('id', '')}/merge"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def publishPresetVersion(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetVersionResponse:
	path = path or {}
	resolved_path = f"/presets/{path.get('id', '')}/versions"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def regenerateOAuthClientSecret(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> OAuthClientSecretResponse:
	path = path or {}
	resolved_path = f"/oauth-clients/{path.get('client_id', '')}/regenerate-secret"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def rejectWorkspaceJoinRequest(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceJoinRequestResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/join-requests/{path.get('request_id', '')}/reject"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def removeGuardrailKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailRemoveResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}/keys/remove"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def removeGuardrailMembers(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailRemoveResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}/members/remove"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def removeWorkspaceMembers(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceMemberRemoveResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/members/remove"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def reorderProviderCredentials(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ProviderCredentialReorderResponse:
	path = path or {}
	resolved_path = "/byok/reorder"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def replaceDynamicRouteKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DynamicRouteKeysResponse:
	path = path or {}
	resolved_path = f"/routing/dynamic-routes/{path.get('id', '')}/keys"
	return client.request("PUT", resolved_path, query=query, headers=headers, body=body)


def replaceGuardrailKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailKeySetResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}/keys"
	return client.request("PUT", resolved_path, query=query, headers=headers, body=body)


def retrieveBatch(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchResponse:
	path = path or {}
	resolved_path = f"/batches/{path.get('batch_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatchAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> BatchResponse:
	path = path or {}
	resolved_path = f"/batch/{path.get('id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatchFile(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> FileResponse:
	path = path or {}
	resolved_path = f"/batches/files/{path.get('file_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatchFileAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> FileResponse:
	path = path or {}
	resolved_path = f"/batch/files/{path.get('file_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatchFileContent(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/batches/files/{path.get('file_id', '')}/content"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatchFileContentAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/batch/files/{path.get('file_id', '')}/content"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatchResults(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> str:
	path = path or {}
	resolved_path = f"/batches/{path.get('batch_id', '')}/results"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatchResultsAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> str:
	path = path or {}
	resolved_path = f"/batch/{path.get('id', '')}/results"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveFile(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> FileResponse:
	path = path or {}
	resolved_path = f"/files/{path.get('file_id', '')}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveFileContent(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/files/{path.get('file_id', '')}/content"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def revokeWorkspaceScimToken(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/identity/scim/tokens/{path.get('id', '')}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def rotateApiKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ApiKeyRotateResponse:
	path = path or {}
	resolved_path = f"/keys/{path.get('id', '')}/rotate"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def rotateWebhookEndpointSecret(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WebhookEndpointSecretResponse:
	path = path or {}
	resolved_path = f"/webhook-endpoints/{path.get('id', '')}/rotate-secret"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def setWorkspaceDepartmentMember(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceDepartmentMemberResponse:
	path = path or {}
	resolved_path = f"/identity/departments/{path.get('departmentId', '')}/members/{path.get('userId', '')}"
	return client.request("PUT", resolved_path, query=query, headers=headers, body=body)


def summarizeGatewayFeedback(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GatewayFeedbackSummaryResponse:
	path = path or {}
	resolved_path = "/feedback/summary"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def testWorkspaceNotificationDestination(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceNotificationTestResponse:
	path = path or {}
	resolved_path = f"/notifications/destinations/{path.get('id', '')}/test"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def testWorkspaceNotificationDestinationConfig(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceNotificationTestResponse:
	path = path or {}
	resolved_path = "/notifications/destinations/test"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def updateApiKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ApiKeyResponse:
	path = path or {}
	resolved_path = f"/keys/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateDataContributionClassifier(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DataContributionClassifierResponse:
	path = path or {}
	resolved_path = f"/data-contribution/classifiers/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateDataContributionConsent(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DataContributionConsentResponse:
	path = path or {}
	resolved_path = "/data-contribution/consent"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateDynamicRoute(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> DynamicRouteResponse:
	path = path or {}
	resolved_path = f"/routing/dynamic-routes/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateGuardrail(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> GuardrailResponse:
	path = path or {}
	resolved_path = f"/guardrails/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateManagementKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ManagementKeyRuntimeResponse:
	path = path or {}
	resolved_path = f"/management-keys/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateOAuthClient(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> OAuthClient:
	path = path or {}
	resolved_path = f"/oauth-clients/{path.get('client_id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateObservabilityDestination(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ObservabilityDestinationResponse:
	path = path or {}
	resolved_path = f"/observability/destinations/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateObservabilityLoggingPolicy(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ObservabilityLoggingPolicyResponse:
	path = path or {}
	resolved_path = "/observability/logging-policy"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updatePreset(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetResponse:
	path = path or {}
	resolved_path = f"/presets/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updatePresetPublisher(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetPublisherResponse:
	path = path or {}
	resolved_path = "/presets/publisher"
	return client.request("PUT", resolved_path, query=query, headers=headers, body=body)


def updatePresetTestRun(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PresetTestRunResponse:
	path = path or {}
	resolved_path = f"/preset-test-runs/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updatePrivateModel(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> PrivateModelResponse:
	path = path or {}
	resolved_path = f"/private-models/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateProviderCredential(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> ProviderCredentialResponse:
	path = path or {}
	resolved_path = f"/byok/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWebhookEndpoint(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WebhookEndpoint:
	path = path or {}
	resolved_path = f"/webhook-endpoints/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspace(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceApp(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceAppResponse:
	path = path or {}
	resolved_path = f"/apps/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceBudget(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceBudgetResponse:
	path = path or {}
	resolved_path = f"/budgets/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceDepartment(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceDepartmentResponse:
	path = path or {}
	resolved_path = f"/identity/departments/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceDirectoryMember(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> UpdatedResponse:
	path = path or {}
	resolved_path = f"/identity/directory/members/{path.get('id', '')}"
	return client.request("PUT", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceGroupMapping(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceGroupMappingResponse:
	path = path or {}
	resolved_path = f"/identity/group-mappings/{path.get('id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceMemberRole(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceMemberResponse:
	path = path or {}
	resolved_path = f"/workspaces/{path.get('id', '')}/members/{path.get('user_id', '')}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceNotificationRoute(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceNotificationRouteResponse:
	path = path or {}
	resolved_path = f"/notifications/routes/{path.get('eventKind', '')}"
	return client.request("PUT", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceNotificationSettings(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceNotificationSettingsResponse:
	path = path or {}
	resolved_path = "/notifications/settings"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceScim(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceScimEndpointResponse:
	path = path or {}
	resolved_path = "/identity/scim"
	return client.request("PUT", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceSettings(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceSettingsResponse:
	path = path or {}
	resolved_path = "/settings"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def updateWorkspaceSso(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> WorkspaceSsoResponse:
	path = path or {}
	resolved_path = "/identity/sso"
	return client.request("PUT", resolved_path, query=query, headers=headers, body=body)


def uploadBatchFile(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> FileResponse:
	path = path or {}
	resolved_path = "/batches/files"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def uploadBatchFileAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> FileResponse:
	path = path or {}
	resolved_path = "/batch/files"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def uploadFile(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> FileResponse:
	path = path or {}
	resolved_path = "/files"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


operations___all__ = ["addGuardrailKeys", "addGuardrailMembers", "addWorkspaceMembers", "applyPresetUpstreamVersion", "approveWorkspaceJoinRequest", "calculatePricing", "cancelBatch", "cancelBatchAlias", "cancelVideo", "cancelVideoAlias", "createAnthropicMessage", "createApiKey", "createBatch", "createBatchAlias", "createChatCompletion", "createDataContributionClassifier", "createDynamicRoute", "createEmbedding", "createGatewayFeedback", "createGatewayObservabilityEvent", "createGuardrail", "createImage", "createImageEdit", "createManagementKey", "createModeration", "createOAuthClient", "createObservabilityDestination", "createOcr", "createParse", "createPreset", "createPresetTestRun", "createPrivateModel", "createProviderCredential", "createRealtimeSession", "createRerank", "createResponse", "createSpeech", "createTranscription", "createTranslation", "createVideo", "createVideoAlias", "createVideoDownloadUrl", "createVideoDownloadUrlAlias", "createWebhookEndpoint", "createWorkspace", "createWorkspaceBudget", "createWorkspaceDepartment", "createWorkspaceGroupMapping", "createWorkspaceInvite", "createWorkspaceNotificationDestination", "createWorkspaceScimToken", "deleteApiKey", "deleteDataContributionClassifier", "deleteDynamicRoute", "deleteGuardrail", "deleteManagementKey", "deleteOAuthClient", "deleteObservabilityDestination", "deletePreset", "deletePrivateModel", "deleteProviderCredential", "deleteVideo", "deleteVideoAlias", "deleteWebhookEndpoint", "deleteWorkspace", "deleteWorkspaceBudget", "deleteWorkspaceDepartment", "deleteWorkspaceDepartmentMember", "deleteWorkspaceGroupMapping", "deleteWorkspaceInvite", "deleteWorkspaceNotificationDestination", "deployDynamicRouteVersion", "exportAnalyticsCsv", "finalizeRealtimeSession", "forkPreset", "generateMusic", "generateMusicAlias", "getActivity", "getActivityAlias", "getApiKey", "getCredits", "getCurrentApiKey", "getDataContributionSettings", "getDynamicRoute", "getGatewayRequestLog", "getGeneration", "getGuardrail", "getHealth", "getManagementKey", "getMusicGeneration", "getMusicGenerationAlias", "getOAuthClient", "getObservabilityDestination", "getObservabilityLoggingPolicy", "getPreset", "getPresetPublisher", "getPresetTestRun", "getPrivateModel", "getProviderCredential", "getProviderDerankStatus", "getVideo", "getVideoAlias", "getVideoContent", "getVideoContentAlias", "getWebhookEndpoint", "getWorkspace", "getWorkspaceBudget", "getWorkspaceDirectory", "getWorkspaceNotificationSettings", "getWorkspaceScim", "getWorkspaceSettings", "getWorkspaceSso", "invalidateApiKeyCache", "listApiKeys", "listBatchCapabilities", "listBatchCapabilitiesAlias", "listBatches", "listBatchesAlias", "listBatchFiles", "listBatchFilesAlias", "listBatchModels", "listBatchModelsAlias", "listBatchRequests", "listBatchRequestsAlias", "listDataModels", "listDynamicRoutes", "listEndpoints", "listFiles", "listGatewayFeedback", "listGatewayObservabilityEvents", "listGatewayRequestLogs", "listGuardrailKeys", "listGuardrailMembers", "listGuardrails", "listManagementKeys", "listModelEndpoints", "listModels", "listOAuthClients", "listObservabilityDestinations", "listOrganisations", "listPresets", "listPresetTestRuns", "listPresetVersions", "listPricingModels", "listPrivateModels", "listProviderCredentials", "listProviders", "listTeamModels", "listVideoModels", "listVideoModelsAlias", "listVideos", "listVideosAlias", "listWebhookEndpoints", "listWorkspaceApps", "listWorkspaceAuditEvents", "listWorkspaceBudgets", "listWorkspaceDepartments", "listWorkspaceGroupMappings", "listWorkspaceInvites", "listWorkspaceJoinRequests", "listWorkspaceMembers", "listWorkspaceNotificationDestinations", "listWorkspaceNotificationRoutes", "listWorkspaces", "listWorkspaceScimAuditEvents", "mergeWorkspaceApp", "publishPresetVersion", "regenerateOAuthClientSecret", "rejectWorkspaceJoinRequest", "removeGuardrailKeys", "removeGuardrailMembers", "removeWorkspaceMembers", "reorderProviderCredentials", "replaceDynamicRouteKeys", "replaceGuardrailKeys", "retrieveBatch", "retrieveBatchAlias", "retrieveBatchFile", "retrieveBatchFileAlias", "retrieveBatchFileContent", "retrieveBatchFileContentAlias", "retrieveBatchResults", "retrieveBatchResultsAlias", "retrieveFile", "retrieveFileContent", "revokeWorkspaceScimToken", "rotateApiKey", "rotateWebhookEndpointSecret", "setWorkspaceDepartmentMember", "summarizeGatewayFeedback", "testWorkspaceNotificationDestination", "testWorkspaceNotificationDestinationConfig", "updateApiKey", "updateDataContributionClassifier", "updateDataContributionConsent", "updateDynamicRoute", "updateGuardrail", "updateManagementKey", "updateOAuthClient", "updateObservabilityDestination", "updateObservabilityLoggingPolicy", "updatePreset", "updatePresetPublisher", "updatePresetTestRun", "updatePrivateModel", "updateProviderCredential", "updateWebhookEndpoint", "updateWorkspace", "updateWorkspaceApp", "updateWorkspaceBudget", "updateWorkspaceDepartment", "updateWorkspaceDirectoryMember", "updateWorkspaceGroupMapping", "updateWorkspaceMemberRole", "updateWorkspaceNotificationRoute", "updateWorkspaceNotificationSettings", "updateWorkspaceScim", "updateWorkspaceSettings", "updateWorkspaceSso", "uploadBatchFile", "uploadBatchFileAlias", "uploadFile"]
