package provider

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/hashicorp/terraform-plugin-framework/providerserver"
	"github.com/hashicorp/terraform-plugin-go/tfprotov6"
	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/tfversion"
)

var testProviderFactories = map[string]func() (tfprotov6.ProviderServer, error){
	"phaseo": providerserver.NewProtocol6WithError(New("test")()),
}

func TestAccModelsDataSource(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-management-key" {
			t.Fatalf("missing provider authorization header")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"openai/gpt-test"}]}`))
	}))
	defer server.Close()

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testProviderFactories,
		TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
		Steps: []resource.TestStep{{
			Config: fmt.Sprintf(`
provider "phaseo" {
  api_key  = "test-management-key"
  base_url = %q
}
data "phaseo_models" "test" {}
`, server.URL+"/v1"),
			Check: resource.TestCheckResourceAttr("data.phaseo_models.test", "json", `{"data":[{"id":"openai/gpt-test"}]}`),
		}},
	})
}

func TestAccRejectsInvalidBaseURL(t *testing.T) {
	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testProviderFactories,
		TerraformVersionChecks:   []tfversion.TerraformVersionCheck{tfversion.SkipBelow(tfversion.Version1_5_0)},
		Steps: []resource.TestStep{{
			Config: `
provider "phaseo" {
  api_key  = "test-management-key"
  base_url = "ftp://api.phaseo.test"
}
data "phaseo_models" "test" {}
`,
			ExpectError: regexp.MustCompile(`must be an HTTP or HTTPS URL`),
		}},
	})
}
