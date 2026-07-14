require_relative "client"

module AiStats
  module Gen
    module Operations
      def self.calculatePricing(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/pricing/calculate"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.cancelBatch(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/#{path["batch_id"]}/cancel"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.cancelBatchAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/#{path["id"]}/cancel"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.cancelVideo(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{path["video_id"]}/cancel"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.cancelVideoAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{path["video_id"]}/cancel"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createAnthropicMessage(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/messages"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createApiKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createBatch(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createBatchAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createChatCompletion(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/chat/completions"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createEmbedding(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/embeddings"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createImage(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/images/generations"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createImageEdit(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/images/edits"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createModeration(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/moderations"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createOcr(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/ocr"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createRerank(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/rerank"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createResponse(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/responses"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createSpeech(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/audio/speech"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createTranscription(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/audio/transcriptions"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createTranslation(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/audio/translations"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createVideo(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createVideoAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createVideoDownloadUrl(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{path["video_id"]}/download_url"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createVideoDownloadUrlAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{path["video_id"]}/download_url"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createWebhookEndpoint(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createWorkspace(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteApiKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys/#{path["id"]}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteVideo(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{path["video_id"]}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteVideoAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{path["video_id"]}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWebhookEndpoint(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints/#{path["endpoint_id"]}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWorkspace(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{path["id"]}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.generateMusic(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/music/generate"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.generateMusicAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/music/generations"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getActivity(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/activity"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getActivityAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/analytics"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getApiKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys/#{path["id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getCredits(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/credits"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getCurrentApiKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/key"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getGeneration(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/generations"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getHealth(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/health"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getMusicGeneration(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/music/generate/#{path["music_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getMusicGenerationAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/music/generations/#{path["music_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getProviderDerankStatus(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/health/providers/#{path["provider_id"]}/derank"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getVideo(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{path["video_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getVideoAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{path["video_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getVideoContent(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{path["video_id"]}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getVideoContentAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{path["video_id"]}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWebhookEndpoint(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints/#{path["endpoint_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWorkspace(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{path["id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listApiKeys(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchCapabilities(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/capabilities"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchCapabilitiesAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/capabilities"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchRequests(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/#{path["batch_id"]}/requests"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchRequestsAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/#{path["id"]}/requests"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listDataModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/data/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listEndpoints(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/endpoints"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listFiles(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/gateway/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listOrganisations(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/organisations"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listPricingModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/pricing/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listProviders(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/providers"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listTeamModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/gateway/models/me"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listVideoModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listVideoModelsAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listVideos(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listVideosAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWebhookEndpoints(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaces(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.openResponsesWebSocket(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/responses/ws"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatch(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/#{path["batch_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/#{path["id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/files/#{path["file_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchFileAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/files/#{path["file_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchFileContent(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/files/#{path["file_id"]}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchFileContentAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/files/#{path["file_id"]}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files/#{path["file_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveFileContent(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files/#{path["file_id"]}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.rotateWebhookEndpointSecret(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints/#{path["endpoint_id"]}/rotate-secret"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateApiKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys/#{path["id"]}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWebhookEndpoint(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints/#{path["endpoint_id"]}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspace(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{path["id"]}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.uploadBatchFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/files"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.uploadBatchFileAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/files"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.uploadFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

    end
  end
end
