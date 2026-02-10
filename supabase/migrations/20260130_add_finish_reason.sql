-- Add finish_reason column to gateway_requests table
-- This stores our normalized finish reason for consistent analytics

ALTER TABLE public.gateway_requests
ADD COLUMN IF NOT EXISTS finish_reason text;
-- Add index for filtering by finish_reason
CREATE INDEX IF NOT EXISTS idx_gateway_requests_finish_reason
ON public.gateway_requests(team_id, finish_reason, created_at DESC);
-- Add comment explaining the column
COMMENT ON COLUMN public.gateway_requests.finish_reason IS 'Normalized finish reason across all providers (e.g., stop, length, tool_calls, content_filter, error)';
