-- Phaseo MCP is permanently read-only. These tables supported the retired
-- MCP action-approval and secret-reveal workflows. Production was verified
-- empty before this forward-only cleanup migration.

drop table if exists public.mcp_secret_reveals;
drop table if exists public.mcp_action_audit_events;
drop table if exists public.mcp_action_approvals;
