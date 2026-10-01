package provider

import (
	"context"
	"net/http"
	"net/url"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

type observabilityDestinationResource struct{ client *client.Client }
type observabilityDestinationModel struct {
	ID                        types.String  `tfsdk:"id"`
	WorkspaceID               types.String  `tfsdk:"workspace_id"`
	Type                      types.String  `tfsdk:"type"`
	Name                      types.String  `tfsdk:"name"`
	Config                    types.Map     `tfsdk:"config"`
	Enabled                   types.Bool    `tfsdk:"enabled"`
	PrivacyMode               types.Bool    `tfsdk:"privacy_mode"`
	SamplingRate              types.Float64 `tfsdk:"sampling_rate"`
	GroupJoin                 types.String  `tfsdk:"group_join"`
	IncludeGenerationMetadata types.Bool    `tfsdk:"include_generation_metadata"`
	IncludeCostMetadata       types.Bool    `tfsdk:"include_cost_metadata"`
	IncludeIdentityMetadata   types.Bool    `tfsdk:"include_identity_metadata"`
	IncludeRequestContext     types.Bool    `tfsdk:"include_request_context"`
	Configured                types.Bool    `tfsdk:"configured"`
	CreatedAt                 types.String  `tfsdk:"created_at"`
	UpdatedAt                 types.String  `tfsdk:"updated_at"`
}
type observabilityDestinationAPIModel struct {
	ID                        string  `json:"id"`
	WorkspaceID               string  `json:"workspace_id"`
	Type                      string  `json:"type"`
	Name                      string  `json:"name"`
	Enabled                   bool    `json:"enabled"`
	PrivacyMode               bool    `json:"privacy_mode"`
	SamplingRate              float64 `json:"sampling_rate"`
	GroupJoin                 string  `json:"group_join"`
	IncludeGenerationMetadata bool    `json:"include_generation_metadata"`
	IncludeCostMetadata       bool    `json:"include_cost_metadata"`
	IncludeIdentityMetadata   bool    `json:"include_identity_metadata"`
	IncludeRequestContext     bool    `json:"include_request_context"`
	Configured                bool    `json:"configured"`
	CreatedAt                 *string `json:"created_at"`
	UpdatedAt                 *string `json:"updated_at"`
}
type observabilityDestinationResponse struct {
	Data observabilityDestinationAPIModel `json:"data"`
}

func NewObservabilityDestinationResource() resource.Resource {
	return &observabilityDestinationResource{}
}
func (r *observabilityDestinationResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_observability_destination"
}
func (r *observabilityDestinationResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{Description: "Manages a Phaseo observability export destination.", Attributes: map[string]schema.Attribute{
		"id": schema.StringAttribute{Computed: true}, "workspace_id": schema.StringAttribute{Computed: true}, "type": schema.StringAttribute{Required: true, Description: "otel_collector or webhook.", PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()}}, "name": schema.StringAttribute{Required: true},
		"config": schema.MapAttribute{Required: true, Sensitive: true, ElementType: types.StringType, Description: "Write-only destination configuration."}, "enabled": schema.BoolAttribute{Optional: true, Computed: true}, "privacy_mode": schema.BoolAttribute{Optional: true, Computed: true}, "sampling_rate": schema.Float64Attribute{Optional: true, Computed: true}, "group_join": schema.StringAttribute{Optional: true, Computed: true},
		"include_generation_metadata": schema.BoolAttribute{Optional: true, Computed: true}, "include_cost_metadata": schema.BoolAttribute{Optional: true, Computed: true}, "include_identity_metadata": schema.BoolAttribute{Optional: true, Computed: true}, "include_request_context": schema.BoolAttribute{Optional: true, Computed: true},
		"configured": schema.BoolAttribute{Computed: true}, "created_at": schema.StringAttribute{Computed: true}, "updated_at": schema.StringAttribute{Computed: true},
	}}
}
func (r *observabilityDestinationResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}
func (r *observabilityDestinationResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan observabilityDestinationModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := observabilityPayload(ctx, plan, &resp.Diagnostics, true)
	var result observabilityDestinationResponse
	if err := r.client.Do(ctx, http.MethodPost, "observability/destinations", body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo observability destination", err.Error())
		return
	}
	setObservability(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *observabilityDestinationResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state observabilityDestinationModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result observabilityDestinationResponse
	err := r.client.Do(ctx, http.MethodGet, "observability/destinations/"+url.PathEscape(state.ID.ValueString()), nil, &result)
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Phaseo observability destination", err.Error())
		return
	}
	setObservability(&state, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
func (r *observabilityDestinationResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan observabilityDestinationModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := observabilityPayload(ctx, plan, &resp.Diagnostics, false)
	var result observabilityDestinationResponse
	if err := r.client.Do(ctx, http.MethodPatch, "observability/destinations/"+url.PathEscape(plan.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo observability destination", err.Error())
		return
	}
	setObservability(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *observabilityDestinationResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state observabilityDestinationModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "observability/destinations/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo observability destination", err.Error())
	}
}
func (r *observabilityDestinationResource) ImportState(_ context.Context, _ resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resp.Diagnostics.AddError("Observability destinations cannot be imported", "Phaseo does not return the write-only destination configuration. Manage an existing destination by recreating it through Terraform.")
}
func observabilityPayload(ctx context.Context, m observabilityDestinationModel, diags *diag.Diagnostics, create bool) map[string]any {
	body := map[string]any{"name": m.Name.ValueString()}
	if create {
		body["type"] = m.Type.ValueString()
	}
	if !m.Config.IsNull() && !m.Config.IsUnknown() {
		config := map[string]string{}
		diags.Append(m.Config.ElementsAs(ctx, &config, false)...)
		body["config"] = config
	}
	bools := map[string]types.Bool{"enabled": m.Enabled, "privacy_mode": m.PrivacyMode, "include_generation_metadata": m.IncludeGenerationMetadata, "include_cost_metadata": m.IncludeCostMetadata, "include_identity_metadata": m.IncludeIdentityMetadata, "include_request_context": m.IncludeRequestContext}
	for k, v := range bools {
		if !v.IsNull() && !v.IsUnknown() {
			body[k] = v.ValueBool()
		}
	}
	if !m.SamplingRate.IsNull() && !m.SamplingRate.IsUnknown() {
		body["sampling_rate"] = m.SamplingRate.ValueFloat64()
	}
	if !m.GroupJoin.IsNull() && !m.GroupJoin.IsUnknown() {
		body["group_join"] = m.GroupJoin.ValueString()
	}
	return body
}
func setObservability(m *observabilityDestinationModel, d observabilityDestinationAPIModel) {
	m.ID = types.StringValue(d.ID)
	m.WorkspaceID = types.StringValue(d.WorkspaceID)
	m.Type = types.StringValue(d.Type)
	m.Name = types.StringValue(d.Name)
	m.Enabled = types.BoolValue(d.Enabled)
	m.PrivacyMode = types.BoolValue(d.PrivacyMode)
	m.SamplingRate = types.Float64Value(d.SamplingRate)
	m.GroupJoin = types.StringValue(d.GroupJoin)
	m.IncludeGenerationMetadata = types.BoolValue(d.IncludeGenerationMetadata)
	m.IncludeCostMetadata = types.BoolValue(d.IncludeCostMetadata)
	m.IncludeIdentityMetadata = types.BoolValue(d.IncludeIdentityMetadata)
	m.IncludeRequestContext = types.BoolValue(d.IncludeRequestContext)
	m.Configured = types.BoolValue(d.Configured)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
}

var _ resource.ResourceWithConfigure = (*observabilityDestinationResource)(nil)
var _ resource.ResourceWithImportState = (*observabilityDestinationResource)(nil)
