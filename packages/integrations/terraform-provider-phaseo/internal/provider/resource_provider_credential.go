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

var _ resource.ResourceWithConfigure = (*providerCredentialResource)(nil)
var _ resource.ResourceWithImportState = (*providerCredentialResource)(nil)

type providerCredentialResource struct{ client *client.Client }
type providerCredentialModel struct {
	ID                 types.String `tfsdk:"id"`
	WorkspaceID        types.String `tfsdk:"workspace_id"`
	Provider           types.String `tfsdk:"provider_id"`
	Name               types.String `tfsdk:"name"`
	Key                types.String `tfsdk:"key"`
	Enabled            types.Bool   `tfsdk:"enabled"`
	RoutingMode        types.String `tfsdk:"routing_mode"`
	AllowedModels      types.Set    `tfsdk:"allowed_models"`
	AllowedAPIKeyIDs   types.Set    `tfsdk:"allowed_api_key_ids"`
	Prefix             types.String `tfsdk:"prefix"`
	Suffix             types.String `tfsdk:"suffix"`
	VerificationStatus types.String `tfsdk:"verification_status"`
	ErrorMessage       types.String `tfsdk:"error_message"`
	LastVerifiedAt     types.String `tfsdk:"last_verified_at"`
	LastUsedAt         types.String `tfsdk:"last_used_at"`
	CreatedAt          types.String `tfsdk:"created_at"`
	CreatedBy          types.String `tfsdk:"created_by"`
}
type providerCredentialAPIModel struct {
	ID                 string   `json:"id"`
	WorkspaceID        string   `json:"workspace_id"`
	ProviderID         string   `json:"provider_id"`
	Name               string   `json:"name"`
	Enabled            bool     `json:"enabled"`
	RoutingMode        string   `json:"routing_mode"`
	AllowedModels      []string `json:"allowed_model_slugs"`
	AllowedAPIKeyIDs   []string `json:"allowed_api_key_ids"`
	Prefix             *string  `json:"prefix"`
	Suffix             *string  `json:"suffix"`
	VerificationStatus *string  `json:"verification_status"`
	ErrorMessage       *string  `json:"error_message"`
	LastVerifiedAt     *string  `json:"last_verified_at"`
	LastUsedAt         *string  `json:"last_used_at"`
	CreatedAt          *string  `json:"created_at"`
	CreatedBy          *string  `json:"created_by"`
}
type providerCredentialResponse struct {
	Data providerCredentialAPIModel `json:"data"`
}

func NewProviderCredentialResource() resource.Resource { return &providerCredentialResource{} }
func (r *providerCredentialResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_provider_credential"
}
func (r *providerCredentialResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{Description: "Manages a write-only BYOK provider credential.", Attributes: map[string]schema.Attribute{
		"id": schema.StringAttribute{Computed: true}, "workspace_id": schema.StringAttribute{Computed: true},
		"provider_id": schema.StringAttribute{Required: true, Description: "Phaseo provider identifier.", PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()}}, "name": schema.StringAttribute{Required: true},
		"key":     schema.StringAttribute{Required: true, Sensitive: true, Description: "Raw provider credential. Phaseo encrypts it and never returns it."},
		"enabled": schema.BoolAttribute{Optional: true, Computed: true}, "routing_mode": schema.StringAttribute{Optional: true, Computed: true, Description: "priority or fallback."},
		"allowed_models": schema.SetAttribute{Optional: true, Computed: true, ElementType: types.StringType}, "allowed_api_key_ids": schema.SetAttribute{Optional: true, Computed: true, ElementType: types.StringType},
		"prefix": schema.StringAttribute{Computed: true}, "suffix": schema.StringAttribute{Computed: true}, "verification_status": schema.StringAttribute{Computed: true},
		"error_message": schema.StringAttribute{Computed: true}, "last_verified_at": schema.StringAttribute{Computed: true}, "last_used_at": schema.StringAttribute{Computed: true},
		"created_at": schema.StringAttribute{Computed: true}, "created_by": schema.StringAttribute{Computed: true},
	}}
}
func (r *providerCredentialResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}
func (r *providerCredentialResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan providerCredentialModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := providerCredentialPayload(ctx, plan, &resp.Diagnostics, true)
	if resp.Diagnostics.HasError() {
		return
	}
	var result providerCredentialResponse
	if err := r.client.Do(ctx, http.MethodPost, "byok", body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo provider credential", err.Error())
		return
	}
	setProviderCredential(ctx, &plan, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *providerCredentialResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state providerCredentialModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result providerCredentialResponse
	err := r.client.Do(ctx, http.MethodGet, "byok/"+url.PathEscape(state.ID.ValueString()), nil, &result)
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Phaseo provider credential", err.Error())
		return
	}
	setProviderCredential(ctx, &state, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
func (r *providerCredentialResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan providerCredentialModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := providerCredentialPayload(ctx, plan, &resp.Diagnostics, false)
	if resp.Diagnostics.HasError() {
		return
	}
	var result providerCredentialResponse
	if err := r.client.Do(ctx, http.MethodPatch, "byok/"+url.PathEscape(plan.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo provider credential", err.Error())
		return
	}
	setProviderCredential(ctx, &plan, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *providerCredentialResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state providerCredentialModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "byok/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo provider credential", err.Error())
	}
}
func (r *providerCredentialResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resp.Diagnostics.AddError("Provider credentials cannot be imported", "Phaseo never returns the raw credential, so imported state could not satisfy the required key attribute. Create or replace it through Terraform instead.")
}
func providerCredentialPayload(ctx context.Context, m providerCredentialModel, diags *diag.Diagnostics, create bool) map[string]any {
	body := map[string]any{"name": m.Name.ValueString()}
	if create {
		body["provider"] = m.Provider.ValueString()
	}
	if !m.Key.IsNull() && !m.Key.IsUnknown() {
		body["key"] = m.Key.ValueString()
	}
	if !m.Enabled.IsNull() && !m.Enabled.IsUnknown() {
		body["enabled"] = m.Enabled.ValueBool()
	}
	if !m.RoutingMode.IsNull() && !m.RoutingMode.IsUnknown() {
		body["routing_mode"] = m.RoutingMode.ValueString()
	}
	for field, set := range map[string]types.Set{"allowed_models": m.AllowedModels, "allowed_api_key_ids": m.AllowedAPIKeyIDs} {
		if !set.IsNull() && !set.IsUnknown() {
			var values []string
			diags.Append(set.ElementsAs(ctx, &values, false)...)
			body[field] = values
		}
	}
	return body
}
func setProviderCredential(ctx context.Context, m *providerCredentialModel, d providerCredentialAPIModel, diags *diag.Diagnostics) {
	m.ID = types.StringValue(d.ID)
	m.WorkspaceID = types.StringValue(d.WorkspaceID)
	m.Provider = types.StringValue(d.ProviderID)
	m.Name = types.StringValue(d.Name)
	m.Enabled = types.BoolValue(d.Enabled)
	m.RoutingMode = types.StringValue(d.RoutingMode)
	m.Prefix = nullableString(d.Prefix)
	m.Suffix = nullableString(d.Suffix)
	m.VerificationStatus = nullableString(d.VerificationStatus)
	m.ErrorMessage = nullableString(d.ErrorMessage)
	m.LastVerifiedAt = nullableString(d.LastVerifiedAt)
	m.LastUsedAt = nullableString(d.LastUsedAt)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.CreatedBy = nullableString(d.CreatedBy)
	var ds diag.Diagnostics
	m.AllowedModels, ds = types.SetValueFrom(ctx, types.StringType, d.AllowedModels)
	diags.Append(ds...)
	m.AllowedAPIKeyIDs, ds = types.SetValueFrom(ctx, types.StringType, d.AllowedAPIKeyIDs)
	diags.Append(ds...)
}
