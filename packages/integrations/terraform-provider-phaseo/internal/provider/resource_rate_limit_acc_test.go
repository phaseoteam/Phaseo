package provider

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/tfversion"
)

// A minimal in-memory /v1/rate-limits and /v1/department-budgets API.
func rateLimitTestServer(t *testing.T) (*httptest.Server, *[]string) {
	var mu sync.Mutex
	records := map[string]map[string]any{}
	var log []string
	next := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if r.Header.Get("Authorization") != "Bearer test-management-key" {
			t.Fatalf("missing provider authorization header")
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		log = append(log, r.Method+" "+r.URL.Path)
		path := strings.TrimPrefix(r.URL.Path, "/v1/")
		parts := strings.Split(path, "/")
		collection := strings.Join(parts[:len(parts)-1], "/")
		id := parts[len(parts)-1]
		w.Header().Set("Content-Type", "application/json")
		write := func(status int, value any) {
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]any{"data": value})
		}
		switch r.Method {
		case http.MethodPost:
			next++
			record := map[string]any{"id": fmt.Sprintf("00000000-0000-4000-8000-%012d", next), "created_at": "2026-10-23T00:00:00Z", "updated_at": "2026-10-23T00:00:00Z", "fail_closed": false}
			for key, value := range body {
				record[key] = value
			}
			records[path+"/"+record["id"].(string)] = record
			write(http.StatusCreated, record)
		case http.MethodGet, http.MethodPatch, http.MethodDelete:
			record, ok := records[collection+"/"+id]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":"not_found"}`))
				return
			}
			if r.Method == http.MethodPatch {
				for key, value := range body {
					record[key] = value
				}
			}
			if r.Method == http.MethodDelete {
				delete(records, collection+"/"+id)
			}
			write(http.StatusOK, record)
		}
	}))
	return server, &log
}

func TestAccRateLimitPolicyAssignmentAndDepartmentBudget(t *testing.T) {
	server, log := rateLimitTestServer(t)
	defer server.Close()
	config := func(rpm string, failClosed bool, limit float64) string {
		return fmt.Sprintf(`
provider "phaseo" {
  api_key  = "test-management-key"
  base_url = %q
}
resource "phaseo_rate_limit_policy" "standard" {
  name                = "Standard"
  %s
  concurrent_requests = 4
  fail_closed         = %t
}
resource "phaseo_rate_limit_assignment" "default" {
  policy_id   = phaseo_rate_limit_policy.standard.id
  target_type = "end_user_default"
}
resource "phaseo_department_budget" "research" {
  department_id = "00000000-0000-4000-8000-0000000000d1"
  interval      = "monthly"
  limit         = %g
}
`, server.URL+"/v1", rpm, failClosed, limit)
	}
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testProviderFactories,
		TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
		Steps: []resource.TestStep{
			{
				Config: config(`requests_per_minute = 60`, false, 250),
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_rate_limit_policy.standard", "requests_per_minute", "60"),
					resource.TestCheckResourceAttr("phaseo_rate_limit_policy.standard", "concurrent_requests", "4"),
					resource.TestCheckNoResourceAttr("phaseo_rate_limit_policy.standard", "tokens_per_minute"),
					resource.TestCheckResourceAttrPair("phaseo_rate_limit_assignment.default", "policy_id", "phaseo_rate_limit_policy.standard", "id"),
					resource.TestCheckNoResourceAttr("phaseo_rate_limit_assignment.default", "target_id"),
					resource.TestCheckResourceAttr("phaseo_department_budget.research", "limit", "250"),
				),
			},
			{
				// Removing requests_per_minute sends null, and strict mode is switched on in place.
				Config: config(``, true, 300),
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckNoResourceAttr("phaseo_rate_limit_policy.standard", "requests_per_minute"),
					resource.TestCheckResourceAttr("phaseo_rate_limit_policy.standard", "fail_closed", "true"),
					resource.TestCheckResourceAttr("phaseo_department_budget.research", "limit", "300"),
				),
			},
			{ResourceName: "phaseo_rate_limit_policy.standard", ImportState: true, ImportStateVerify: true},
		},
	})
	for _, want := range []string{"POST /v1/rate-limits/policies", "POST /v1/rate-limits/assignments", "POST /v1/department-budgets", "DELETE /v1/rate-limits/assignments/"} {
		found := false
		for _, call := range *log {
			if strings.HasPrefix(call, want) {
				found = true
			}
		}
		if !found {
			t.Errorf("expected a %q call, got %v", want, *log)
		}
	}
}

func TestAccRateLimitPolicyRejectsTextTheAPIWouldRewrite(t *testing.T) {
	for _, attributes := range []string{
		`name = " Standard"`,
		"name = \"Standard\"\n  description = \"\"",
		"name = \"Standard\"\n  description = \"Edge keys \"",
	} {
		resource.Test(t, resource.TestCase{
			ProtoV6ProviderFactories: testProviderFactories,
			TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
			Steps: []resource.TestStep{{
				Config: fmt.Sprintf(`
provider "phaseo" {
  api_key  = "test-management-key"
  base_url = "https://api.phaseo.test/v1"
}
resource "phaseo_rate_limit_policy" "standard" {
  %s
  requests_per_minute = 60
}
`, attributes),
				ExpectError: regexp.MustCompile(`whitespace`),
			}},
		})
	}
}
