package gen

import "net/url"

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

func GetGeneration(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/generation"
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

func Healthz(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/healthz"
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

func Root(client *Client, path map[string]string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	resolvedPath := "/"
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
