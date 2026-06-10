#pragma once
#include <map>
#include <string>
#include "client.hpp"

namespace ai_stats::gen {
inline Response CalculatePricing(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/pricing/calculate";
	return client.request("POST", resolved_path, body);
}

inline Response CancelBatch(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/batches/" + (path.count("batch_id") ? path.at("batch_id") : std::string{}) + "/cancel";
	return client.request("POST", resolved_path, body);
}

inline Response CancelBatchAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/batch/" + (path.count("id") ? path.at("id") : std::string{}) + "/cancel";
	return client.request("POST", resolved_path, body);
}

inline Response CancelVideo(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/videos/" + (path.count("video_id") ? path.at("video_id") : std::string{}) + "/cancel";
	return client.request("POST", resolved_path, body);
}

inline Response CancelVideoAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/video/generations/" + (path.count("video_id") ? path.at("video_id") : std::string{}) + "/cancel";
	return client.request("POST", resolved_path, body);
}

inline Response CreateAnthropicMessage(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/messages";
	return client.request("POST", resolved_path, body);
}

inline Response CreateApiKey(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/keys";
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

inline Response CreateModeration(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/moderations";
	return client.request("POST", resolved_path, body);
}

inline Response CreateOcr(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/ocr";
	return client.request("POST", resolved_path, body);
}

inline Response CreateRerank(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/rerank";
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

inline Response CreateVideoDownloadUrl(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/videos/" + (path.count("video_id") ? path.at("video_id") : std::string{}) + "/download_url";
	return client.request("POST", resolved_path, body);
}

inline Response CreateVideoDownloadUrlAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/video/generations/" + (path.count("video_id") ? path.at("video_id") : std::string{}) + "/download_url";
	return client.request("POST", resolved_path, body);
}

inline Response CreateWorkspace(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/workspaces";
	return client.request("POST", resolved_path, body);
}

inline Response DeleteApiKey(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/keys/" + (path.count("id") ? path.at("id") : std::string{});
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

inline Response DeleteWorkspace(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/workspaces/" + (path.count("id") ? path.at("id") : std::string{});
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

inline Response GetActivityAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/analytics";
	return client.request("GET", resolved_path, body);
}

inline Response GetApiKey(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/keys/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response GetCredits(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/credits";
	return client.request("GET", resolved_path, body);
}

inline Response GetCurrentApiKey(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/key";
	return client.request("GET", resolved_path, body);
}

inline Response GetGeneration(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/generations";
	return client.request("GET", resolved_path, body);
}

inline Response GetHealth(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/health";
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

inline Response GetProviderDerankStatus(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/health/providers/" + (path.count("provider_id") ? path.at("provider_id") : std::string{}) + "/derank";
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

inline Response GetWorkspace(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/workspaces/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("GET", resolved_path, body);
}

inline Response ListApiKeys(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/keys";
	return client.request("GET", resolved_path, body);
}

inline Response ListEndpoints(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/endpoints";
	return client.request("GET", resolved_path, body);
}

inline Response ListFiles(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/files";
	return client.request("GET", resolved_path, body);
}

inline Response ListModels(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/models";
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

inline Response ListVideoModels(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/videos/models";
	return client.request("GET", resolved_path, body);
}

inline Response ListVideoModelsAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/video/generations/models";
	return client.request("GET", resolved_path, body);
}

inline Response ListVideos(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/videos";
	return client.request("GET", resolved_path, body);
}

inline Response ListVideosAlias(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/video/generations";
	return client.request("GET", resolved_path, body);
}

inline Response ListWorkspaces(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/workspaces";
	return client.request("GET", resolved_path, body);
}

inline Response OpenResponsesWebSocket(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/responses/ws";
	return client.request("GET", resolved_path, body);
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

inline Response RetrieveFileContent(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/files/" + (path.count("file_id") ? path.at("file_id") : std::string{}) + "/content";
	return client.request("GET", resolved_path, body);
}

inline Response UpdateApiKey(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/keys/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("PATCH", resolved_path, body);
}

inline Response UpdateWorkspace(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/workspaces/" + (path.count("id") ? path.at("id") : std::string{});
	return client.request("PATCH", resolved_path, body);
}

inline Response UploadFile(Client& client, const std::map<std::string, std::string>& path = {}, const std::string& body = "") {
	const std::string resolved_path = "/files";
	return client.request("POST", resolved_path, body);
}

} // namespace ai_stats::gen
