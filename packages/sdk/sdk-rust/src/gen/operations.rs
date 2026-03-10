use std::collections::HashMap;
use crate::client::{Client, Response, Transport};

pub fn no_query() -> HashMap<String, String> {
	HashMap::new()
}

pub fn calculatePricing<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/pricing/calculate");
	client.request("POST", &resolved_path, body)
}

pub fn createAnthropicMessage<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/messages");
	client.request("POST", &resolved_path, body)
}

pub fn createAudioRealtimeCallPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/realtime/calls");
	client.request("POST", &resolved_path, body)
}

pub fn createAudioRealtimeClientSecretsPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/realtime/client_secrets");
	client.request("POST", &resolved_path, body)
}

pub fn createAudioRealtimeSessionPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/realtime");
	client.request("POST", &resolved_path, body)
}

pub fn createAudioRealtimeSessionsPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/realtime/sessions");
	client.request("POST", &resolved_path, body)
}

pub fn createBatch<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/batches");
	client.request("POST", &resolved_path, body)
}

pub fn createBatchAlias<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/batch");
	client.request("POST", &resolved_path, body)
}

pub fn createChatCompletion<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/chat/completions");
	client.request("POST", &resolved_path, body)
}

pub fn createEmbedding<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/embeddings");
	client.request("POST", &resolved_path, body)
}

pub fn createImage<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/images/generations");
	client.request("POST", &resolved_path, body)
}

pub fn createImageEdit<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/images/edits");
	client.request("POST", &resolved_path, body)
}

pub fn createManagementKey<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/management/keys");
	client.request("POST", &resolved_path, body)
}

pub fn createModeration<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/moderations");
	client.request("POST", &resolved_path, body)
}

pub fn createOAuthClient<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/oauth-clients");
	client.request("POST", &resolved_path, body)
}

pub fn createOcr<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/ocr");
	client.request("POST", &resolved_path, body)
}

pub fn createRealtimeCallPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/realtime/calls");
	client.request("POST", &resolved_path, body)
}

pub fn createRealtimeClientSecretsPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/realtime/client_secrets");
	client.request("POST", &resolved_path, body)
}

pub fn createRealtimeSessionPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/realtime");
	client.request("POST", &resolved_path, body)
}

pub fn createRealtimeSessionsPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/realtime/sessions");
	client.request("POST", &resolved_path, body)
}

pub fn createResponse<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/responses");
	client.request("POST", &resolved_path, body)
}

pub fn createSpeech<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/speech");
	client.request("POST", &resolved_path, body)
}

pub fn createTranscription<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/transcriptions");
	client.request("POST", &resolved_path, body)
}

pub fn createTranslation<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/translations");
	client.request("POST", &resolved_path, body)
}

pub fn createVideo<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/videos");
	client.request("POST", &resolved_path, body)
}

pub fn createVideoAlias<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/video/generations");
	client.request("POST", &resolved_path, body)
}

pub fn deleteManagementKey<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/management/keys/{}", path.get("id").cloned().unwrap_or_default());
	client.request("DELETE", &resolved_path, body)
}

pub fn deleteOAuthClient<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/oauth-clients/{}", path.get("client_id").cloned().unwrap_or_default());
	client.request("DELETE", &resolved_path, body)
}

pub fn deleteVideo<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/videos/{}", path.get("video_id").cloned().unwrap_or_default());
	client.request("DELETE", &resolved_path, body)
}

pub fn deleteVideoAlias<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/video/generations/{}", path.get("video_id").cloned().unwrap_or_default());
	client.request("DELETE", &resolved_path, body)
}

pub fn generateMusic<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/music/generate");
	client.request("POST", &resolved_path, body)
}

pub fn generateMusicAlias<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/music/generations");
	client.request("POST", &resolved_path, body)
}

pub fn getActivity<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/activity");
	client.request("GET", &resolved_path, body)
}

pub fn getAnalytics<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/analytics");
	client.request("POST", &resolved_path, body)
}

pub fn getAudioRealtimeCallPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/audio/realtime/calls/{}", path.get("call_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getCredits<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/credits");
	client.request("GET", &resolved_path, body)
}

pub fn getGeneration<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/generations");
	client.request("GET", &resolved_path, body)
}

pub fn getManagementKey<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/management/keys/{}", path.get("id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getMusicGeneration<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/music/generate/{}", path.get("music_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getMusicGenerationAlias<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/music/generations/{}", path.get("music_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getOAuthClient<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/oauth-clients/{}", path.get("client_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getProviderDerankStatus<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/health/providers/{}/derank", path.get("provider_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getRealtimeCallPlaceholder<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/realtime/calls/{}", path.get("call_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getVideo<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/videos/{}", path.get("video_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getVideoAlias<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/video/generations/{}", path.get("video_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getVideoContent<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/videos/{}/content", path.get("video_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn getVideoContentAlias<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/video/generations/{}/content", path.get("video_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn healthz<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/health");
	client.request("GET", &resolved_path, body)
}

pub fn invalidateGatewayKeyCache<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/keys/{}/invalidate", path.get("id").cloned().unwrap_or_default());
	client.request("POST", &resolved_path, body)
}

pub fn listDataModels<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/data/models");
	client.request("GET", &resolved_path, body)
}

pub fn listEndpoints<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/endpoints");
	client.request("GET", &resolved_path, body)
}

pub fn listFiles<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/files");
	client.request("GET", &resolved_path, body)
}

pub fn listManagementKeys<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/management/keys");
	client.request("GET", &resolved_path, body)
}

pub fn listModels<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/gateway/models");
	client.request("GET", &resolved_path, body)
}

pub fn listOAuthClients<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/oauth-clients");
	client.request("GET", &resolved_path, body)
}

pub fn listOrganisations<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/organisations");
	client.request("GET", &resolved_path, body)
}

pub fn listPricingModels<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/pricing/models");
	client.request("GET", &resolved_path, body)
}

pub fn listProviders<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/providers");
	client.request("GET", &resolved_path, body)
}

pub fn openResponsesWebSocket<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/responses/ws");
	client.request("GET", &resolved_path, body)
}

pub fn regenerateOAuthClientSecret<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/oauth-clients/{}/regenerate-secret", path.get("client_id").cloned().unwrap_or_default());
	client.request("POST", &resolved_path, body)
}

pub fn retrieveBatch<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/batches/{}", path.get("batch_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn retrieveBatchAlias<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/batch/{}", path.get("id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn retrieveFile<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/files/{}", path.get("file_id").cloned().unwrap_or_default());
	client.request("GET", &resolved_path, body)
}

pub fn updateManagementKey<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/management/keys/{}", path.get("id").cloned().unwrap_or_default());
	client.request("PATCH", &resolved_path, body)
}

pub fn updateOAuthClient<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = format!("/oauth-clients/{}", path.get("client_id").cloned().unwrap_or_default());
	client.request("PATCH", &resolved_path, body)
}

pub fn uploadFile<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/files");
	client.request("POST", &resolved_path, body)
}
