require_relative "client"

module AiStats
  module Gen
    module Operations
      def self.calculatePricing(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/pricing/calculate"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createAnthropicMessage(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/messages"
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

      def self.createKeyPlaceholder(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createModeration(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/moderations"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createOAuthClient(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createOcr(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/ocr"
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

      def self.deleteOAuthClient(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients/#{path["client_id"]}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteProvisioningKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management/keys/#{path["id"]}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteProvisioningKeyAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/provisioning/keys/#{path["id"]}"
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

      def self.getAnalytics(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/analytics"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getCredits(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/credits"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getGeneration(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/generations"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getKeyPlaceholder(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/key"
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

      def self.getOAuthClient(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients/#{path["client_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getProviderDerankStatus(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/health/providers/#{path["provider_id"]}/derank"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getProvisioningKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management/keys/#{path["id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getProvisioningKeyAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/provisioning/keys/#{path["id"]}"
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

      def self.healthz(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/health"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.invalidateGatewayKeyCache(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys/#{path["id"]}/invalidate"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listEndpointsPlaceholder(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/endpoints"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listFiles(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listKeysPlaceholder(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listOAuthClients(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients"
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

      def self.listProvisioningKeys(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management/keys"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listProvisioningKeysAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/provisioning/keys"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.regenerateOAuthClientSecret(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients/#{path["client_id"]}/regenerate-secret"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
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

      def self.retrieveFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files/#{path["file_id"]}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.root(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateOAuthClient(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients/#{path["client_id"]}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateProvisioningKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management/keys/#{path["id"]}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateProvisioningKeyAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/provisioning/keys/#{path["id"]}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.uploadFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

    end
  end
end
