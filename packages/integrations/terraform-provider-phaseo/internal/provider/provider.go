package provider

import (
	"context"
	"os"
	"regexp"

	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	providerschema "github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

type phaseoProvider struct{ version string }
type providerModel struct {
	APIKey  types.String `tfsdk:"api_key"`
	BaseURL types.String `tfsdk:"base_url"`
}

func New(version string) func() provider.Provider {
	return func() provider.Provider { return &phaseoProvider{version: version} }
}

func (p *phaseoProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "phaseo"
	resp.Version = p.version
}

func (p *phaseoProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = providerschema.Schema{
		Description: "Manage Phaseo workspaces and gateway resources.",
		Attributes: map[string]providerschema.Attribute{
			"api_key":  providerschema.StringAttribute{Description: "Phaseo management API key. May also be set with PHASEO_API_KEY.", Optional: true, Sensitive: true},
			"base_url": providerschema.StringAttribute{Description: "Phaseo API base URL. Defaults to https://api.phaseo.app/v1 and may be set with PHASEO_BASE_URL.", Optional: true, Validators: []validator.String{stringvalidator.RegexMatches(regexp.MustCompile(`^https?://`), "must be an HTTP or HTTPS URL")}},
		},
	}
}

func (p *phaseoProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config providerModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if config.APIKey.IsUnknown() || config.BaseURL.IsUnknown() {
		resp.Diagnostics.AddWarning("Phaseo provider configuration is unknown", "Provider configuration values must be known before apply.")
		return
	}
	apiKey := config.APIKey.ValueString()
	if apiKey == "" {
		apiKey = os.Getenv("PHASEO_API_KEY")
	}
	if apiKey == "" {
		resp.Diagnostics.AddError("Missing Phaseo API key", "Set api_key in the provider configuration or set PHASEO_API_KEY.")
		return
	}
	baseURL := config.BaseURL.ValueString()
	if baseURL == "" {
		baseURL = os.Getenv("PHASEO_BASE_URL")
	}
	apiClient, err := client.New(apiKey, baseURL, p.version, nil)
	if err != nil {
		resp.Diagnostics.AddError("Invalid Phaseo provider configuration", err.Error())
		return
	}
	resp.DataSourceData = apiClient
	resp.ResourceData = apiClient
}

func (p *phaseoProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{NewAPIKeyResource, NewProviderCredentialResource, NewGroupMappingResource, NewObservabilityDestinationResource, NewGuardrailResource}
}
func (p *phaseoProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{NewModelsDataSource, NewProvidersDataSource, NewCreditsDataSource}
}

func configureClient(data any, diags *diag.Diagnostics) *client.Client {
	if data == nil {
		return nil
	}
	apiClient, ok := data.(*client.Client)
	if !ok {
		diags.AddError("Unexpected provider configuration", "Expected a configured Phaseo API client.")
		return nil
	}
	return apiClient
}

func nullableString(value *string) types.String {
	if value == nil {
		return types.StringNull()
	}
	return types.StringValue(*value)
}
