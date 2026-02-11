require_relative "gen/client"
require_relative "gen/models"
require_relative "gen/operations"

module AIStatsSdk
  # Thin wrapper around the in-house generated Ruby SDK.
  # Regenerate with: `pnpm openapi:gen:ruby`
  class Client
    def initialize(api_key:, base_path: "https://api.phaseo.app/v1")
      @client = AiStats::Gen::Client.new(
        base_url: base_path,
        headers: { "Authorization" => "Bearer #{api_key}" }
      )
    end

    def generate_text(payload)
      AiStats::Gen::Operations.createChatCompletion(@client, body: payload)
    end

    def generate_response(payload)
      AiStats::Gen::Operations.createResponse(@client, body: payload)
    end

    def generate_image(payload)
      AiStats::Gen::Operations.createImage(@client, body: payload)
    end

    def generate_image_edit(payload)
      AiStats::Gen::Operations.createImageEdit(@client, body: payload)
    end

    def generate_embedding(payload)
      AiStats::Gen::Operations.createEmbedding(@client, body: payload)
    end

    def generate_moderation(payload)
      AiStats::Gen::Operations.createModeration(@client, body: payload)
    end

    def generate_speech(payload)
      AiStats::Gen::Operations.createSpeech(@client, body: payload)
    end

    def generate_transcription(payload)
      AiStats::Gen::Operations.createTranscription(@client, body: payload)
    end

    def generate_translation(payload)
      AiStats::Gen::Operations.createTranslation(@client, body: payload)
    end

    def list_models(options = {})
      AiStats::Gen::Operations.listModels(@client, query: options)
    end

    def health
      AiStats::Gen::Operations.healthz(@client)
    end
  end
end
