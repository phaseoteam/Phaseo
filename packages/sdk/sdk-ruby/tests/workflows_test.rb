require_relative "../lib/index"

offsets = []
pages = PhaseoSdk::PageEnumerator.new(limit: 2) do |limit:, offset:|
  offsets << offset
  offset.zero? ? { data: [1, 2], has_more: true } : { data: [3], has_more: false }
end
raise "pagination failed" unless pages.flat_map { |page| page[:data] } == [1, 2, 3]
raise "offset failed" unless offsets == [0, 2]

statuses = %w[running completed]
job = PhaseoSdk::JobHandle.new(kind: "video", id: "video_1", fetch: ->(_) { { status: statuses.shift } }, status: ->(value) { value[:status] })
raise "job wait failed" unless job.wait(interval: 0.001, timeout: 1)[:status] == "completed"
puts "workflows ok"
