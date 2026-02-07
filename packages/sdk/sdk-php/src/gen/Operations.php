<?php
declare(strict_types=1);

namespace AIStats\Gen;

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

function createOcr(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/ocr";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function createProvisioningKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/provisioning/keys";
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

function deleteProvisioningKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
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

function generateMusic(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/music/generate";
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
	$resolvedPath = "/generation";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getProvisioningKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/provisioning/keys/{$path["id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideo(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/{$path["video_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function getVideoContent(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/videos/{$path["video_id"]}/content";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function healthz(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/healthz";
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

function listProviders(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/providers";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function listProvisioningKeys(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/provisioning/keys";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveBatch(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/batches/{$path["batch_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function retrieveFile(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/files/{$path["file_id"]}";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function root(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/";
	return $client->request("GET", $resolvedPath, $query, $headers, $body);
}

function updateProvisioningKey(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
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
