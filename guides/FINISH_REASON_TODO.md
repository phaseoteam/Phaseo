# Finish Reason - Remaining Updates

## ✅ Completed
1. Created migration file: `supabase/migrations/20260130_add_finish_reason.sql`
2. Created normalization function: `apps/api/src/pipeline/audit/normalize-finish-reason.ts`
3. Updated `buildSupaRow` in `audit/index.ts` to accept and store `finishReason`
4. Added import for `normalizeFinishReason` in `audit/index.ts`

## ⏳ TODO - Apply these changes:

### 1. Update `auditSuccess` in `apps/api/src/pipeline/audit/index.ts`

Find this line (around line 135):
```typescript
const row = buildSupaRow({
```

ADD `finishReason` parameter with normalization before the row is built (around line 134):
```typescript
const normalizedFinishReason = normalizeFinishReason(args.finishReason ?? null, args.provider);

const row = buildSupaRow({
    requestId: args.requestId,
    teamId: args.teamId,
    // ... other params ...
    finishReason: normalizedFinishReason,  // ADD THIS
    edgeColo: args.edgeColo ?? null,
```

Then update the Axiom call (around line 213):
```typescript
finishReason: normalizedFinishReason,  // CHANGE: was args.finishReason
```

ADD before finishReason in Axiom call:
```typescript
nativeFinishReason: args.finishReason ?? null,  // ADD: raw provider value
finishReason: normalizedFinishReason,
```

### 2. Update `AxiomArgs` type in `apps/api/src/pipeline/audit/axiom.ts`

Find line 87:
```typescript
// Completion
finishReason?: string | null;
```

CHANGE TO:
```typescript
// Completion
nativeFinishReason?: string | null;  // Raw provider value for debugging
finishReason?: string | null;         // Normalized value for analytics
```

### 3. Update `buildAxiomEvent` in `apps/api/src/pipeline/audit/axiom.ts`

Find where fields are mapped in the returned object and add both fields:
```typescript
native_finish_reason: a.nativeFinishReason ?? null,
finish_reason: a.finishReason ?? null,
```

## Testing

After applying these changes:

1. **Run migration**:
```bash
cd supabase
supabase db push
```

2. **Make a test request** through the gateway

3. **Check Supabase**:
```sql
SELECT request_id, provider, model_id, finish_reason
FROM gateway_requests
ORDER BY created_at DESC
LIMIT 10;
```

4. **Check Axiom** (if configured):
Look for both `native_finish_reason` and `finish_reason` fields in events

## Expected Behavior

- OpenAI with `finish_reason: "stop"` → DB: `stop`, Axiom: native=`stop`, normalized=`stop`
- Anthropic with `finish_reason: "end_turn"` → DB: `stop`, Axiom: native=`end_turn`, normalized=`stop`
- Google with `finish_reason: "MAX_TOKENS"` → DB: `length`, Axiom: native=`MAX_TOKENS`, normalized=`length`
