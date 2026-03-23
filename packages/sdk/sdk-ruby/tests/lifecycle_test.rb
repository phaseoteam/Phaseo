require "minitest/autorun"
require_relative "../lib/index"

class LifecycleTest < Minitest::Test
  def test_warns_once_per_model
    warnings = []
    logger = lambda do |level, message, _meta|
      warnings << message if level == "warn"
    end

    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      logger: logger,
      lifecycle_resolver: lambda do |model_id|
        {
          model_id: model_id,
          status: "deprecated",
          retirement_date: "2099-01-01T00:00:00Z",
          replacement_model_id: "provider/new-model",
          message: %[ [ai-stats] Model "#{model_id}" is deprecated and scheduled for retirement on 2099-01-01T00:00:00Z. Use "provider/new-model" instead. ].strip
        }
      end
    )

    client.send(:maybe_warn_for_model, "provider/old-model")
    client.send(:maybe_warn_for_model, "provider/old-model")

    assert_equal 1, warnings.length
    assert_includes warnings[0], "provider/new-model"
  end

  def test_warnings_as_errors_for_retired_model
    client = AIStatsSdk::AIStats.new(
      api_key: "test",
      warnings_as_errors: true,
      lifecycle_resolver: lambda do |model_id|
        {
          model_id: model_id,
          status: "retired",
          retirement_date: "2020-01-01T00:00:00Z",
          message: %[ [ai-stats] Model "#{model_id}" is retired as of 2020-01-01T00:00:00Z. ].strip
        }
      end
    )

    error = assert_raises(RuntimeError) do
      client.send(:maybe_warn_for_model, "provider/retired-model")
    end
    assert_includes error.message, "retired"
  end
end
