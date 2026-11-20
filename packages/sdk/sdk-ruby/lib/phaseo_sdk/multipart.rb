require "json"
require "pathname"
require "securerandom"
require_relative "../gen/client"

module PhaseoSdk
  # Builds multipart/form-data bodies for file endpoints (audio transcriptions and translations,
  # batch file uploads) using only the standard library.
  module Multipart
    AUDIO_CONTENT_TYPES = {
      ".flac" => "audio/flac",
      ".mp3" => "audio/mpeg",
      ".mp4" => "audio/mp4",
      ".mpeg" => "audio/mpeg",
      ".mpga" => "audio/mpeg",
      ".m4a" => "audio/mp4",
      ".ogg" => "audio/ogg",
      ".wav" => "audio/wav",
      ".webm" => "audio/webm"
    }.freeze
    DEFAULT_CONTENT_TYPE = "application/octet-stream"
    # The gateway parses these form fields from one JSON string.
    JSON_FIELDS = %w[
      provider debug include timestamp_granularities chunking_strategy languages keywords context_bias
    ].freeze

    module_function

    # Resolves a file value into [bytes, filename, content_type]. A file value is one of:
    # - a Hash { file_name:, content:, content_type: } (String or Symbol keys): file_name is required,
    #   content is a binary String or an IO, content_type is optional;
    # - a Pathname, read from disk and named by its basename;
    # - an IO (responds to #read), named by +filename+ or else by its own #path (a File has one).
    # A plain String is rejected because it could be either bytes or a path.
    #
    # +filename+ and +content_type+ come from the request's sibling "filename" and "content_type"
    # keys. With no filename at all this raises, because the gateway reads the format from the file
    # extension. The content type is the explicit one, else looked up from the filename extension,
    # else application/octet-stream.
    def resolve_file(value, filename: nil, content_type: nil)
      filename = present(filename)
      explicit_type = present(content_type)
      if value.is_a?(Hash)
        bytes, name, object_type = read_file_object(value)
        explicit_type = object_type || explicit_type
      elsif value.is_a?(Pathname)
        bytes = File.binread(value.to_s)
        name = value.basename.to_s
      elsif value.is_a?(String)
        raise ArgumentError,
              "file must not be a plain String (it could be bytes or a path): pass Pathname.new(\"audio.mp3\") " \
              "for a file on disk, or { file_name: \"audio.mp3\", content: bytes } for bytes in memory"
      elsif value.respond_to?(:read)
        bytes = value.read.to_s.b
        name = filename || io_name(value)
      else
        raise ArgumentError,
              "file must be a Pathname, an IO (responds to #read) or a Hash { file_name:, content:, content_type: }"
      end
      if name.nil?
        raise ArgumentError,
              "file has no filename: pass \"filename\" (for example \"audio.mp3\") with the file, " \
              "because the gateway reads the audio format from its extension"
      end
      [bytes, name, explicit_type || content_type_for(name)]
    end

    # Looks up a content type from the filename extension.
    def content_type_for(filename)
      AUDIO_CONTENT_TYPES.fetch(File.extname(filename.to_s).downcase, DEFAULT_CONTENT_TYPE)
    end

    def read_file_object(value)
      name = present(hash_value(value, "file_name"))
      if name.nil?
        raise ArgumentError, "file Hash needs a file_name, for example { file_name: \"audio.mp3\", content: bytes }"
      end

      content = hash_value(value, "content")
      bytes =
        if content.is_a?(String)
          content.b
        elsif content.respond_to?(:read)
          content.read.to_s.b
        else
          raise ArgumentError, "file Hash content must be a binary String or an IO"
        end
      [bytes, name, present(hash_value(value, "content_type"))]
    end

    def hash_value(hash, key)
      hash.key?(key) ? hash[key] : hash[key.to_sym]
    end

    def io_name(io)
      return nil unless io.respond_to?(:path)

      path = io.path
      path.nil? || path.to_s.empty? ? nil : File.basename(path.to_s)
    end

    def present(value)
      return nil if value.nil?

      text = value.to_s
      text.empty? ? nil : text
    end

    # Converts a non-file field value to the string the gateway expects: booleans lowercase,
    # Hashes and Arrays as one JSON string.
    def field_value(value)
      case value
      when true then "true"
      when false then "false"
      when Hash, Array then JSON.generate(value)
      else value.to_s
      end
    end

    # Returns [[name, string_value], ...] for form fields, skipping nils. Arrays the gateway does not
    # read as JSON repeat the field once per item.
    def fields(payload)
      payload.each_with_object([]) do |(name, value), out|
        next if value.nil?
        key = name.to_s
        if value.is_a?(Array) && !JSON_FIELDS.include?(key)
          value.each { |item| out << [key, field_value(item)] }
        else
          out << [key, field_value(value)]
        end
      end
    end

    # Encodes fields and one file part. Returns a Phaseo::Gen::RawBody.
    def encode(fields:, file_bytes:, filename:, content_type:, file_field: "file")
      boundary = "----PhaseoBoundary#{SecureRandom.hex(16)}"
      body = String.new(encoding: Encoding::BINARY)
      fields.each do |name, value|
        body << "--#{boundary}\r\n".b
        body << "Content-Disposition: form-data; name=\"#{escape(name)}\"\r\n\r\n".b
        body << value.to_s.b
        body << "\r\n".b
      end
      body << "--#{boundary}\r\n".b
      body << "Content-Disposition: form-data; name=\"#{escape(file_field)}\"; filename=\"#{escape(filename)}\"\r\n".b
      body << "Content-Type: #{content_type}\r\n\r\n".b
      body << file_bytes.b
      body << "\r\n--#{boundary}--\r\n".b
      ::Phaseo::Gen::RawBody.new("multipart/form-data; boundary=#{boundary}", body)
    end

    # Builds a multipart body from a payload Hash whose "file" key holds the file (see resolve_file).
    # "filename" and "content_type" are taken out of the payload and not sent as fields.
    def file_body(payload)
      fields = payload.dup
      file = fields.delete("file")
      bytes, name, type = resolve_file(file, filename: fields.delete("filename"), content_type: fields.delete("content_type"))
      encode(fields: self.fields(fields), file_bytes: bytes, filename: name, content_type: type)
    end

    # Builds the multipart body for an audio request (transcription or translation).
    def audio_body(payload)
      file_body(payload)
    end

    # Percent-encodes quotes and line breaks in a Content-Disposition value, as browsers do.
    def escape(value)
      value.to_s.gsub("\"", "%22").gsub("\r", "%0D").gsub("\n", "%0A")
    end
  end
end
