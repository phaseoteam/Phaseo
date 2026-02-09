#pragma once
#include <map>
#include <string>
#include "client.hpp"

namespace ai_stats::gen {
inline Response CalculatePricing(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/pricing/calculate";
	return client.request("POST", resolved_path, body);
}

inline Response CreateAnthropicMessage(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/messages";
	return client.request("POST", resolved_path, body);
}

inline Response CreateBatch(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/batches";
	return client.request("POST", resolved_path, body);
}

inline Response CreateBatchAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/batch";
	return client.request("POST", resolved_path, body);
}

inline Response CreateChatCompletion(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/chat/completions";
	return client.request("POST", resolved_path, body);
}

inline Response CreateEmbedding(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/embeddings";
	return client.request("POST", resolved_path, body);
}

inline Response CreateImage(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/images/generations";
	return client.request("POST", resolved_path, body);
}

inline Response CreateImageEdit(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/images/edits";
	return client.request("POST", resolved_path, body);
}

inline Response CreateKeyPlaceholder(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/keys";
	return client.request("POST", resolved_path, body);
}

inline Response CreateModeration(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/moderations";
	return client.request("POST", resolved_path, body);
}

inline Response CreateOAuthClient(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/oauth-clients";
	return client.request("POST", resolved_path, body);
}

inline Response CreateOcr(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/ocr";
	return client.request("POST", resolved_path, body);
}

inline Response CreateResponse(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/responses";
	return client.request("POST", resolved_path, body);
}

inline Response CreateSpeech(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/audio/speech";
	return client.request("POST", resolved_path, body);
}

inline Response CreateTranscription(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/audio/transcriptions";
	return client.request("POST", resolved_path, body);
}

inline Response CreateTranslation(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/audio/translations";
	return client.request("POST", resolved_path, body);
}

inline Response CreateVideo(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/videos";
	return client.request("POST", resolved_path, body);
}

inline Response CreateVideoAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/video/generations";
	return client.request("POST", resolved_path, body);
}

inline Response DeleteOAuthClient(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/oauth-clients/" + (path.count("client_id") ? path.at("client_id") : std::string{});
	return client.request("DELETE", resolved_path, body);
}

inline Response DeleteProvisioningKey(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/management/keys/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("DELETE", resolved_path, body);
}

inline Response DeleteProvisioningKeyAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/provisioning/keys/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("DELETE", resolved_path, body);
}

inline Response DeleteVideo(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/videos/" + (path.count("video_id") ? path.at("video_id") : std::string{});
	return client.request("DELETE", resolved_path, body);
}

inline Response DeleteVideoAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/video/generations/" + (path.count("video_id") ? path.at("video_id") : std::string{});
	return client.request("DELETE", resolved_path, body);
}

inline Response GenerateMusic(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/music/generate";
	return client.request("POST", resolved_path, body);
}

inline Response GenerateMusicAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/music/generations";
	return client.request("POST", resolved_path, body);
}

inline Response GetActivity(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/activity";
	return client.request("GET", resolved_path, body);
}

inline Response GetAnalytics(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/analytics";
	return client.request("POST", resolved_path, body);
}

inline Response GetCredits(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/credits";
	return client.request("GET", resolved_path, body);
}

inline Response GetGeneration(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/generations";
	return client.request("GET", resolved_path, body);
}

inline Response GetKeyPlaceholder(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/key";
	return client.request("GET", resolved_path, body);
}

inline Response GetMusicGeneration(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/music/generate/" + (path.count("music_id") ? path.at("music_id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response GetMusicGenerationAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/music/generations/" + (path.count("music_id") ? path.at("music_id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response GetOAuthClient(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/oauth-clients/" + (path.count("client_id") ? path.at("client_id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response GetProviderDerankStatus(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/health/providers/" + (path.count("provider_id") ? path.at("provider_id") : std::string{}) + "/derank";
	return client.request("GET", resolved_path, body);
}

inline Response GetProvisioningKey(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/management/keys/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response GetProvisioningKeyAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/provisioning/keys/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response GetVideo(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/videos/" + (path.count("video_id") ? path.at("video_id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response GetVideoAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/video/generations/" + (path.count("video_id") ? path.at("video_id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response GetVideoContent(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/videos/" + (path.count("video_id") ? path.at("video_id") : std::string{}) + "/content";
	return client.request("GET", resolved_path, body);
}

inline Response GetVideoContentAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/video/generations/" + (path.count("video_id") ? path.at("video_id") : std::string{}) + "/content";
	return client.request("GET", resolved_path, body);
}

inline Response Healthz(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/health";
	return client.request("GET", resolved_path, body);
}

inline Response InvalidateGatewayKeyCache(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/keys/" + (path.count("id") ? path.at("id") : std::string{}) + "/invalidate";
	return client.request("POST", resolved_path, body);
}

inline Response ListEndpointsPlaceholder(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/endpoints";
	return client.request("GET", resolved_path, body);
}

inline Response ListFiles(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/files";
	return client.request("GET", resolved_path, body);
}

inline Response ListKeysPlaceholder(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/keys";
	return client.request("GET", resolved_path, body);
}

inline Response ListModels(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/models";
	return client.request("GET", resolved_path, body);
}

inline Response ListOAuthClients(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/oauth-clients";
	return client.request("GET", resolved_path, body);
}

inline Response ListOrganisations(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/organisations";
	return client.request("GET", resolved_path, body);
}

inline Response ListPricingModels(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/pricing/models";
	return client.request("GET", resolved_path, body);
}

inline Response ListProviders(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/providers";
	return client.request("GET", resolved_path, body);
}

inline Response ListProvisioningKeys(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/management/keys";
	return client.request("GET", resolved_path, body);
}

inline Response ListProvisioningKeysAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/provisioning/keys";
	return client.request("GET", resolved_path, body);
}

inline Response RegenerateOAuthClientSecret(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/oauth-clients/" + (path.count("client_id") ? path.at("client_id") : std::string{}) + "/regenerate-secret";
	return client.request("POST", resolved_path, body);
}

inline Response RetrieveBatch(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/batches/" + (path.count("batch_id") ? path.at("batch_id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response RetrieveBatchAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/batch/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response RetrieveFile(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/files/" + (path.count("file_id") ? path.at("file_id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response Root(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/";
	return client.request("GET", resolved_path, body);
}

inline Response UpdateOAuthClient(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/oauth-clients/" + (path.count("client_id") ? path.at("client_id") : std::string{});
	return client.request("PATCH", resolved_path, body);
}

inline Response UpdateProvisioningKey(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/management/keys/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("PATCH", resolved_path, body);
}

inline Response UpdateProvisioningKeyAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/provisioning/keys/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("PATCH", resolved_path, body);
}

inline Response UploadFile(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/files";
	return client.request("POST", resolved_path, body);
}

} // namespace ai_stats::gen
