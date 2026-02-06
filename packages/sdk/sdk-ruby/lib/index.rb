require_relative "gen/client"
require_relative "gen/operations"
require_relative "gen/models"

module AIStatsSdk
  # Thin wrapper around the custom OAPI generator output.
  class Client
    attr_reader :chat, :responses, :messages, :images, :audio, :moderations, :batches, :files, :models

    def initialize(api_key:, base_path: "https://api.phaseo.app/v1")
      @client = AiStats::Gen::Client.new(
        base_url: base_path,
        headers: { "Authorization" => "Bearer #{api_key}" }
      )
      @chat = ChatResource.new(@client)
      @responses = ResponsesResource.new(@client)
      @messages = MessagesResource.new(@client)
      @images = ImagesResource.new(@client)
      @audio = AudioResource.new(@client)
      @moderations = ModerationsResource.new(@client)
      @batches = BatchesResource.new(@client)
      @files = FilesResource.new(@client)
      @models = ModelsResource.new(@client)
    end

    def generate_text(payload)
      @chat.completions.create(payload)
    end

    def generate_response(payload)
      @responses.create(payload)
    end

    def generate_image(payload)
      @images.generate(payload)
    end

    def generate_image_edit(payload)
      @images.edit(payload)
    end

    def generate_embedding(payload)
      AiStats::Gen::Operations.createEmbedding(@client, body: payload)
    end

    def generate_moderation(payload)
      @moderations.create(payload)
    end

    def generate_speech(payload)
      @audio.speech.create(payload)
    end

    def generate_transcription(payload)
      @audio.transcriptions.create(payload)
    end

    def generate_translation(payload)
      @audio.translations.create(payload)
    end

    def list_models(options = {})
      @models.list(options)
    end

    def health
      AiStats::Gen::Operations.health(@client)
    end
  end

  class ChatCompletionsResource
    def initialize(client)
      @client = client
    end

    def create(payload)
      AiStats::Gen::Operations.createChatCompletion(@client, body: payload)
    end
  end

  class ChatResource
    attr_reader :completions

    def initialize(client)
      @completions = ChatCompletionsResource.new(client)
    end
  end

  class ResponsesResource
    def initialize(client)
      @client = client
    end

    def create(payload)
      AiStats::Gen::Operations.createResponse(@client, body: payload)
    end
  end

  class MessagesResource
    def initialize(client)
      @client = client
    end

    def create(payload)
      AiStats::Gen::Operations.createAnthropicMessage(@client, body: payload)
    end
  end

  class ImagesResource
    def initialize(client)
      @client = client
    end

    def generate(payload)
      AiStats::Gen::Operations.createImage(@client, body: payload)
    end

    def edit(payload)
      AiStats::Gen::Operations.createImageEdit(@client, body: payload)
    end
  end

  class AudioSpeechResource
    def initialize(client)
      @client = client
    end

    def create(payload)
      AiStats::Gen::Operations.createSpeech(@client, body: payload)
    end
  end

  class AudioTranscriptionsResource
    def initialize(client)
      @client = client
    end

    def create(payload)
      AiStats::Gen::Operations.createTranscription(@client, body: payload)
    end
  end

  class AudioTranslationsResource
    def initialize(client)
      @client = client
    end

    def create(payload)
      AiStats::Gen::Operations.createTranslation(@client, body: payload)
    end
  end

  class AudioResource
    attr_reader :speech, :transcriptions, :translations

    def initialize(client)
      @speech = AudioSpeechResource.new(client)
      @transcriptions = AudioTranscriptionsResource.new(client)
      @translations = AudioTranslationsResource.new(client)
    end
  end

  class ModerationsResource
    def initialize(client)
      @client = client
    end

    def create(payload)
      AiStats::Gen::Operations.createModeration(@client, body: payload)
    end
  end

  class BatchesResource
    def initialize(client)
      @client = client
    end

    def create(payload)
      AiStats::Gen::Operations.createBatch(@client, body: payload)
    end

    def retrieve(batch_id)
      AiStats::Gen::Operations.retrieveBatch(@client, path: { "batch_id" => batch_id })
    end
  end

  class FilesResource
    def initialize(client)
      @client = client
    end

    def list
      AiStats::Gen::Operations.listFiles(@client)
    end

    def retrieve(file_id)
      AiStats::Gen::Operations.retrieveFile(@client, path: { "file_id" => file_id })
    end
  end

  class ModelsResource
    def initialize(client)
      @client = client
    end

    def list(options = {})
      AiStats::Gen::Operations.listModels(@client, query: options)
    end
  end
end
