<?php
declare(strict_types=1);

namespace AIStats\Gen;

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

function getAnalytics(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/analytics";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}

function getGeneration(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/generation";
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

function uploadFile(Client $client, ?array $path = null, ?array $query = null, ?array $headers = null, $body = null)
{
	$path = $path ?? [];
	$resolvedPath = "/files";
	return $client->request("POST", $resolvedPath, $query, $headers, $body);
}
