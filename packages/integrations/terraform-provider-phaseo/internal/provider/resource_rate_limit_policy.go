package provider

import (
	"context"
	"net/http"
	"net/url"

	"github.com/hashicorp/terraform-plugin-framework-validators/int64validator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

var _ resource.ResourceWithConfigure = (*rateLimitPolicyResource)(nil)
var _ resource.ResourceWithImportState = (*rateLimitPolicyResource)(nil)

type rateLimitPolicyResource struct{ client *client.Client }
type rateLimitPolicyModel struct {
	ID                 types.String `tfsdk:"id"`
	Name               types.String `tfsdk:"name"`
	Description        types.String `tfsdk:"description"`
	RequestsPerMinute  types.Int64  `tfsdk:"requests_per_minute"`
	TokensPerMinute    types.Int64  `tfsdk:"tokens_per_minute"`
	ConcurrentRequests types.Int64  `tfsdk:"concurrent_requests"`
	FailClosed         types.Bool   `tfsdk:"fail_closed"`
	CreatedAt          types.String `tfsdk:"created_at"`
	UpdatedAt          types.String `tfsdk:"updated_at"`
}
type rateLimitPolicyAPIModel struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	Description        *string `json:"description"`
	RequestsPerMinute  *int64  `json:"requests_per_minute"`
	TokensPerMinute    *int64  `json:"tokens_per_minute"`
	ConcurrentRequests *int64  `json:"concurrent_requests"`
	FailClosed         bool    `json:"fail_closed"`
	CreatedAt          *string `json:"created_at"`
	UpdatedAt          *string `json:"updated_at"`
}
type rateLimitPolicyResponse struct {
	Data rateLimitPolicyAPIModel `json:"data"`
}

func NewRateLimitPolicyResource() resource.Resource { return &rateLimitPolicyResource{} }
func (r *rateLimitPolicyResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_rate_limit_policy"
}
func (r *rateLimitPolicyResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	limit := func(description string) schema.Int64Attribute {
		return schema.Int64Attribute{Optional: true, Description: description, Validators: []validator.Int64{int64validator.AtLeast(1)}}
	}
	resp.Schema = schema.Schema{Description: "A named workspace rate limit policy. Assign it with phaseo_rate_limit_assignment. Set at least one limit.", Attributes: map[string]schema.Attribute{
		"id":                  schema.StringAttribute{Computed: true, PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}},
		"name":                schema.StringAttribute{Required: true, Validators: []validator.String{stringvalidator.LengthBetween(1, 100)}},
		"description":         schema.StringAttribute{Optional: true, Validators: []validator.String{stringvalidator.LengthAtMost(500)}},
		"requests_per_minute": limit("Requests allowed per rolling minute."),
		"tokens_per_minute":   limit("Input and output tokens allowed per rolling minute, counted when each request completes."),
		"concurrent_requests": limit("Requests allowed in progress at once."),
		"fail_closed":         schema.BoolAttribute{Optional: true, Computed: true, Description: "Strict mode: check the limits before each request is sent and reject requests when they cannot be checked. Adds latency."},
		"created_at":          schema.StringAttribute{Computed: true},
		"updated_at":          schema.StringAttribute{Computed: true},
	}}
}
func (r *rateLimitPolicyResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}

// Unset limits are sent as null, so removing one from the configuration removes it from the policy.
func rateLimitPolicyBody(m rateLimitPolicyModel) map[string]any {
	body := map[string]any{
		"name":                m.Name.ValueString(),
		"description":         nil,
		"requests_per_minute": optionalInt64(m.RequestsPerMinute),
		"tokens_per_minute":   optionalInt64(m.TokensPerMinute),
		"concurrent_requests": optionalInt64(m.ConcurrentRequests),
	}
	if !m.Description.IsNull() && !m.Description.IsUnknown() {
		body["description"] = m.Description.ValueString()
	}
	if !m.FailClosed.IsNull() && !m.FailClosed.IsUnknown() {
		body["fail_closed"] = m.FailClosed.ValueBool()
	}
	return body
}

func (r *rateLimitPolicyResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan rateLimitPolicyModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result rateLimitPolicyResponse
	if err := r.client.Do(ctx, http.MethodPost, "rate-limits/policies", rateLimitPolicyBody(plan), &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo rate limit policy", err.Error())
		return
	}
	setRateLimitPolicy(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *rateLimitPolicyResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state rateLimitPolicyModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result rateLimitPolicyResponse
	if err := r.client.Do(ctx, http.MethodGet, "rate-limits/policies/"+url.PathEscape(state.ID.ValueString()), nil, &result); err != nil {
		if client.IsNotFound(err) {
			resp.State.RemoveResource(ctx)
			return
		}
		resp.Diagnostics.AddError("Unable to read Phaseo rate limit policy", err.Error())
		return
	}
	setRateLimitPolicy(&state, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
func (r *rateLimitPolicyResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan, state rateLimitPolicyModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result rateLimitPolicyResponse
	if err := r.client.Do(ctx, http.MethodPatch, "rate-limits/policies/"+url.PathEscape(state.ID.ValueString()), rateLimitPolicyBody(plan), &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo rate limit policy", err.Error())
		return
	}
	setRateLimitPolicy(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *rateLimitPolicyResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state rateLimitPolicyModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "rate-limits/policies/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo rate limit policy", err.Error())
	}
}
func (r *rateLimitPolicyResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}
func setRateLimitPolicy(m *rateLimitPolicyModel, d rateLimitPolicyAPIModel) {
	m.ID = types.StringValue(d.ID)
	m.Name = types.StringValue(d.Name)
	m.Description = nullableString(d.Description)
	m.RequestsPerMinute = nullableInt64(d.RequestsPerMinute)
	m.TokensPerMinute = nullableInt64(d.TokensPerMinute)
	m.ConcurrentRequests = nullableInt64(d.ConcurrentRequests)
	m.FailClosed = types.BoolValue(d.FailClosed)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
}

func optionalInt64(value types.Int64) any {
	if value.IsNull() || value.IsUnknown() {
		return nil
	}
	return value.ValueInt64()
}
func nullableInt64(value *int64) types.Int64 {
	if value == nil {
		return types.Int64Null()
	}
	return types.Int64Value(*value)
}
