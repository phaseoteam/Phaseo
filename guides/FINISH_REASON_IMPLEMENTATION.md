# Finish Reason Implementation Guide

## Overview
This document describes the finish_reason logging implementation for the AI Stats Gateway.

## Architecture

### 1. Database (Supabase)
- **Column**: `gateway_requests.finish_reason` (text)
- **Stores**: Normalized finish_reason for consistent analytics
- **Values**: `stop`, `length`, `tool_calls`, `content_filter`, `error`, `timeout`, `cancel`, `recitation`, `safety`, `other`, `null`

### 2. Observability (Axiom)
- **Fields**: Both `native_finish_reason` (string from provider) AND `finish_reason` (normalized)
- **Purpose**: Preserve raw provider data for debugging while enabling cross-provider analytics

## Implementation

### Migration
```sql
-- File: supabase/migrations/20260130_add_finish_reason.sql
ALTER TABLE public.gateway_requests
ADD COLUMN IF NOT EXISTS finish_reason text;

CREATE INDEX IF NOT EXISTS idx_gateway_requests_finish_reason
ON public.gateway_requests(team_id, finish_reason, created_at DESC);
```

### Normalization Function
File: `apps/api/src/pipeline/audit/normalize-finish-reason.ts`

Maps provider-specific values to canonical values:
- OpenAI: `stop` → `stop`, `length` → `length`, `tool_calls` → `tool_calls`
- Anthropic: `end_turn` → `stop`, `max_tokens` → `length`, `tool_use` → `tool_calls`
- Google: `STOP` → `stop`, `MAX_TOKENS` → `length`, `SAFETY` → `safety`
- Mistral, Cohere, AI21, Minimax, Moonshot, Z.AI, Xiaomi, X.AI: Similar mappings

### Code Updates Required

#### 1. Update `buildSupaRow` in `audit/index.ts`
Add finish_reason parameter and field:

```typescript
function buildSupaRow(args: {
    // ... existing params ...
    finishReason?: string | null;  // ADD THIS
}) {
    return {
        // ... existing fields ...
        finish_reason: args.finishReason ?? null,  // ADD THIS
    };
}
```

#### 2. Update `auditSuccess` in `audit/index.ts`
Normalize finish_reason before storing:

```typescript
import { normalizeFinishReason } from './normalize-finish-reason';

export async function auditSuccess(args: {
    // ... existing params ...
    finishReason?: string | null;
}) {
    // ... existing code ...

    // Normalize finish_reason
    const normalizedFinishReason = normalizeFinishReason(
        args.finishReason,
        args.provider
    );

    const row = buildSupaRow({
        // ... existing params ...
        finishReason: normalizedFinishReason,  // CHANGED: use normalized
    });

    // ... Supabase insert ...

    // Axiom: Send BOTH native and normalized
    await sendAxiomEvent({
        // ... existing params ...
        nativeFinishReason: args.finishReason ?? null,  // ADD: raw from provider
        finishReason: normalizedFinishReason,            // CHANGED: normalized
    });
}
```

#### 3. Update `AxiomArgs` type in `audit/axiom.ts`
Add native_finish_reason field:

```typescript
export type AxiomArgs = {
    // ... existing fields ...

    // Completion
    nativeFinishReason?: string | null;  // ADD: Raw provider value
    finishReason?: string | null;         // KEEP: Normalized value

    // ... rest of fields ...
};
```

#### 4. Update `buildAxiomEvent` in `audit/axiom.ts`
Include both fields in the event:

```typescript
export function buildAxiomEvent(a: AxiomArgs) {
    return {
        // ... existing fields ...
        native_finish_reason: a.nativeFinishReason ?? null,  // ADD
        finish_reason: a.finishReason ?? null,                // KEEP
        // ... rest of fields ...
    };
}
```

## Testing

### 1. Run Migration
```bash
# Apply migration to Supabase
supabase db push
```

### 2. Test Provider Normalization
Create test requests with different providers and verify:
- OpenAI `stop` → Supabase: `stop`, Axiom: native=`stop`, normalized=`stop`
- Anthropic `end_turn` → Supabase: `stop`, Axiom: native=`end_turn`, normalized=`stop`
- Google `MAX_TOKENS` → Supabase: `length`, Axiom: native=`MAX_TOKENS`, normalized=`length`

### 3. Query Analytics
```sql
-- Count requests by finish reason
SELECT finish_reason, COUNT(*)
FROM gateway_requests
WHERE team_id = '...'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY finish_reason
ORDER BY COUNT(*) DESC;
```

### 4. Axiom Queries
```
// Compare providers by finish reason distribution
dataset('gateway-requests')
| where _time > ago(7d)
| summarize count() by provider, finish_reason
| render barchart

// Debug specific finish reasons
dataset('gateway-requests')
| where finish_reason == "other"
| project _time, provider, model, native_finish_reason, finish_reason
| limit 100
```

## Benefits

1. **Consistent Analytics**: Query finish_reason without provider-specific logic
2. **Debug Capability**: Access raw provider values when needed
3. **Cross-Provider Insights**: Compare completion patterns across providers
4. **Future-Proof**: Easy to add new providers by extending normalization function

## Rollout Plan

1. ✅ Create migration file
2. ⏳ Update normalization function
3. ⏳ Update audit/index.ts (buildSupaRow, auditSuccess)
4. ⏳ Update audit/axiom.ts (AxiomArgs, buildAxiomEvent)
5. ⏳ Deploy to staging
6. ⏳ Test with real requests
7. ⏳ Deploy to production
8. ⏳ Backfill existing data (optional)
