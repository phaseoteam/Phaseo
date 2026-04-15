from __future__ import annotations

from typing import Any, Dict, Optional
from .client import Client
from . import models

def calculatePricing(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/pricing/calculate"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def cancelBatch(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/batches/{path.get("batch_id", "")}/cancel"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def cancelBatchAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/batch/{path.get("id", "")}/cancel"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def cancelVideo(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/videos/{path.get("video_id", "")}/cancel"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def cancelVideoAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/video/generations/{path.get("video_id", "")}/cancel"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createAnthropicMessage(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/messages"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createBatch(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/batches"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createBatchAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/batch"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createChatCompletion(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/chat/completions"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createEmbedding(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/embeddings"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createImage(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/images/generations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createImageEdit(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/images/edits"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createManagementKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/management/keys"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createModeration(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/moderations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createOcr(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/ocr"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createRerank(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/rerank"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createResponse(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/responses"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createSpeech(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/audio/speech"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createTranscription(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/audio/transcriptions"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createTranslation(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/audio/translations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createVideo(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/videos"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def createVideoAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/video/generations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def deleteManagementKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/management/keys/{path.get("id", "")}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteVideo(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/videos/{path.get("video_id", "")}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def deleteVideoAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/video/generations/{path.get("video_id", "")}"
	return client.request("DELETE", resolved_path, query=query, headers=headers, body=body)


def generateMusic(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/music/generate"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def generateMusicAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/music/generations"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def getActivity(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/activity"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getActivityAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/analytics"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getCredits(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/credits"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getGeneration(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/generations"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getManagementKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/management/keys/{path.get("id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getMusicGeneration(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/music/generate/{path.get("music_id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getMusicGenerationAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/music/generations/{path.get("music_id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getProviderDerankStatus(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/health/providers/{path.get("provider_id", "")}/derank"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getVideo(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/videos/{path.get("video_id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getVideoAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/video/generations/{path.get("video_id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getVideoContent(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/videos/{path.get("video_id", "")}/content"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getVideoContentAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/video/generations/{path.get("video_id", "")}/content"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def healthz(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/health"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def invalidateGatewayKeyCache(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/keys/{path.get("id", "")}/invalidate"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


def listDataModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/data/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listEndpoints(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/endpoints"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listFiles(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/files"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listManagementKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/management/keys"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/gateway/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listOrganisations(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/organisations"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listPricingModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/pricing/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listProviders(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/providers"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listTeamModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/gateway/models/me"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listVideoModels(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/videos/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listVideoModelsAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/video/generations/models"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listVideos(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/videos"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listVideosAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/video/generations"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def openResponsesWebSocket(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/responses/ws"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatch(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/batches/{path.get("batch_id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatchAlias(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/batch/{path.get("id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveFile(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/files/{path.get("file_id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveFileContent(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = f"/files/{path.get("file_id", "")}/content"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def updateManagementKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/management/keys/{path.get("id", "")}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def uploadFile(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Any:
	path = path or {}
	resolved_path = "/files"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


operations___all__ = ["calculatePricing", "cancelBatch", "cancelBatchAlias", "cancelVideo", "cancelVideoAlias", "createAnthropicMessage", "createBatch", "createBatchAlias", "createChatCompletion", "createEmbedding", "createImage", "createImageEdit", "createManagementKey", "createModeration", "createOcr", "createRerank", "createResponse", "createSpeech", "createTranscription", "createTranslation", "createVideo", "createVideoAlias", "deleteManagementKey", "deleteVideo", "deleteVideoAlias", "generateMusic", "generateMusicAlias", "getActivity", "getActivityAlias", "getCredits", "getGeneration", "getManagementKey", "getMusicGeneration", "getMusicGenerationAlias", "getProviderDerankStatus", "getVideo", "getVideoAlias", "getVideoContent", "getVideoContentAlias", "healthz", "invalidateGatewayKeyCache", "listDataModels", "listEndpoints", "listFiles", "listManagementKeys", "listModels", "listOrganisations", "listPricingModels", "listProviders", "listTeamModels", "listVideoModels", "listVideoModelsAlias", "listVideos", "listVideosAlias", "openResponsesWebSocket", "retrieveBatch", "retrieveBatchAlias", "retrieveFile", "retrieveFileContent", "updateManagementKey", "uploadFile"]
