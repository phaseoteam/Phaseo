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
    DEFAULT_AUDIO_FILENAME = "audio.mp3"
    DEFAULT_UPLOAD_FILENAME = "upload"
    # The gateway parses these form fields from one JSON string.
    JSON_FIELDS = %w[
      provider debug include timestamp_granularities chunking_strategy languages keywords context_bias
    ].freeze

    module_function

    # Reads a file input into [bytes, filename]. Accepts a Pathname (read from disk), an IO-like
    # object that responds to #read (a File's path names the part), or a String of raw content.
    # Strings are always content, never paths: pass Pathname("audio.mp3") or File.open(...) for a file.
    def read_file(value, filename = nil)
      if value.is_a?(Pathname)
        [File.binread(value.to_s), filename || value.basename.to_s]
      elsif value.respond_to?(:read)
        name = value.respond_to?(:path) && value.path ? File.basename(value.path.to_s) : nil
        [value.read.to_s.b, filename || name]
      elsif value.is_a?(String)
        [value.b, filename]
      else
        raise ArgumentError, "file must be a Pathname, an IO (responds to #read) or a String of bytes"
      end
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

    # Builds the multipart body for an audio request from a payload Hash whose "file" key holds the
    # audio. "filename" (its extension names the format; defaults to the file's name, then
    # audio.mp3) and "content_type" are taken out of the payload and not sent as fields.
    def audio_body(payload)
      fields = payload.dup
      file = fields.delete("file")
      filename = fields.delete("filename")
      content_type = fields.delete("content_type")
      bytes, name = read_file(file, filename)
      name = DEFAULT_AUDIO_FILENAME if name.nil? || name.empty?
      content_type ||= AUDIO_CONTENT_TYPES.fetch(File.extname(name).downcase, "application/octet-stream")
      encode(fields: self.fields(fields), file_bytes: bytes, filename: name, content_type: content_type)
    end

    # Percent-encodes quotes and line breaks in a Content-Disposition value, as browsers do.
    def escape(value)
      value.to_s.gsub("\"", "%22").gsub("\r", "%0D").gsub("\n", "%0A")
    end
  end
end
