# Internal Audit System

The internal audit system provides comprehensive model management capabilities for administrators.

## Features

### Create Model
**File:** `CreateModelDialog.tsx`
**Action:** `actions.ts` → `createModel()`

Creates new models in the database:
- Model ID (required, unique identifier)
- Display name (required)
- Organization (optional)
- Status, dates, modalities
- Hidden flag
- Button located in page header

### Unified Model Editor
**File:** `UnifiedModelEditor.tsx`
**Actions:** `actions.ts` + `actions-advanced.ts`

A tabbed, mobile-responsive interface providing access to all model configuration in one place:

#### Tab 1: **Basic Info** (`updateModel`)
Edit core model properties:
- Display name
- Release date
- Retirement date
- Status (active, beta, deprecated, retired, preview)
- Hidden flag
- Input/output modalities (click badges to toggle)

#### Tab 2: **Details** (`updateModelDetails`)
Add custom key-value metadata to models:
- Custom properties
- Configuration flags
- Internal notes

#### Tab 3: **Links** (`updateModelLinks`)
Manage external resources:
- Documentation links
- Blog posts
- Research papers
- GitHub repositories
- Pricing pages
- API references

#### Tab 4: **Aliases** (`updateModelAliases`)
Manage alternative model identifiers:
- API aliases
- Legacy names
- Enable/disable aliases individually

#### Tab 5: **Organization** (`updateModelOrganization`)
Change the organization a model belongs to (dropdown auto-populated from database)

#### Tab 6: **Danger Zone**
- **Delete Model** (`deleteModel`): Permanently remove a model and all associated data (requires confirmation)

### Provider Model Management

**Actions:**
- `createProviderModel` - Add a new provider offering for a model
- `updateProviderModel` - Update provider model configuration (active status, modalities, effective dates)
- `deleteProviderModel` - Remove a provider offering

### Benchmark Management

**Actions:**
- `createBenchmarkResult` - Add benchmark scores
- `deleteBenchmarkResult` - Remove benchmark entries

## Data Architecture

### Model Data Flow

```
getAuditModels.ts
├─ Fetches from data_models
├─ Joins with data_organisations
├─ Joins with data_api_provider_models
│  ├─ Includes data_api_providers
│  └─ Includes capabilities
├─ Joins with data_benchmark_results
└─ Aggregates pricing from data_api_pricing_rules
```

### Security

All actions in `actions.ts` and `actions-advanced.ts` include admin authentication:

```typescript
async function checkAdminAuth() {
  // 1. Verify user is logged in
  // 2. Check user has admin role in users table
  // 3. Return authorized status + supabase client
}
```

Unauthorized requests return `{ success: false, error: "Unauthorized" }`

## UI Components

### AuditDataTable
**Location:** `apps/web/src/components/monitor/AuditDataTable.tsx`

Features:
- Sortable columns (model name, release date, providers, benchmarks, etc.)
- Advanced filtering:
  - Gateway status (active/inactive)
  - Benchmark availability
  - Release date comparisons
  - Provider count filtering
  - Pricing rules count
- Pagination (50 items per page)
- Search by model ID or name
- Actions dropdown (three-dot menu):
  - **Edit Model** - Opens unified editor with all configuration options
  - View model pages
  - View pricing
  - View benchmarks
  - View availability

### AuditFiltersWrapper
**Location:** `apps/web/src/components/monitor/AuditFiltersWrapper.tsx`

Client-side wrapper providing URL state management for filters using `nuqs`.

### AuditFilters
**Location:** `apps/web/src/components/monitor/AuditFilters.tsx`

Filter controls:
- Search input
- Gateway status toggle
- Benchmark availability toggle
- Release date comparison
- Provider count comparison
- Pricing rules count comparison
- Hidden models toggle

## Cache Management

Both basic and advanced actions invalidate relevant cache tags:

```typescript
revalidateTag("audit-models");           // Main audit view
revalidateTag("data:models");            // General model data
revalidateTag(`data:models:${modelId}`); // Specific model
revalidateTag(`model:benchmarks:highlights:${modelId}`); // Benchmark highlights
revalidateTag(`model:benchmarks:table:${modelId}`); // Benchmark table
revalidateTag(`model:benchmarks:comparisons:${modelId}`); // Benchmark comparisons
```

## Mobile Responsiveness

The audit system is fully responsive:

**Page Layout:**
- Responsive margins and padding
- Header stacks vertically on mobile
- Create button full-width on small screens

**Dialogs (Create & Edit):**
- Width: 95vw on mobile, full width on larger screens
- Tabs: 3 columns on mobile (2 rows), 6 columns on desktop
- Font sizes: Smaller on mobile, standard on desktop
- Organization tab shows "Org" label on mobile to save space
- Danger tab shows warning emoji (⚠️) on mobile
- Buttons stack vertically on mobile

**Data Table:**
- Horizontal scroll for many columns
- Sticky first column (Actions) for easy access while scrolling
- Touch-friendly dropdown menus
- Badge wrapping for modalities

## Access

The audit page is admin-only. Non-admin users are redirected to the homepage.

**URL:** `/internal/audit`

## Development

### Adding New Audit Features

1. **Create server action** in `actions.ts` or `actions-advanced.ts`
   - Add admin auth check
   - Implement database operation
   - Invalidate relevant caches

2. **Add UI** to `UnifiedModelEditor.tsx`
   - Create new tab in the Tabs component (or add to existing tab)
   - Add form controls and state management
   - Wire up save handler to server action

3. **Test**
   - Verify admin auth works
   - Check database updates
   - Confirm cache invalidation
   - Test error handling
   - Verify tab navigation works

### Testing Checklist

- [ ] Admin user can access all features
- [ ] Non-admin user is blocked
- [ ] Successful updates refresh the page
- [ ] Error messages display correctly
- [ ] Cache invalidation works
- [ ] Delete confirmation prevents accidents
- [ ] Organization dropdown loads correctly
- [ ] All modality options are available

## Future Enhancements

Potential additions:
- Load existing details/links/aliases when opening dialog
- Bulk operations (multi-select + batch update)
- Import/export model configurations
- Audit log of changes
- Undo/redo functionality
- Model duplication
- Batch provider model creation
- Advanced benchmark import
