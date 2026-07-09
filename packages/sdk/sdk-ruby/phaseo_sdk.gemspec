require_relative "lib/phaseo_sdk/version"

Gem::Specification.new do |spec|
  spec.name = "phaseo_sdk"
  spec.version = PhaseoSdk::VERSION
  spec.authors = ["Phaseo"]
  spec.email = ["danielbutler500@gmail.com"]

  spec.summary = "Official Phaseo Gateway SDK for Ruby"
  spec.description = "Ruby client for the Phaseo Gateway API with generated endpoints and typed wrappers."
  spec.homepage = "https://phaseo.app"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.0.0"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = "https://github.com/phaseoteam/Phaseo"
  spec.metadata["changelog_uri"] = "https://github.com/phaseoteam/Phaseo/blob/main/packages/sdk/sdk-ruby/CHANGELOG.md"

  spec.files = Dir.glob("{lib,examples,tests}/**/*").select { |f| File.file?(f) }
  spec.files += %w[README.md phaseo_sdk.gemspec]
  spec.require_paths = ["lib"]
end
