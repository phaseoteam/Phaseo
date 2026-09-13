package gen

import "net/url"

func AddGuardrailKeys(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"]) + "/keys/add"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func AddGuardrailMembers(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"]) + "/members/add"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func AddWorkspaceMembers(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/members/add"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ApplyPresetUpstreamVersion(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/" + url.PathEscape(path["id"]) + "/upstream"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ApproveWorkspaceJoinRequest(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/join-requests/" + url.PathEscape(path["request_id"]) + "/approve"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CalculatePricing(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/pricing/calculate"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CancelBatch(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches/" + url.PathEscape(path["batch_id"]) + "/cancel"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CancelBatchAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch/" + url.PathEscape(path["id"]) + "/cancel"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CancelVideo(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/videos/" + url.PathEscape(path["video_id"]) + "/cancel"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func CancelVideoAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/video/generations/" + url.PathEscape(path["video_id"]) + "/cancel"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func CreateAnthropicMessage(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/messages"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateApiKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/keys"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateBatch(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateBatchAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateChatCompletion(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/chat/completions"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateDataContributionClassifier(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/data-contribution/classifiers"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateDynamicRoute(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/routing/dynamic-routes"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateEmbedding(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/embeddings"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateGatewayFeedback(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/feedback"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateGatewayObservabilityEvent(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/events"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateGuardrail(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateImage(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/images/generations"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateImageEdit(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/images/edits"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateManagementKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management-keys"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateModeration(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/moderations"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateOAuthClient(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/oauth-clients"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateObservabilityDestination(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/observability/destinations"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateOcr(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/ocr"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateParse(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/parse"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreatePreset(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreatePresetTestRun(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/preset-test-runs"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreatePrivateModel(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/private-models"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateProviderCredential(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/byok"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateRealtimeSession(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/audio/realtime/sessions"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateRerank(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/rerank"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateResponse(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/responses"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateSpeech(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/audio/speech"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func CreateTranscription(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/audio/transcriptions"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateTranslation(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/audio/translations"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateVideo(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/videos"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateVideoAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/video/generations"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateVideoDownloadUrl(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/videos/" + url.PathEscape(path["video_id"]) + "/download_url"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateVideoDownloadUrlAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/video/generations/" + url.PathEscape(path["video_id"]) + "/download_url"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateWebhookEndpoint(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/webhook-endpoints"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateWorkspace(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateWorkspaceBudget(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/budgets"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateWorkspaceDepartment(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/departments"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateWorkspaceGroupMapping(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/group-mappings"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateWorkspaceInvite(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/invites"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateWorkspaceNotificationDestination(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/destinations"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func CreateWorkspaceScimToken(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/scim/tokens"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteApiKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/keys/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteDataContributionClassifier(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/data-contribution/classifiers/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteDynamicRoute(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/routing/dynamic-routes/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteGuardrail(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteManagementKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management-keys/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteOAuthClient(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/oauth-clients/" + url.PathEscape(path["client_id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteObservabilityDestination(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/observability/destinations/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeletePreset(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeletePrivateModel(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/private-models/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteProviderCredential(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/byok/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteVideo(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/videos/" + url.PathEscape(path["video_id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteVideoAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/video/generations/" + url.PathEscape(path["video_id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteWebhookEndpoint(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/webhook-endpoints/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteWorkspace(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteWorkspaceBudget(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/budgets/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteWorkspaceDepartment(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/departments/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteWorkspaceDepartmentMember(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/departments/" + url.PathEscape(path["departmentId"]) + "/members/" + url.PathEscape(path["userId"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteWorkspaceGroupMapping(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/group-mappings/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteWorkspaceInvite(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/invites/" + url.PathEscape(path["invite_id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeleteWorkspaceNotificationDestination(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/destinations/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func DeployDynamicRouteVersion(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/routing/dynamic-routes/" + url.PathEscape(path["id"]) + "/versions/" + url.PathEscape(path["version"]) + "/deploy"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ExportAnalyticsCsv(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (string, error) {
	resolvedPath := "/analytics/export"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero string
		return zero, err
	}
	return string(data), nil
}

func FinalizeRealtimeSession(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/audio/realtime/sessions/" + url.PathEscape(path["session_id"]) + "/finalize"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ForkPreset(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/" + url.PathEscape(path["id"]) + "/fork"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GenerateMusic(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/music/generate"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GenerateMusicAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/music/generations"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetActivity(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/activity"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetActivityAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/analytics"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetApiKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/keys/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetCredits(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/credits"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetCurrentApiKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/key"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetDataContributionSettings(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/data-contribution"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetDynamicRoute(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/routing/dynamic-routes/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetGatewayRequestLog(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/logs/" + url.PathEscape(path["requestId"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetGeneration(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/generations"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetGuardrail(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetHealth(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/health"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetManagementKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management-keys/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetMusicGeneration(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/music/generate/" + url.PathEscape(path["music_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetMusicGenerationAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/music/generations/" + url.PathEscape(path["music_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetOAuthClient(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/oauth-clients/" + url.PathEscape(path["client_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetObservabilityDestination(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/observability/destinations/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetObservabilityLoggingPolicy(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/observability/logging-policy"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetPreset(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetPresetPublisher(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/publisher"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetPresetTestRun(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/preset-test-runs/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetPrivateModel(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/private-models/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetProviderCredential(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/byok/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetProviderDerankStatus(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/health/providers/" + url.PathEscape(path["provider_id"]) + "/derank"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetVideo(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/videos/" + url.PathEscape(path["video_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetVideoAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/video/generations/" + url.PathEscape(path["video_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetVideoContent(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/videos/" + url.PathEscape(path["video_id"]) + "/content"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func GetVideoContentAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/video/generations/" + url.PathEscape(path["video_id"]) + "/content"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func GetWebhookEndpoint(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/webhook-endpoints/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetWorkspace(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetWorkspaceBudget(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/budgets/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetWorkspaceDirectory(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/directory"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetWorkspaceNotificationSettings(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/settings"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetWorkspaceScim(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/scim"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetWorkspaceSettings(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/settings"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func GetWorkspaceSso(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/sso"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func InvalidateApiKeyCache(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/keys/" + url.PathEscape(path["id"]) + "/invalidate"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListApiKeys(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/keys"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchCapabilities(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches/capabilities"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchCapabilitiesAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch/capabilities"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListBatches(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchesAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchFiles(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/batches/files"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchFilesAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/batch/files"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchModels(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches/models"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchModelsAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch/models"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchRequests(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches/" + url.PathEscape(path["batch_id"]) + "/requests"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListBatchRequestsAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch/" + url.PathEscape(path["id"]) + "/requests"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListDataModels(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/data/models"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListDynamicRoutes(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/routing/dynamic-routes"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListEndpoints(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/endpoints"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListFiles(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/files"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func ListGatewayFeedback(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/feedback"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListGatewayObservabilityEvents(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/events"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListGatewayRequestLogs(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/logs"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListGuardrailKeys(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"]) + "/keys"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListGuardrailMembers(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"]) + "/members"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListGuardrails(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListManagementKeys(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management-keys"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListModelEndpoints(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/models/" + url.PathEscape(path["author"]) + "/" + url.PathEscape(path["slug"]) + "/endpoints"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListModels(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/models"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListOAuthClients(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/oauth-clients"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListObservabilityDestinations(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/observability/destinations"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListOrganisations(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/organisations"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListPresets(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListPresetTestRuns(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/preset-test-runs"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListPresetVersions(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/" + url.PathEscape(path["id"]) + "/versions"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListPricingModels(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/pricing/models"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListPrivateModels(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/private-models"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListProviderCredentials(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/byok"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListProviders(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/providers"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListTeamModels(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/models/me"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListVideoModels(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/videos/models"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListVideoModelsAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/video/generations/models"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListVideos(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/videos"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListVideosAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/video/generations"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWebhookEndpoints(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/webhook-endpoints"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceApps(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/apps"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceAuditEvents(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/audit-events"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceBudgets(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/budgets"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceDepartments(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/departments"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceGroupMappings(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/group-mappings"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceInvites(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/invites"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceJoinRequests(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/join-requests"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceMembers(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/members"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceNotificationDestinations(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/destinations"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceNotificationRoutes(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/routes"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaces(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ListWorkspaceScimAuditEvents(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/scim/audit"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func MergeWorkspaceApp(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/apps/" + url.PathEscape(path["id"]) + "/merge"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func PublishPresetVersion(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/" + url.PathEscape(path["id"]) + "/versions"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RegenerateOAuthClientSecret(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/oauth-clients/" + url.PathEscape(path["client_id"]) + "/regenerate-secret"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RejectWorkspaceJoinRequest(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/join-requests/" + url.PathEscape(path["request_id"]) + "/reject"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RemoveGuardrailKeys(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"]) + "/keys/remove"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RemoveGuardrailMembers(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"]) + "/members/remove"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RemoveWorkspaceMembers(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/members/remove"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ReorderProviderCredentials(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/byok/reorder"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ReplaceDynamicRouteKeys(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/routing/dynamic-routes/" + url.PathEscape(path["id"]) + "/keys"
	data, err := client.Request("PUT", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func ReplaceGuardrailKeys(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"]) + "/keys"
	data, err := client.Request("PUT", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RetrieveBatch(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches/" + url.PathEscape(path["batch_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RetrieveBatchAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch/" + url.PathEscape(path["id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RetrieveBatchFile(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches/files/" + url.PathEscape(path["file_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RetrieveBatchFileAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch/files/" + url.PathEscape(path["file_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RetrieveBatchFileContent(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/batches/files/" + url.PathEscape(path["file_id"]) + "/content"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func RetrieveBatchFileContentAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/batch/files/" + url.PathEscape(path["file_id"]) + "/content"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func RetrieveBatchResults(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (string, error) {
	resolvedPath := "/batches/" + url.PathEscape(path["batch_id"]) + "/results"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero string
		return zero, err
	}
	return string(data), nil
}

func RetrieveBatchResultsAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (string, error) {
	resolvedPath := "/batch/" + url.PathEscape(path["id"]) + "/results"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero string
		return zero, err
	}
	return string(data), nil
}

func RetrieveFile(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/files/" + url.PathEscape(path["file_id"])
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RetrieveFileContent(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/files/" + url.PathEscape(path["file_id"]) + "/content"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero interface{}
		return zero, err
	}
	var out interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero interface{}
		return zero, err
	}
	return out, nil
}

func RevokeWorkspaceScimToken(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/scim/tokens/" + url.PathEscape(path["id"])
	data, err := client.Request("DELETE", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RotateApiKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/keys/" + url.PathEscape(path["id"]) + "/rotate"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func RotateWebhookEndpointSecret(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/webhook-endpoints/" + url.PathEscape(path["id"]) + "/rotate-secret"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func SetWorkspaceDepartmentMember(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/departments/" + url.PathEscape(path["departmentId"]) + "/members/" + url.PathEscape(path["userId"])
	data, err := client.Request("PUT", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func SummarizeGatewayFeedback(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/feedback/summary"
	data, err := client.Request("GET", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func TestWorkspaceNotificationDestination(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/destinations/" + url.PathEscape(path["id"]) + "/test"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func TestWorkspaceNotificationDestinationConfig(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/destinations/test"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateApiKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/keys/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateDataContributionClassifier(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/data-contribution/classifiers/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateDataContributionConsent(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/data-contribution/consent"
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateDynamicRoute(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/routing/dynamic-routes/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateGuardrail(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/guardrails/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateManagementKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management-keys/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateOAuthClient(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/oauth-clients/" + url.PathEscape(path["client_id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateObservabilityDestination(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/observability/destinations/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateObservabilityLoggingPolicy(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/observability/logging-policy"
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdatePreset(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdatePresetPublisher(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/presets/publisher"
	data, err := client.Request("PUT", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdatePresetTestRun(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/preset-test-runs/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdatePrivateModel(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/private-models/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateProviderCredential(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/byok/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWebhookEndpoint(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/webhook-endpoints/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspace(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceApp(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/apps/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceBudget(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/budgets/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceDepartment(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/departments/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceDirectoryMember(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/directory/members/" + url.PathEscape(path["id"])
	data, err := client.Request("PUT", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceGroupMapping(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/group-mappings/" + url.PathEscape(path["id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceMemberRole(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/workspaces/" + url.PathEscape(path["id"]) + "/members/" + url.PathEscape(path["user_id"])
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceNotificationRoute(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/routes/" + url.PathEscape(path["eventKind"])
	data, err := client.Request("PUT", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceNotificationSettings(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/notifications/settings"
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceScim(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/scim"
	data, err := client.Request("PUT", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceSettings(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/settings"
	data, err := client.Request("PATCH", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UpdateWorkspaceSso(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/identity/sso"
	data, err := client.Request("PUT", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UploadBatchFile(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batches/files"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UploadBatchFileAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/batch/files"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}

func UploadFile(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/files"
	data, err := client.Request("POST", resolvedPath, query, headers, body)
	if err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	var out map[string]interface{}
	if err := DecodeJSON(data, &out); err != nil {
		var zero map[string]interface{}
		return zero, err
	}
	return out, nil
}
