require_relative "client"

module AiStats
  module Gen
    module Operations
      def self.createBatch(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches"
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

      def self.getAnalytics(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/analytics"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.getGeneration(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/generation"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.healthz(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/healthz"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listFiles(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.listModels(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/models"
        client.request(method: "GET", path: resolved_path, query: query, headers: headers, body: body)
      end

      def self.retrieveBatch(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/batches/#{path["batch_id"]}"
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

      def self.uploadFile(client, path: nil, query: nil, headers: nil, body: nil)
        path ||= {}
        resolved_path = "/files"
        client.request(method: "POST", path: resolved_path, query: query, headers: headers, body: body)
      end

    end
  end
end
