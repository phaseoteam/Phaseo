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
			if record["issuer"] == nil {
				record["issuer"] = map[string]any{"github_actions": "https://token.actions.githubusercontent.com", "gitlab": "https://gitlab.com", "google_cloud": "https://accounts.google.com", "buildkite": "https://agent.buildkite.com"}[record["provider"].(string)]
			}
			if platform, ok := workloadPlatforms[record["provider"].(string)]; ok {
				if record["owner_claim"] != nil {
					t.Errorf("owner_claim sent for preset platform %v", record["provider"])
				}
				record["owner_claim"] = platform.ownerClaim
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
				for _, field := range []string{"provider", "issuer", "owner_claim", "owner_id"} {
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
					resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "owner_claim", "repository_owner_id"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.preview", "owner_claim", "owner_id"),
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
			{
				// An empty map clears the conditions too, and stays empty in state.
				Config: config("GitHub deploy (main)", "enabled = false\n  claim_conditions = {}"),
				Check:  resource.TestCheckResourceAttr("phaseo_trusted_workload.deploy", "claim_conditions.%", "0"),
			},
			{ResourceName: "phaseo_trusted_workload.deploy", ImportState: true, ImportStateVerify: true, ImportStateVerifyIgnore: []string{"claim_conditions"}},
		},
	})
	// Two creates (no replacement), the disable after creating the preview policy,
	// the in-place updates that clear the conditions (unset, then {}), and two deletes.
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
		http.MethodPost: 2, http.MethodDelete: 2, http.MethodPatch: 3,
		`{"status":"disabled"}`: 1,
		`{"claim_conditions":{},"max_token_lifetime_seconds":43200,"name":"GitHub deploy (main)","status":"disabled"}`: 2,
	} {
		if counts[call] != want {
			t.Errorf("expected %d of %q, got %v", want, call, *log)
		}
	}
}

func TestTrustedWorkloadIssuerRules(t *testing.T) {
	for platform, issuers := range map[string][]string{
		"vercel":         {"https://oidc.vercel.com", "https://oidc.vercel.com/acme"},
		"github_actions": {"https://token.actions.githubusercontent.com", "https://token.actions.githubusercontent.com/acme-corp"},
		"gitlab":         {"https://gitlab.com"},
		"google_cloud":   {"https://accounts.google.com"},
		"buildkite":      {"https://agent.buildkite.com"},
		"circleci":       {"https://oidc.circleci.com/org/11111111-2222-3333-4444-555555555555"},
		"aws":            {"https://11111111-2222-3333-4444-555555555555.tokens.sts.global.api.aws"},
	} {
		for _, issuer := range issuers {
			if !workloadPlatforms[platform].issuer.MatchString(issuer) {
				t.Errorf("%s should accept %s", platform, issuer)
			}
			if isCustomWorkloadIssuer(issuer) {
				t.Errorf("custom should refuse preset issuer %s", issuer)
			}
		}
	}
	for _, issuer := range []string{"https://gitlab.example.com", "https://oidc.example.com/", "https://container.googleapis.com/v1/projects/p/locations/l/clusters/c", "https://oidc.eks.us-east-1.amazonaws.com/id/ABC"} {
		if !isCustomWorkloadIssuer(issuer) {
			t.Errorf("custom should accept %s", issuer)
		}
	}
	for _, issuer := range []string{"http://oidc.example.com", "https://oidc.example.com:8443", "https://user@oidc.example.com", "https://oidc.example.com?x=1", "https://oidc.example.com#x", "https://10.0.0.1", "https://[::1]", "https://localhost", "https://ci.internal", "https://example", "https://OIDC.example.com", "https://x.tokens.sts.global.api.aws", "https://gitlab.com"} {
		if isCustomWorkloadIssuer(issuer) {
			t.Errorf("custom should refuse %s", issuer)
		}
	}
	if workloadPlatforms["circleci"].issuer.MatchString("https://oidc.circleci.com/org/acme") || workloadPlatforms["gitlab"].issuer.MatchString("https://gitlab.com/acme") {
		t.Error("preset issuers must be exact")
	}
}

func TestAccTrustedWorkloadCustomAndDefaultIssuers(t *testing.T) {
	server, log := trustedWorkloadTestServer(t)
	defer server.Close()
	config := fmt.Sprintf(`
provider "phaseo" {
  api_key  = "test-management-key"
  base_url = %q
}
resource "phaseo_trusted_workload" "gitlab" {
  name     = "GitLab deploy"
  platform = "gitlab"
  owner_id = "4242"
  claim_conditions = {
    ref = ["main"]
  }
}
resource "phaseo_trusted_workload" "cluster" {
  name        = "Cluster"
  platform    = "custom"
  issuer      = "https://oidc.example.com"
  owner_claim = "sub"
  owner_id    = "system:serviceaccount:prod:api"
  claim_conditions = {
    "kubernetes.io/namespace" = ["prod"]
  }
}
`, server.URL+"/v1")
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testProviderFactories,
		TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
		Steps: []resource.TestStep{
			{
				Config: config,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("phaseo_trusted_workload.gitlab", "issuer", "https://gitlab.com"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.gitlab", "owner_claim", "project_id"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.cluster", "owner_claim", "sub"),
					resource.TestCheckResourceAttr("phaseo_trusted_workload.cluster", "claim_conditions.kubernetes.io/namespace.0", "prod"),
				),
			},
			{ResourceName: "phaseo_trusted_workload.cluster", ImportState: true, ImportStateVerify: true},
		},
	})
	var created []string
	for _, seen := range *log {
		if strings.HasPrefix(seen, http.MethodPost+" ") {
			created = append(created, seen)
		}
	}
	if len(created) != 2 || !strings.Contains(strings.Join(created, "\n"), `"owner_claim":"sub"`) {
		t.Errorf("expected two creates, the custom one with owner_claim, got %v", created)
	}
}

func TestAccTrustedWorkloadRejectsConfigTheAPIWouldRefuse(t *testing.T) {
	for _, tc := range []struct{ body, err string }{
		{`platform = "github_actions"` + "\n" + `issuer = ""`, `must be an https URL`},
		{`platform = "github_actions"` + "\n" + `issuer = " https://token.actions.githubusercontent.com"`, `must be an https URL`},
		{`platform = "github_actions"` + "\n" + `issuer = "\u00a0https://token.actions.githubusercontent.com"`, `must be an https URL`},
		{`platform = "github_actions"` + "\n" + `issuer = "https://example.com"`, `A github_actions issuer must be`},
		{`platform = "gitlab"` + "\n" + `issuer = "https://gitlab.example.com"`, `A gitlab issuer must be`},
		{`platform = "vercel"`, `issuer is required`},
		{`platform = "aws"`, `issuer is required`},
		{`platform = "circleci"` + "\n" + `issuer = "https://oidc.circleci.com/org/11111111-2222-3333-4444-555555555555"`, `organization ID in the CircleCI`},
		{`platform = "custom"` + "\n" + `issuer = "https://oidc.example.com"`, `owner_claim is required`},
		{`platform = "custom"` + "\n" + `issuer = "https://token.actions.githubusercontent.com"` + "\n" + `owner_claim = "sub"`, `A custom issuer must be`},
		{`platform = "custom"` + "\n" + `issuer = "https://10.0.0.1"` + "\n" + `owner_claim = "sub"`, `A custom issuer must be`},
		{`platform = "custom"` + "\n" + `issuer = "https://oidc.example.com:8443"` + "\n" + `owner_claim = "sub"`, `A custom issuer must be`},
		{`platform = "custom"` + "\n" + `issuer = "https://oidc.example.com"` + "\n" + `owner_claim = "aud"`, `Invalid Attribute Value`},
		{`platform = "custom"` + "\n" + `issuer = "https://oidc.example.com"` + "\n" + `owner_claim = "sub"` + "\n" + `claim_conditions = { sub = ["x"] }`, `Set sub with owner_id`},
		{`platform = "google_cloud"` + "\n" + `owner_claim = "email"`, `owner_claim is always "sub"`},
		{`platform = "sometimes"`, `Invalid Attribute Value Match`},
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
  name     = "Deploy"
  owner_id = "123456"
  %s
}
`, tc.body),
				ExpectError: regexp.MustCompile(tc.err),
			}},
		})
	}
}

func TestAccTrustedWorkloadRejectsConditionsTheAPIWouldRefuse(t *testing.T) {
	for _, conditions := range []string{
		`{ aud = ["x"] }`,
		`{ repository_owner_id = ["123456"] }`,
		`{ repository = [] }`,
		`{ repository = [" acme/api"] }`,
		`{ c1 = ["a"], c2 = ["a"], c3 = ["a"], c4 = ["a"], c5 = ["a"], c6 = ["a"], c7 = ["a"], c8 = ["a"], c9 = ["a"], c10 = ["a"], c11 = ["a"], c12 = ["a"], c13 = ["a"], c14 = ["a"], c15 = ["a"], c16 = ["a"] }`,
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
