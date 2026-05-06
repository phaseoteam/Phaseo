require "minitest/autorun"
require_relative "../lib/index"

class AsyncJobsTest < Minitest::Test
  def test_async_jobs_resource_builds_expected_url
    client = AIStatsSdk::AIStats.new(api_key: "test", enable_deprecation_warnings: false)

    assert_equal(
      "wss://api.phaseo.app/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
      client.async_jobs.websocket_url("video", "video 123", interval_ms: 1500, close_on_terminal: false)
    )
  end
end
