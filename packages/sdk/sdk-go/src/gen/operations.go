package gen

import "net/url"

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
	resolvedPath := "/webhook-endpoints/" + url.PathEscape(path["endpoint_id"])
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
	resolvedPath := "/webhook-endpoints/" + url.PathEscape(path["endpoint_id"])
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

func ListModels(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/gateway/models"
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
	resolvedPath := "/gateway/models/me"
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

func OpenResponsesWebSocket(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (interface{}, error) {
	resolvedPath := "/responses/ws"
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

func RotateWebhookEndpointSecret(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/webhook-endpoints/" + url.PathEscape(path["endpoint_id"]) + "/rotate-secret"
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

func UpdateWebhookEndpoint(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/webhook-endpoints/" + url.PathEscape(path["endpoint_id"])
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
