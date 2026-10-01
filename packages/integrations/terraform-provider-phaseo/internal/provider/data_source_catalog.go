package provider

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

type jsonDataSource struct {
	client      *client.Client
	typeName    string
	endpoint    string
	description string
}
type jsonDataSourceModel struct {
	JSON types.String `tfsdk:"json"`
}

func NewModelsDataSource() datasource.DataSource {
	return &jsonDataSource{typeName: "models", endpoint: "models", description: "Returns the Phaseo model catalogue as JSON."}
}
func NewProvidersDataSource() datasource.DataSource {
	return &jsonDataSource{typeName: "providers", endpoint: "providers", description: "Returns the Phaseo provider catalogue as JSON."}
}
func NewCreditsDataSource() datasource.DataSource {
	return &jsonDataSource{typeName: "credits", endpoint: "credits", description: "Returns current Phaseo credit information as JSON."}
}
func (d *jsonDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_" + d.typeName
}
func (d *jsonDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{Description: d.description, Attributes: map[string]schema.Attribute{"json": schema.StringAttribute{Computed: true, Description: "Canonical JSON response from the Phaseo API."}}}
}
func (d *jsonDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, resp *datasource.ConfigureResponse) {
	d.client = configureClient(req.ProviderData, &resp.Diagnostics)
}
func (d *jsonDataSource) Read(ctx context.Context, _ datasource.ReadRequest, resp *datasource.ReadResponse) {
	var result any
	if err := d.client.Do(ctx, http.MethodGet, d.endpoint, nil, &result); err != nil {
		resp.Diagnostics.AddError("Unable to read Phaseo "+d.typeName, err.Error())
		return
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		resp.Diagnostics.AddError("Unable to encode Phaseo "+d.typeName, err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &jsonDataSourceModel{JSON: types.StringValue(string(encoded))})...)
}

var _ datasource.DataSourceWithConfigure = (*jsonDataSource)(nil)
