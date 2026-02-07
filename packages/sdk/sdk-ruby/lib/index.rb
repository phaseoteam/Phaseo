require_relative 'gen/api/default_api'
require_relative 'gen/api_client'
require_relative 'gen/configuration'

module AIStatsSdk
  # Thin wrapper around the generated Ruby SDK.
  # Regenerate with: `pnpm openapi:gen:ruby`
  class Client
    def initialize(api_key:, base_path: 'https://api.phaseo.app/v1')
      config = AIStatsSdk::Configuration.default
      config.base_path = base_path
      config.access_token = api_key
      @api = AIStatsSdk::DefaultApi.new(AIStatsSdk::ApiClient.new(config))
    end

    def generate_text(payload)
      @api.create_chat_completion(payload)
    end

    def generate_response(payload)
      @api.create_response(payload)
    end

    def generate_image(payload)
      @api.create_image(payload)
    end

    def generate_image_edit(model:, image:, prompt:, **opts)
      @api.create_image_edit(model, image, prompt, opts[:mask], opts[:size], opts[:n], opts[:user], opts[:meta], opts[:usage])
    end

    def generate_embedding(payload)
      @api.create_embedding(payload)
    end

    def generate_moderation(payload)
      @api.create_moderation(payload)
    end

    def generate_speech(payload)
      @api.create_speech(payload)
    end

    def generate_transcription(model:, audio_url: nil, audio_b64: nil, language: nil)
      @api.create_transcription(model, audio_url, audio_b64, language)
    end

    def generate_translation(model:, audio_url: nil, audio_b64: nil, language: nil, prompt: nil, temperature: nil)
      @api.create_translation(model, audio_url, audio_b64, language, prompt, temperature)
    end

    def list_models(options = {})
      @api.list_models(options)
    end

    def health
      @api.healthz
    end
  end
end
