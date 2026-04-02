require_relative "lib/ai_stats_sdk/version"

Gem::Specification.new do |spec|
  spec.name = "ai_stats_sdk"
  spec.version = AIStatsSdk::VERSION
  spec.authors = ["AI Stats"]
  spec.email = ["danielbutler500@gmail.com"]

  spec.summary = "Official AI Stats Gateway SDK for Ruby"
  spec.description = "Ruby client for the AI Stats Gateway API with generated endpoints and typed wrappers."
  spec.homepage = "https://docs.ai-stats.phaseo.app"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.0.0"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = "https://github.com/AI-Stats/AI-Stats"
  spec.metadata["changelog_uri"] = "https://github.com/AI-Stats/AI-Stats/blob/main/packages/sdk/sdk-ruby/CHANGELOG.md"

  spec.files = Dir.glob("{lib,examples,tests}/**/*").select { |f| File.file?(f) }
  spec.files += %w[README.md ai_stats_sdk.gemspec]
  spec.require_paths = ["lib"]
end
