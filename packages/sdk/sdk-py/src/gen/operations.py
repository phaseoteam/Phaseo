from __future__ import annotations

from typing import Any, Dict, Optional
from .client import Client
from . import models

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
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/batches"
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


def createProvisioningKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/provisioning/keys"
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


def deleteProvisioningKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/provisioning/keys/{path.get("id", "")}"
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


def getAnalytics(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/analytics"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


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
	resolved_path = "/generation"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def getProvisioningKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/provisioning/keys/{path.get("id", "")}"
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


def healthz(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/healthz"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def listFiles(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/files"
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
	resolved_path = "/models"
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


def listProvisioningKeys(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/provisioning/keys"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveBatch(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/batches/{path.get("batch_id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def retrieveFile(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/files/{path.get("file_id", "")}"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def root(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/"
	return client.request("GET", resolved_path, query=query, headers=headers, body=body)


def updateProvisioningKey(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = f"/provisioning/keys/{path.get("id", "")}"
	return client.request("PATCH", resolved_path, query=query, headers=headers, body=body)


def uploadFile(
	client: Client,
	*,
	path: Optional[Dict[str, Any]] = None,
	query: Optional[Dict[str, Any]] = None,
	headers: Optional[Dict[str, str]] = None,
	body: Optional[Any] = None,
) -> Dict[str, Any]:
	path = path or {}
	resolved_path = "/files"
	return client.request("POST", resolved_path, query=query, headers=headers, body=body)


operations___all__ = ["createAnthropicMessage", "createBatch", "createChatCompletion", "createEmbedding", "createImage", "createImageEdit", "createModeration", "createOcr", "createProvisioningKey", "createResponse", "createSpeech", "createTranscription", "createTranslation", "createVideo", "deleteProvisioningKey", "deleteVideo", "generateMusic", "getActivity", "getAnalytics", "getCredits", "getGeneration", "getProvisioningKey", "getVideo", "getVideoContent", "healthz", "listFiles", "listModels", "listProviders", "listProvisioningKeys", "retrieveBatch", "retrieveFile", "root", "updateProvisioningKey", "uploadFile"]
