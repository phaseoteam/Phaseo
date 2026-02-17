<?php
declare(strict_types=1);

namespace AIStats\Gen;

function calculatePricing(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/pricing/calculate";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createAnthropicMessage(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/messages";
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

function createEmbedding(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/embeddings";
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

function createOcr(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/ocr";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createProvisioningKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management/keys";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createProvisioningKeyAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/provisioning/keys";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createProvisioningKeyLegacy(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys";
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

function deleteOAuthClient(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients/{$path["client_id"]}";
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteProvisioningKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management/keys/{$path["id"]}";
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteProvisioningKeyAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/provisioning/keys/{$path["id"]}";
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteVideo(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/{$path["video_id"]}";
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
}

function deleteVideoAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/{$path["video_id"]}";
	return $client->request("DELETE", $resolvedPath, $query, $headers, $body);
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

function getAnalytics(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/analytics";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function getCredits(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/credits";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getGeneration(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/generations";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getMusicGeneration(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/music/generate/{$path["music_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getMusicGenerationAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/music/generations/{$path["music_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getOAuthClient(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients/{$path["client_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getProviderDerankStatus(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/health/providers/{$path["provider_id"]}/derank";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getProvisioningKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management/keys/{$path["id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getProvisioningKeyAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/provisioning/keys/{$path["id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getProvisioningKeyLegacy(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/key";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideo(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/{$path["video_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideoAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/{$path["video_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideoContent(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/{$path["video_id"]}/content";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideoContentAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/video/generations/{$path["video_id"]}/content";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function healthz(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/health";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function invalidateGatewayKeyCache(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys/{$path["id"]}/invalidate";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
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

function listOrganisations(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/organisations";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listPricingModels(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/pricing/models";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listProviders(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/providers";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listProvisioningKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management/keys";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listProvisioningKeysAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/provisioning/keys";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listProvisioningKeysLegacy(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/keys";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function regenerateOAuthClientSecret(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients/{$path["client_id"]}/regenerate-secret";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function retrieveBatch(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/{$path["batch_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatchAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batch/{$path["id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveFile(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/files/{$path["file_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function updateOAuthClient(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/oauth-clients/{$path["client_id"]}";
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateProvisioningKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/management/keys/{$path["id"]}";
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function updateProvisioningKeyAlias(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/provisioning/keys/{$path["id"]}";
	return $client->request("PATCH", $resolvedPath, $query, $headers, $body);
}

function uploadFile(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/files";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}
