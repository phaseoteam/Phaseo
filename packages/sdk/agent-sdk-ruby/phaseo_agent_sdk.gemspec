Gem::Specification.new do |spec|
  spec.name          = "phaseo_agent_sdk"
  spec.version       = "0.3.0"
  spec.summary       = "Ruby agent SDK for Phaseo Gateway"
  spec.authors       = ["Phaseo"]
  spec.homepage      = "https://phaseo.app"
  spec.license       = "MIT"
  spec.required_ruby_version = ">= 3.2"
  spec.metadata = {
    "source_code_uri" => "https://github.com/phaseoteam/Phaseo/tree/main/packages/sdk/agent-sdk-ruby",
    "documentation_uri" => "https://docs.phaseo.app/v1/sdk-reference/ruby/agent-sdk"
  }
  spec.add_runtime_dependency "phaseo_sdk", ">= 3.1.0", "< 4.0.0"
  spec.files         = Dir["lib/**/*.rb", "README.md"]
  spec.require_paths = ["lib"]
end
