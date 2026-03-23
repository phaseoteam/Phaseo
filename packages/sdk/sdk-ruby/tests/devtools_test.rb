require "minitest/autorun"
require "tmpdir"
require_relative "../lib/index"

class DevtoolsTest < Minitest::Test
  def test_records_responses_entries
    Dir.mktmpdir("ai-stats-devtools-ruby-") do |dir|
      client = AIStatsSdk::AIStats.new(
        api_key: "test",
        enable_deprecation_warnings: false,
        devtools: AIStatsSdk::Devtools.create(enabled: true, directory: dir)
      )

      result = client.send(
        :with_lifecycle_and_telemetry,
        endpoint: "responses",
        payload: { model: "openai/gpt-5-nano", input: "hi" },
        check_lifecycle: false
      ) do
        {
          id: "resp_1",
          model: "openai/gpt-5-nano",
          usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 }
        }
      end

      assert_equal "resp_1", result[:id]

      generations = File.join(dir, "generations.jsonl")
      metadata = File.join(dir, "metadata.json")
      assert File.exist?(generations), "expected generations.jsonl to exist"
      assert File.exist?(metadata), "expected metadata.json to exist"

      content = File.read(generations)
      assert_includes content, "\"type\":\"responses\""
      assert_includes content, "\"sdk\":\"ruby\""
    end
  end
end
