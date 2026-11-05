package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/tfversion"
)

func TestUsdFromNanosKeepsConfiguredValue(t *testing.T) {
	nanos := int64(100_000_000)
	if got := usdFromNanos(types.Float64Value(0.1), &nanos); got.ValueFloat64() != 0.1 {
		t.Fatalf("expected the configured 0.1 to be kept, got %v", got)
	}
	other := int64(250_000_000)
	if got := usdFromNanos(types.Float64Value(0.1), &other); got.ValueFloat64() != 0.25 {
		t.Fatalf("expected 0.25 from the API, got %v", got)
	}
	if got := usdFromNanos(types.Float64Value(1), nil); !got.IsNull() {
		t.Fatalf("expected null, got %v", got)
	}
}

func TestStringKeepingCase(t *testing.T) {
	lower := "11111111-1111-4111-8111-aaaaaaaaaaaa"
	if got := stringKeepingCase(types.StringValue(strings.ToUpper(lower)), &lower); got.ValueString() != strings.ToUpper(lower) {
		t.Fatalf("expected the configured spelling to be kept, got %v", got)
	}
	if got := stringKeepingCase(types.StringNull(), &lower); got.ValueString() != lower {
		t.Fatalf("expected the API value, got %v", got)
	}
}

func TestSpendRulePayloadClearsUnsetFieldsAndSkipsSpikeDefaults(t *testing.T) {
	ctx := context.Background()
	var diags diag.Diagnostics
	percents, _ := types.SetValueFrom(ctx, types.Int64Type, []int64{100, 50, 80})
	model := spendRuleModel{
		Name:               types.StringValue("Monthly"),
		Enabled:            types.BoolValue(true),
		Metric:             types.StringValue("budget_percent"),
		ScopeType:          types.StringValue("workspace"),
		ScopeID:            types.StringNull(),
		Period:             types.StringValue("month"),
		WindowHours:        types.Int64Null(),
		TimeZone:           types.StringValue("Europe/London"),
		BaseKind:           types.StringValue("amount"),
		BaseRef:            types.StringNull(),
		BaseAmountUSD:      types.Float64Value(100),
		ThresholdPercents:  percents,
		ThresholdAmountUSD: types.Float64Null(),
		RunwayDays:         types.Int64Null(),
		SpikeMultiplier:    types.Float64Unknown(),
		SpikeFloorUSD:      types.Float64Unknown(),
		Action:             types.StringValue("block"),
		BlockAtPercent:     types.Int64Value(120),
		BlockAtAmountUSD:   types.Float64Null(),
		BlockFreeModels:    types.BoolValue(false),
		CooldownMinutes:    types.Int64Value(360),
		DestinationIDs:     types.SetValueMust(types.StringType, nil),
	}
	body := spendRulePayload(ctx, model, &diags)
	if diags.HasError() {
		t.Fatal(diags)
	}
	if body["base_amount_nanos"] != int64(100_000_000_000) {
		t.Fatalf("base amount: %#v", body["base_amount_nanos"])
	}
	if got := fmt.Sprint(body["threshold_percents"]); got != "[50 80 100]" {
		t.Fatalf("thresholds should be sorted, got %s", got)
	}
	for _, field := range []string{"scope_id", "window_hours", "base_ref", "threshold_amount_nanos", "runway_days", "block_at_amount_nanos"} {
		value, ok := body[field]
		if !ok || value != nil {
			t.Fatalf("%s should be sent as null to clear it, got %#v (present %v)", field, value, ok)
		}
	}
	for _, field := range []string{"spike_multiplier", "spike_floor_nanos"} {
		if _, ok := body[field]; ok {
			t.Fatalf("%s should be left to the API default when not configured", field)
		}
	}
	if body["action"] != "block" || body["block_at_percent"] != int64(120) {
		t.Fatalf("action fields: %#v %#v", body["action"], body["block_at_percent"])
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"destination_ids":[]`) {
		t.Fatalf("an empty destination set should be sent as []: %s", encoded)
	}
}

// fakeSpendAPI is a small in-memory version of /v1/spend-rules and /v1/budgets. It applies the
// same defaults as the real API and lowercases scope ids, so the tests catch state drift.
type fakeSpendAPI struct {
	mu      sync.Mutex
	rules   map[string]map[string]any
	budgets map[string]map[string]any
	next    int
	t       *testing.T
}

func newFakeSpendAPI(t *testing.T) *httptest.Server {
	api := &fakeSpendAPI{rules: map[string]map[string]any{}, budgets: map[string]map[string]any{}, t: t}
	return httptest.NewServer(http.HandlerFunc(api.serve))
}

func (a *fakeSpendAPI) id() string {
	a.next++
	return fmt.Sprintf("00000000-0000-4000-8000-%012d", a.next)
}

func (a *fakeSpendAPI) write(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (a *fakeSpendAPI) serve(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if r.Header.Get("Authorization") != "Bearer test-management-key" {
		a.write(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
		return
	}
	var body map[string]any
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/v1/"), "/"), "/")
	switch parts[0] {
	case "spend-rules":
		a.serveRules(w, r, parts, body)
	case "budgets":
		a.serveBudgets(w, r, parts, body)
	default:
		a.write(w, http.StatusNotFound, map[string]any{"error": "not_found"})
	}
}

func (a *fakeSpendAPI) serveRules(w http.ResponseWriter, r *http.Request, parts []string, body map[string]any) {
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			list := []any{}
			for _, rule := range a.rules {
				list = append(list, rule)
			}
			a.write(w, http.StatusOK, map[string]any{"data": list, "max_rules": 50})
		case http.MethodPost:
			rule := map[string]any{
				"id": a.id(), "workspace_id": "workspace-1", "enabled": true, "scope_type": "workspace", "scope_id": nil,
				"window_hours": nil, "time_zone": nil, "base_kind": nil, "base_ref": nil, "base_amount_nanos": nil,
				"threshold_percents": nil, "threshold_amount_nanos": nil, "runway_days": nil, "spike_multiplier": nil,
				"spike_floor_nanos": nil, "action": "notify", "block_at_percent": 110, "block_at_amount_nanos": nil,
				"block_free_models": false, "cooldown_minutes": 360, "destination_ids": []any{}, "evaluated": true,
				"created_by": "user-1", "created_at": "2026-10-21T00:00:00Z",
			}
			a.applyRule(rule, body)
			a.rules[rule["id"].(string)] = rule
			a.write(w, http.StatusCreated, map[string]any{"data": rule})
		}
		return
	}
	rule, ok := a.rules[parts[1]]
	if !ok {
		a.write(w, http.StatusNotFound, map[string]any{"error": "not_found", "message": "Spend rule not found"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		a.write(w, http.StatusOK, map[string]any{"data": rule})
	case http.MethodPatch:
		a.applyRule(rule, body)
		a.write(w, http.StatusOK, map[string]any{"data": rule})
	case http.MethodDelete:
		delete(a.rules, parts[1])
		a.write(w, http.StatusOK, map[string]any{"data": map[string]any{"id": parts[1], "deleted": true}})
	}
}

func (a *fakeSpendAPI) applyRule(rule, body map[string]any) {
	for key, value := range body {
		if strings.HasSuffix(key, "_usd") {
			a.t.Fatalf("the provider should send exact nanos, got %s", key)
		}
		rule[key] = value
	}
	if scopeID, ok := rule["scope_id"].(string); ok {
		rule["scope_id"] = strings.ToLower(scopeID)
	}
	if rule["metric"] == "spike" {
		if rule["spike_multiplier"] == nil {
			rule["spike_multiplier"] = 3
		}
		if rule["spike_floor_nanos"] == nil {
			rule["spike_floor_nanos"] = 5_000_000_000
		}
	} else {
		if _, ok := body["spike_multiplier"]; !ok {
			rule["spike_multiplier"] = nil
		}
		if _, ok := body["spike_floor_nanos"]; !ok {
			rule["spike_floor_nanos"] = nil
		}
	}
	if rule["base_kind"] == "amount" && rule["base_amount_nanos"] == nil {
		a.t.Fatalf("base_amount_nanos is required for an amount base")
	}
	rule["updated_at"] = fmt.Sprintf("2026-10-21T00:00:%02dZ", a.next)
	a.next++
}

func (a *fakeSpendAPI) serveBudgets(w http.ResponseWriter, r *http.Request, parts []string, body map[string]any) {
	if len(parts) == 1 && r.Method == http.MethodPost {
		for _, budget := range a.budgets {
			if budget["interval"] == body["interval"] {
				a.write(w, http.StatusConflict, map[string]any{"error": "conflict", "message": "A budget already exists"})
				return
			}
		}
		budget := map[string]any{"id": a.id(), "workspace_id": "workspace-1", "created_by": "user-1", "created_at": "2026-10-21T00:00:00Z", "usage": 1.25}
		a.applyBudget(budget, body)
		a.budgets[budget["id"].(string)] = budget
		a.write(w, http.StatusCreated, map[string]any{"data": budget})
		return
	}
	if len(parts) == 1 {
		list := []any{}
		for _, budget := range a.budgets {
			list = append(list, budget)
		}
		a.write(w, http.StatusOK, map[string]any{"data": list})
		return
	}
	budget, ok := a.budgets[parts[1]]
	if !ok {
		a.write(w, http.StatusNotFound, map[string]any{"error": "not_found", "message": "Budget not found"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		a.write(w, http.StatusOK, map[string]any{"data": budget})
	case http.MethodPatch:
		a.applyBudget(budget, body)
		a.write(w, http.StatusOK, map[string]any{"data": budget})
	case http.MethodDelete:
		delete(a.budgets, parts[1])
		a.write(w, http.StatusOK, map[string]any{"data": budget})
	}
}

func (a *fakeSpendAPI) applyBudget(budget, body map[string]any) {
	budget["interval"] = body["interval"]
	limit := body["limit"].(float64)
	nanos := int64(limit*1_000_000_000 + 0.5)
	budget["limit"] = float64(nanos) / 1_000_000_000
	budget["limit_nanos"] = nanos
	budget["updated_at"] = fmt.Sprintf("2026-10-21T00:00:%02dZ", a.next)
	a.next++
}

func providerConfig(serverURL string) string {
	return fmt.Sprintf(`
provider "phaseo" {
  api_key  = "test-management-key"
  base_url = %q
}
`, serverURL+"/v1")
}

func TestAccSpendRuleResource(t *testing.T) {
	server := newFakeSpendAPI(t)
	defer server.Close()
	config := providerConfig(server.URL)
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testProviderFactories,
		TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
		Steps: []resource.TestStep{
			{
				Config: config + `
resource "phaseo_spend_rule" "monthly" {
  name               = "Monthly spend"
  metric             = "budget_percent"
  period             = "month"
  base_kind          = "amount"
  base_amount_usd    = 0.1
  threshold_percents = [100, 50, 80]
}
`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "scope_type", "workspace"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "action", "notify"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "block_at_percent", "110"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "cooldown_minutes", "360"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "base_amount_usd", "0.1"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "threshold_percents.#", "3"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "destination_ids.#", "0"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "evaluated", "true"),
					resource.TestCheckNoResourceAttr("phaseo_spend_rule.monthly", "spike_multiplier"),
				),
			},
			{
				ResourceName:      "phaseo_spend_rule.monthly",
				ImportState:       true,
				ImportStateVerify: true,
			},
			{
				// Switch to a key-scoped spend rule that blocks; the base and percentages are cleared.
				Config: config + `
resource "phaseo_spend_rule" "monthly" {
  name                 = "Key spend"
  metric               = "spend"
  scope_type           = "key"
  scope_id             = "11111111-1111-4111-8111-AAAAAAAAAAAA"
  period               = "day"
  time_zone            = "America/New_York"
  threshold_amount_usd = 40
  action               = "block"
  block_at_amount_usd  = 50
  destination_ids      = ["22222222-2222-4222-8222-222222222222"]
}
`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "scope_id", "11111111-1111-4111-8111-AAAAAAAAAAAA"),
					resource.TestCheckNoResourceAttr("phaseo_spend_rule.monthly", "base_kind"),
					resource.TestCheckNoResourceAttr("phaseo_spend_rule.monthly", "threshold_percents"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "block_at_amount_usd", "50"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "destination_ids.#", "1"),
				),
			},
			{
				// Spike rules get the API's multiplier and floor when they are not configured.
				Config: config + `
resource "phaseo_spend_rule" "monthly" {
  name         = "Spike"
  metric       = "spike"
  period       = "rolling"
  window_hours = 3
}
`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "spike_multiplier", "3"),
					resource.TestCheckResourceAttr("phaseo_spend_rule.monthly", "spike_floor_usd", "5"),
					resource.TestCheckNoResourceAttr("phaseo_spend_rule.monthly", "scope_id"),
					resource.TestCheckNoResourceAttr("phaseo_spend_rule.monthly", "block_at_amount_usd"),
				),
			},
		},
	})
}

func TestAccSpendRuleRejectsInvalidMetric(t *testing.T) {
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testProviderFactories,
		TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
		Steps: []resource.TestStep{{
			Config: providerConfig("http://127.0.0.1:1") + `
resource "phaseo_spend_rule" "bad" {
  name   = "Bad"
  metric = "requests"
  period = "day"
}
`,
			ExpectError: regexp.MustCompile(`value must be one of`),
		}},
	})
}

func TestAccWorkspaceBudgetResource(t *testing.T) {
	server := newFakeSpendAPI(t)
	defer server.Close()
	config := providerConfig(server.URL)
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testProviderFactories,
		TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
		Steps: []resource.TestStep{
			{
				Config: config + `
resource "phaseo_workspace_budget" "monthly" {
  interval = "monthly"
  limit    = 500.1
}
data "phaseo_workspace_budgets" "all" {
  depends_on = [phaseo_workspace_budget.monthly]
}
`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_workspace_budget.monthly", "limit", "500.1"),
					resource.TestCheckResourceAttr("phaseo_workspace_budget.monthly", "limit_nanos", "500100000000"),
					resource.TestCheckResourceAttr("phaseo_workspace_budget.monthly", "workspace_id", "workspace-1"),
					resource.TestMatchResourceAttr("data.phaseo_workspace_budgets.all", "json", regexp.MustCompile(`"interval":"monthly"`)),
				),
			},
			{
				ResourceName:      "phaseo_workspace_budget.monthly",
				ImportState:       true,
				ImportStateVerify: true,
			},
			{
				Config: config + `
resource "phaseo_workspace_budget" "monthly" {
  interval = "weekly"
  limit    = 125
}
`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_workspace_budget.monthly", "interval", "weekly"),
					resource.TestCheckResourceAttr("phaseo_workspace_budget.monthly", "limit_nanos", "125000000000"),
				),
			},
		},
	})
}
