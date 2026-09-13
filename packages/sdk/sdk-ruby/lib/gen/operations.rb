require_relative "client"

module Phaseo
  module Gen
    module Operations
      def self.addGuardrailKeys(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}/keys/add"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.addGuardrailMembers(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}/members/add"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.addWorkspaceMembers(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/members/add"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.applyPresetUpstreamVersion(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/#{URI.encode_uri_component(path["id"].to_s)}/upstream"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.approveWorkspaceJoinRequest(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/join-requests/#{URI.encode_uri_component(path["request_id"].to_s)}/approve"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.calculatePricing(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/pricing/calculate"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.cancelBatch(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/#{URI.encode_uri_component(path["batch_id"].to_s)}/cancel"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.cancelBatchAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/#{URI.encode_uri_component(path["id"].to_s)}/cancel"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.cancelVideo(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{URI.encode_uri_component(path["video_id"].to_s)}/cancel"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.cancelVideoAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{URI.encode_uri_component(path["video_id"].to_s)}/cancel"
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

      def self.createDataContributionClassifier(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/data-contribution/classifiers"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createDynamicRoute(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/routing/dynamic-routes"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createEmbedding(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/embeddings"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createGatewayFeedback(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/feedback"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createGatewayObservabilityEvent(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/events"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createGuardrail(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails"
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

      def self.createManagementKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management-keys"
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

      def self.createObservabilityDestination(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/observability/destinations"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createOcr(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/ocr"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createParse(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/parse"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createPreset(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createPresetTestRun(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/preset-test-runs"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createPrivateModel(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/private-models"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createProviderCredential(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/byok"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createRealtimeSession(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/audio/realtime/sessions"
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
        resolved_path = "/videos/#{URI.encode_uri_component(path["video_id"].to_s)}/download_url"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createVideoDownloadUrlAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{URI.encode_uri_component(path["video_id"].to_s)}/download_url"
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

      def self.createWorkspaceBudget(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/budgets"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createWorkspaceDepartment(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/departments"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createWorkspaceGroupMapping(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/group-mappings"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createWorkspaceInvite(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/invites"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createWorkspaceNotificationDestination(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/destinations"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.createWorkspaceScimToken(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/scim/tokens"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteApiKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteDataContributionClassifier(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/data-contribution/classifiers/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteDynamicRoute(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/routing/dynamic-routes/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteGuardrail(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteManagementKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management-keys/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteOAuthClient(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients/#{URI.encode_uri_component(path["client_id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteObservabilityDestination(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/observability/destinations/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deletePreset(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deletePrivateModel(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/private-models/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteProviderCredential(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/byok/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteVideo(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{URI.encode_uri_component(path["video_id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteVideoAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{URI.encode_uri_component(path["video_id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWebhookEndpoint(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWorkspace(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWorkspaceBudget(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/budgets/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWorkspaceDepartment(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/departments/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWorkspaceDepartmentMember(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/departments/#{URI.encode_uri_component(path["departmentId"].to_s)}/members/#{URI.encode_uri_component(path["userId"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWorkspaceGroupMapping(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/group-mappings/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWorkspaceInvite(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/invites/#{URI.encode_uri_component(path["invite_id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deleteWorkspaceNotificationDestination(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/destinations/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.deployDynamicRouteVersion(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/routing/dynamic-routes/#{URI.encode_uri_component(path["id"].to_s)}/versions/#{URI.encode_uri_component(path["version"].to_s)}/deploy"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.exportAnalyticsCsv(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/analytics/export"
        client.request_bytes(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.finalizeRealtimeSession(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/audio/realtime/sessions/#{URI.encode_uri_component(path["session_id"].to_s)}/finalize"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.forkPreset(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/#{URI.encode_uri_component(path["id"].to_s)}/fork"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
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
        resolved_path = "/keys/#{URI.encode_uri_component(path["id"].to_s)}"
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

      def self.getDataContributionSettings(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/data-contribution"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getDynamicRoute(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/routing/dynamic-routes/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getGatewayRequestLog(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/logs/#{URI.encode_uri_component(path["requestId"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getGeneration(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/generations"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getGuardrail(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getHealth(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/health"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getManagementKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management-keys/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getMusicGeneration(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/music/generate/#{URI.encode_uri_component(path["music_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getMusicGenerationAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/music/generations/#{URI.encode_uri_component(path["music_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getOAuthClient(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients/#{URI.encode_uri_component(path["client_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getObservabilityDestination(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/observability/destinations/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getObservabilityLoggingPolicy(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/observability/logging-policy"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getPreset(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getPresetPublisher(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/publisher"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getPresetTestRun(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/preset-test-runs/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getPrivateModel(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/private-models/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getProviderCredential(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/byok/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getProviderDerankStatus(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/health/providers/#{URI.encode_uri_component(path["provider_id"].to_s)}/derank"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getVideo(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{URI.encode_uri_component(path["video_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getVideoAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{URI.encode_uri_component(path["video_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getVideoContent(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/videos/#{URI.encode_uri_component(path["video_id"].to_s)}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getVideoContentAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/video/generations/#{URI.encode_uri_component(path["video_id"].to_s)}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWebhookEndpoint(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWorkspace(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWorkspaceBudget(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/budgets/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWorkspaceDirectory(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/directory"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWorkspaceNotificationSettings(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/settings"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWorkspaceScim(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/scim"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWorkspaceSettings(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/settings"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getWorkspaceSso(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/sso"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.invalidateApiKeyCache(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys/#{URI.encode_uri_component(path["id"].to_s)}/invalidate"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
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

      def self.listBatches(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchesAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchFiles(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/files"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchFilesAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/files"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchModelsAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchRequests(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/#{URI.encode_uri_component(path["batch_id"].to_s)}/requests"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listBatchRequestsAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/#{URI.encode_uri_component(path["id"].to_s)}/requests"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listDataModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/data/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listDynamicRoutes(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/routing/dynamic-routes"
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

      def self.listGatewayFeedback(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/feedback"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listGatewayObservabilityEvents(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/events"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listGatewayRequestLogs(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/logs"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listGuardrailKeys(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}/keys"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listGuardrailMembers(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}/members"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listGuardrails(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listManagementKeys(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management-keys"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listModelEndpoints(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/models/#{URI.encode_uri_component(path["author"].to_s)}/#{URI.encode_uri_component(path["slug"].to_s)}/endpoints"
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

      def self.listObservabilityDestinations(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/observability/destinations"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listOrganisations(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/organisations"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listPresets(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listPresetTestRuns(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/preset-test-runs"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listPresetVersions(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/#{URI.encode_uri_component(path["id"].to_s)}/versions"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listPricingModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/pricing/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listPrivateModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/private-models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listProviderCredentials(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/byok"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listProviders(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/providers"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listTeamModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/models/me"
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

      def self.listWorkspaceApps(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/apps"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceAuditEvents(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/audit-events"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceBudgets(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/budgets"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceDepartments(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/departments"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceGroupMappings(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/group-mappings"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceInvites(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/invites"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceJoinRequests(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/join-requests"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceMembers(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/members"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceNotificationDestinations(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/destinations"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceNotificationRoutes(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/routes"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaces(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listWorkspaceScimAuditEvents(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/scim/audit"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.mergeWorkspaceApp(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/apps/#{URI.encode_uri_component(path["id"].to_s)}/merge"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.publishPresetVersion(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/#{URI.encode_uri_component(path["id"].to_s)}/versions"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.regenerateOAuthClientSecret(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients/#{URI.encode_uri_component(path["client_id"].to_s)}/regenerate-secret"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.rejectWorkspaceJoinRequest(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/join-requests/#{URI.encode_uri_component(path["request_id"].to_s)}/reject"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.removeGuardrailKeys(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}/keys/remove"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.removeGuardrailMembers(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}/members/remove"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.removeWorkspaceMembers(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/members/remove"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.reorderProviderCredentials(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/byok/reorder"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.replaceDynamicRouteKeys(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/routing/dynamic-routes/#{URI.encode_uri_component(path["id"].to_s)}/keys"
        client.request(method: "PUT", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.replaceGuardrailKeys(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}/keys"
        client.request(method: "PUT", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatch(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/#{URI.encode_uri_component(path["batch_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/files/#{URI.encode_uri_component(path["file_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchFileAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/files/#{URI.encode_uri_component(path["file_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchFileContent(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/files/#{URI.encode_uri_component(path["file_id"].to_s)}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchFileContentAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/files/#{URI.encode_uri_component(path["file_id"].to_s)}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchResults(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/#{URI.encode_uri_component(path["batch_id"].to_s)}/results"
        client.request_bytes(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatchResultsAlias(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batch/#{URI.encode_uri_component(path["id"].to_s)}/results"
        client.request_bytes(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files/#{URI.encode_uri_component(path["file_id"].to_s)}"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveFileContent(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files/#{URI.encode_uri_component(path["file_id"].to_s)}/content"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.revokeWorkspaceScimToken(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/scim/tokens/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "DELETE", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.rotateApiKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys/#{URI.encode_uri_component(path["id"].to_s)}/rotate"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.rotateWebhookEndpointSecret(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints/#{URI.encode_uri_component(path["id"].to_s)}/rotate-secret"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.setWorkspaceDepartmentMember(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/departments/#{URI.encode_uri_component(path["departmentId"].to_s)}/members/#{URI.encode_uri_component(path["userId"].to_s)}"
        client.request(method: "PUT", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.summarizeGatewayFeedback(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/feedback/summary"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.testWorkspaceNotificationDestination(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/destinations/#{URI.encode_uri_component(path["id"].to_s)}/test"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.testWorkspaceNotificationDestinationConfig(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/destinations/test"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateApiKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/keys/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateDataContributionClassifier(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/data-contribution/classifiers/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateDataContributionConsent(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/data-contribution/consent"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateDynamicRoute(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/routing/dynamic-routes/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateGuardrail(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/guardrails/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateManagementKey(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/management-keys/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateOAuthClient(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/oauth-clients/#{URI.encode_uri_component(path["client_id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateObservabilityDestination(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/observability/destinations/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateObservabilityLoggingPolicy(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/observability/logging-policy"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updatePreset(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updatePresetPublisher(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/presets/publisher"
        client.request(method: "PUT", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updatePresetTestRun(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/preset-test-runs/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updatePrivateModel(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/private-models/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateProviderCredential(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/byok/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWebhookEndpoint(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/webhook-endpoints/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspace(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceApp(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/apps/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceBudget(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/budgets/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceDepartment(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/departments/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceDirectoryMember(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/directory/members/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PUT", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceGroupMapping(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/group-mappings/#{URI.encode_uri_component(path["id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceMemberRole(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/workspaces/#{URI.encode_uri_component(path["id"].to_s)}/members/#{URI.encode_uri_component(path["user_id"].to_s)}"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceNotificationRoute(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/routes/#{URI.encode_uri_component(path["eventKind"].to_s)}"
        client.request(method: "PUT", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceNotificationSettings(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/notifications/settings"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceScim(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/scim"
        client.request(method: "PUT", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceSettings(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/settings"
        client.request(method: "PATCH", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.updateWorkspaceSso(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/identity/sso"
        client.request(method: "PUT", path: resolved_path, query: query, headers: headers, body: body)
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
