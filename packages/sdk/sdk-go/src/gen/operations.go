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

func CreateProvisioningKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management/keys"
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

func CreateProvisioningKeyAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/provisioning/keys"
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

func CreateProvisioningKeyLegacy(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
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

func DeleteProvisioningKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management/keys/" + url.PathEscape(path["id"])
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

func DeleteProvisioningKeyAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/provisioning/keys/" + url.PathEscape(path["id"])
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

func GetAnalytics(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/analytics"
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

func GetProvisioningKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management/keys/" + url.PathEscape(path["id"])
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

func GetProvisioningKeyAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/provisioning/keys/" + url.PathEscape(path["id"])
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

func GetProvisioningKeyLegacy(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
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

func Healthz(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
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

func InvalidateGatewayKeyCache(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
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

func ListFiles(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/files"
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

func ListProvisioningKeys(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management/keys"
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

func ListProvisioningKeysAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/provisioning/keys"
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

func ListProvisioningKeysLegacy(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
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

func UpdateProvisioningKey(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/management/keys/" + url.PathEscape(path["id"])
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

func UpdateProvisioningKeyAlias(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/provisioning/keys/" + url.PathEscape(path["id"])
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
