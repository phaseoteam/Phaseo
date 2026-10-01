module PhaseoSdk
  class PageEnumerator
    include Enumerable

    def initialize(limit: 50, offset: 0, &fetch_page)
      @limit = [limit.to_i, 1].max
      @offset = [offset.to_i, 0].max
      @fetch_page = fetch_page
    end

    def each
      return enum_for(:each) unless block_given?
      offset = @offset
      loop do
        page = @fetch_page.call(limit: @limit, offset: offset)
        yield page
        items = page[:data] || page["data"] || []
        has_more = page[:has_more] || page["has_more"]
        break unless has_more && !items.empty?
        offset += items.length
      end
    end
  end

  class JobHandle
    TERMINAL_FAILURES = %w[failed cancelled canceled expired].freeze

    attr_reader :kind, :id

    def initialize(kind:, id:, fetch:, status:)
      raise ArgumentError, "Job ID is required" if id.to_s.strip.empty?
      @kind, @id, @fetch, @status = kind, id, fetch, status
    end

    def refresh = @fetch.call(@id)

    def wait(interval: 1.0, timeout: nil)
      deadline = timeout && Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
      loop do
        value = refresh
        current = @status.call(value).to_s.downcase
        return value if current == "completed"
        raise "#{kind} job #{id} ended with status #{current}" if TERMINAL_FAILURES.include?(current)
        raise "Timed out waiting for Phaseo job" if deadline && Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
        sleep([interval, 0.001].max)
      end
    end
  end
end
