package provider

import (
	"context"
	"net/http"
	"net/url"

	"github.com/hashicorp/terraform-plugin-framework-validators/float64validator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

var _ resource.ResourceWithConfigure = (*apiKeyResource)(nil)
var _ resource.ResourceWithImportState = (*apiKeyResource)(nil)

type apiKeyResource struct{ client *client.Client }
type apiKeyModel struct {
	ID          types.String  `tfsdk:"id"`
	Name        types.String  `tfsdk:"name"`
	WorkspaceID types.String  `tfsdk:"workspace_id"`
	Limit       types.Float64 `tfsdk:"limit"`
	LimitReset  types.String  `tfsdk:"limit_reset"`
	ExpiresAt   types.String  `tfsdk:"expires_at"`
	Disabled    types.Bool    `tfsdk:"disabled"`
	SoftBlocked types.Bool    `tfsdk:"soft_blocked"`
	Key         types.String  `tfsdk:"key"`
	Prefix      types.String  `tfsdk:"prefix"`
	Status      types.String  `tfsdk:"status"`
	CreatedAt   types.String  `tfsdk:"created_at"`
	UpdatedAt   types.String  `tfsdk:"updated_at"`
}
type apiKeyAPIModel struct {
	ID          string   `json:"id"`
	Name        *string  `json:"name"`
	WorkspaceID string   `json:"workspace_id"`
	Limit       *float64 `json:"limit"`
	LimitReset  *string  `json:"limit_reset"`
	ExpiresAt   *string  `json:"expires_at"`
	Disabled    bool     `json:"disabled"`
	SoftBlocked bool     `json:"soft_blocked"`
	Key         *string  `json:"key"`
	Prefix      *string  `json:"prefix"`
	Status      *string  `json:"status"`
	CreatedAt   *string  `json:"created_at"`
	UpdatedAt   *string  `json:"updated_at"`
}
type apiKeyResponse struct {
	Data apiKeyAPIModel `json:"data"`
}

func NewAPIKeyResource() resource.Resource { return &apiKeyResource{} }
func (r *apiKeyResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_api_key"
}
func (r *apiKeyResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Creates and manages a Phaseo Gateway API key. The plaintext key is returned only on creation and stored as sensitive Terraform state.",
		Attributes: map[string]schema.Attribute{
			"id":           schema.StringAttribute{Computed: true, Description: "API key UUID."},
			"name":         schema.StringAttribute{Required: true, Description: "Human-readable key name.", Validators: []validator.String{stringvalidator.LengthAtLeast(1)}},
			"workspace_id": schema.StringAttribute{Optional: true, Computed: true, Description: "Workspace UUID. Defaults to the management key workspace."},
			"limit":        schema.Float64Attribute{Optional: true, Computed: true, Description: "Spend limit in USD.", Validators: []validator.Float64{float64validator.AtLeast(0)}},
			"limit_reset":  schema.StringAttribute{Optional: true, Computed: true, Description: "Spend-limit window: daily, weekly, or monthly.", Validators: []validator.String{stringvalidator.OneOf("daily", "weekly", "monthly")}},
			"expires_at":   schema.StringAttribute{Optional: true, Computed: true, Description: "RFC 3339 expiry timestamp."},
			"disabled":     schema.BoolAttribute{Optional: true, Computed: true, Description: "Whether the key is disabled."},
			"soft_blocked": schema.BoolAttribute{Optional: true, Computed: true, Description: "Whether the key is soft-blocked."},
			"key":          schema.StringAttribute{Computed: true, Sensitive: true, Description: "Plaintext API key, available only after creation."},
			"prefix":       schema.StringAttribute{Computed: true},
			"status":       schema.StringAttribute{Computed: true},
			"created_at":   schema.StringAttribute{Computed: true},
			"updated_at":   schema.StringAttribute{Computed: true},
		},
	}
}
func (r *apiKeyResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}

func (r *apiKeyResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan apiKeyModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := apiKeyPayload(ctx, plan, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	var result apiKeyResponse
	if err := r.client.Do(ctx, http.MethodPost, "keys", body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo API key", err.Error())
		return
	}
	setAPIKeyModel(ctx, &plan, result.Data, &resp.Diagnostics, true)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *apiKeyResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state apiKeyModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result apiKeyResponse
	err := r.client.Do(ctx, http.MethodGet, "keys/"+url.PathEscape(state.ID.ValueString()), nil, &result)
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Phaseo API key", err.Error())
		return
	}
	setAPIKeyModel(ctx, &state, result.Data, &resp.Diagnostics, false)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
func (r *apiKeyResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan apiKeyModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := apiKeyPayload(ctx, plan, &resp.Diagnostics)
	delete(body, "workspace_id")
	if resp.Diagnostics.HasError() {
		return
	}
	var result apiKeyResponse
	if err := r.client.Do(ctx, http.MethodPatch, "keys/"+url.PathEscape(plan.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo API key", err.Error())
		return
	}
	setAPIKeyModel(ctx, &plan, result.Data, &resp.Diagnostics, false)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *apiKeyResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state apiKeyModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "keys/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo API key", err.Error())
	}
}
func (r *apiKeyResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}

func apiKeyPayload(ctx context.Context, model apiKeyModel, diags *diag.Diagnostics) map[string]any {
	body := map[string]any{"name": model.Name.ValueString()}
	if !model.WorkspaceID.IsNull() && !model.WorkspaceID.IsUnknown() {
		body["workspace_id"] = model.WorkspaceID.ValueString()
	}
	if !model.Limit.IsNull() && !model.Limit.IsUnknown() {
		body["limit"] = model.Limit.ValueFloat64()
	}
	if !model.LimitReset.IsNull() && !model.LimitReset.IsUnknown() {
		body["limit_reset"] = model.LimitReset.ValueString()
	}
	if !model.ExpiresAt.IsNull() && !model.ExpiresAt.IsUnknown() {
		body["expires_at"] = model.ExpiresAt.ValueString()
	}
	if !model.Disabled.IsNull() && !model.Disabled.IsUnknown() {
		body["disabled"] = model.Disabled.ValueBool()
	}
	if !model.SoftBlocked.IsNull() && !model.SoftBlocked.IsUnknown() {
		body["soft_blocked"] = model.SoftBlocked.ValueBool()
	}
	return body
}

func setAPIKeyModel(ctx context.Context, model *apiKeyModel, data apiKeyAPIModel, diags *diag.Diagnostics, includeSecret bool) {
	model.ID = types.StringValue(data.ID)
	model.Name = nullableString(data.Name)
	model.WorkspaceID = types.StringValue(data.WorkspaceID)
	model.Limit = nullableFloat(data.Limit)
	model.LimitReset = nullableString(data.LimitReset)
	model.ExpiresAt = nullableString(data.ExpiresAt)
	model.Disabled = types.BoolValue(data.Disabled)
	model.SoftBlocked = types.BoolValue(data.SoftBlocked)
	model.Prefix = nullableString(data.Prefix)
	model.Status = nullableString(data.Status)
	model.CreatedAt = nullableString(data.CreatedAt)
	model.UpdatedAt = nullableString(data.UpdatedAt)
	if includeSecret && data.Key != nil {
		model.Key = types.StringValue(*data.Key)
	}
}

func nullableFloat(value *float64) types.Float64 {
	if value == nil {
		return types.Float64Null()
	}
	return types.Float64Value(*value)
}
