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

// A minimal in-memory /v1/workload-identity/policies API with the server's defaults.
func trustedWorkloadTestServer(t *testing.T) (*httptest.Server, *[]string) {
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
		encoded, _ := json.Marshal(body)
		log = append(log, r.Method+" "+r.URL.Path+" "+string(encoded))
		id := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/v1/workload-identity/policies"), "/")
		w.Header().Set("Content-Type", "application/json")
		write := func(status int, value any) {
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]any{"data": value})
		}
		switch r.Method {
		case http.MethodPost:
			next++
			record := map[string]any{
				"id": fmt.Sprintf("00000000-0000-4000-8000-%012d", next), "key_id": fmt.Sprintf("00000000-0000-4000-8000-0000000000k%d", next),
				"status": "active", "audience": "https://api.phaseo.app", "claim_conditions": map[string]any{}, "max_token_lifetime_seconds": 43200,
				"created_at": "2026-10-27T00:00:00Z", "updated_at": "2026-10-27T00:00:00Z",
			}
			for key, value := range body {
				record[key] = value
			}
			if record["issuer"] == nil && record["provider"] == "github_actions" {
				record["issuer"] = "https://token.actions.githubusercontent.com"
			}
			records[record["id"].(string)] = record
			write(http.StatusCreated, record)
		case http.MethodGet, http.MethodPatch, http.MethodDelete:
			record, ok := records[id]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":"not_found"}`))
				return
			}
			if r.Method == http.MethodPatch {
				for _, field := range []string{"provider", "issuer", "owner_id"} {
					if _, present := body[field]; present {
						w.WriteHeader(http.StatusBadRequest)
						_, _ = w.Write([]byte(`{"error":"bad_request"}`))
						return
					}
				}
				for key, value := range body {
					record[key] = value
				}
			}
			if r.Method == http.MethodDelete {
				delete(records, id)
				write(http.StatusOK, map[string]any{"id": id, "deleted": true})
				return
			}
			write(http.StatusOK, record)
		}
	}))
	return server, &log
}

func TestAccTrustedWorkload(t *testing.T) {
	server, log := trustedWorkloadTestServer(t)
	defer server.Close()
	config := func(name, extra string) string {
		return fmt.Sprintf(`
provider "phaseo" {
  api_key  = "test-management-key"
  base_url = %q
}
resource "phaseo_trusted_workload" "deploy" {
  name     = %q
  platform = "github_actions"
  owner_id = "123456"
  %s
}
resource "phaseo_trusted_workload" "preview" {
  name     = "Website previews"
  platform = "vercel"
  issuer   = "https://oidc.vercel.com/acme"
  owner_id = "team_123"
  enabled  = false
}
`, server.URL+"/v1", name, extra)
	}
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testProviderFactories,
		TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
		Steps: []resource.TestStep{
			{
				Config: config("GitHub deploy", `claim_conditions = {
    repository = ["acme/api"]
    ref        = ["refs/heads/main", "refs/heads/release"]
  }
  max_token_lifetime_seconds = 900`),
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "issuer", "https://token.actions.githubusercontent.com"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "claim_conditions.ref.1", "refs/heads/release"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "max_token_lifetime_seconds", "900"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "enabled", "true"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "audience", "https://api.phaseo.app"),
					resource.TestCheckResourceAttrSet("phaseo_trusted_workload.deploy", "key_id"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.preview", "enabled", "false"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.preview", "max_token_lifetime_seconds", "43200"),
					resource.TestCheckNoResourceAttr("phaseo_trusted_workload.preview", "claim_conditions"),
				),
			},
			{
				// Removing the conditions and lifetime clears them in place; the policy is not replaced.
				Config: config("GitHub deploy (main)", `enabled = false`),
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "name", "GitHub deploy (main)"),
					resource.TestCheckNoResourceAttr("phaseo_trusted_workload.deploy", "claim_conditions"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "max_token_lifetime_seconds", "43200"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "enabled", "false"),
				),
			},
			{ResourceName: "phaseo_trusted_workload.deploy", ImportState: true, ImportStateVerify: true},
		},
	})
	// Two creates (no replacement), the disable after creating the preview policy,
	// the in-place update that clears the conditions, and two deletes.
	counts := map[string]int{}
	for _, seen := range *log {
		method, rest, _ := strings.Cut(seen, " ")
		counts[method]++
		if method == http.MethodPatch {
			_, body, _ := strings.Cut(rest, " ")
			counts[body]++
		}
	}
	for call, want := range map[string]int{
		http.MethodPost: 2, http.MethodDelete: 2, http.MethodPatch: 2,
		`{"status":"disabled"}`: 1,
		`{"claim_conditions":{},"max_token_lifetime_seconds":43200,"name":"GitHub deploy (main)","status":"disabled"}`: 1,
	} {
		if counts[call] != want {
			t.Errorf("expected %d of %q, got %v", want, call, *log)
		}
	}
}

func TestAccTrustedWorkloadRejectsConditionsTheAPIWouldRefuse(t *testing.T) {
	for _, conditions := range []string{
		`{ aud = ["x"] }`,
		`{ repository_owner_id = ["123456"] }`,
		`{ repository = [] }`,
		`{ repository = [" acme/api"] }`,
		`{}`,
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
resource "phaseo_trusted_workload" "deploy" {
  name             = "GitHub deploy"
  platform         = "github_actions"
  owner_id         = "123456"
  claim_conditions = %s
}
`, conditions),
				ExpectError: regexp.MustCompile(`Invalid Attribute Value`),
			}},
		})
	}
}
