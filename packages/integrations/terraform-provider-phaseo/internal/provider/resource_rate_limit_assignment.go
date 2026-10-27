package provider

import (
	"context"
	"net/http"
	"net/url"

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

var _ resource.ResourceWithConfigure = (*rateLimitAssignmentResource)(nil)
var _ resource.ResourceWithImportState = (*rateLimitAssignmentResource)(nil)

type rateLimitAssignmentResource struct{ client *client.Client }
type rateLimitAssignmentModel struct {
	ID         types.String `tfsdk:"id"`
	PolicyID   types.String `tfsdk:"policy_id"`
	TargetType types.String `tfsdk:"target_type"`
	TargetID   types.String `tfsdk:"target_id"`
	CreatedAt  types.String `tfsdk:"created_at"`
	UpdatedAt  types.String `tfsdk:"updated_at"`
}
type rateLimitAssignmentAPIModel struct {
	ID         string  `json:"id"`
	PolicyID   string  `json:"policy_id"`
	TargetType string  `json:"target_type"`
	TargetID   *string `json:"target_id"`
	CreatedAt  *string `json:"created_at"`
	UpdatedAt  *string `json:"updated_at"`
}
type rateLimitAssignmentResponse struct {
	Data rateLimitAssignmentAPIModel `json:"data"`
}

func NewRateLimitAssignmentResource() resource.Resource { return &rateLimitAssignmentResource{} }
func (r *rateLimitAssignmentResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_rate_limit_assignment"
}
func (r *rateLimitAssignmentResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	replace := []planmodifier.String{stringplanmodifier.RequiresReplace()}
	resp.Schema = schema.Schema{Description: "Applies a rate limit policy to an API key, workspace member, department or guardrail, or sets the default for each end user. Each target can have one policy.", Attributes: map[string]schema.Attribute{
		"id":          schema.StringAttribute{Computed: true, PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}},
		"policy_id":   schema.StringAttribute{Required: true, Description: "Changing it switches the target to another policy in place."},
		"target_type": schema.StringAttribute{Required: true, PlanModifiers: replace, Description: "key, member, department, guardrail or end_user_default.", Validators: []validator.String{stringvalidator.OneOf("key", "member", "department", "guardrail", "end_user_default")}},
		"target_id":   schema.StringAttribute{Optional: true, PlanModifiers: replace, Description: "The key, user, department or guardrail ID. Omit it for end_user_default."},
		"created_at":  schema.StringAttribute{Computed: true},
		"updated_at":  schema.StringAttribute{Computed: true},
	}}
}
func (r *rateLimitAssignmentResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}
func (r *rateLimitAssignmentResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan rateLimitAssignmentModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]any{"policy_id": plan.PolicyID.ValueString(), "target_type": plan.TargetType.ValueString()}
	if !plan.TargetID.IsNull() && !plan.TargetID.IsUnknown() {
		body["target_id"] = plan.TargetID.ValueString()
	}
	var result rateLimitAssignmentResponse
	if err := r.client.Do(ctx, http.MethodPost, "rate-limits/assignments", body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo rate limit assignment", err.Error())
		return
	}
	setRateLimitAssignment(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *rateLimitAssignmentResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state rateLimitAssignmentModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result rateLimitAssignmentResponse
	if err := r.client.Do(ctx, http.MethodGet, "rate-limits/assignments/"+url.PathEscape(state.ID.ValueString()), nil, &result); err != nil {
		if client.IsNotFound(err) {
			resp.State.RemoveResource(ctx)
			return
		}
		resp.Diagnostics.AddError("Unable to read Phaseo rate limit assignment", err.Error())
		return
	}
	setRateLimitAssignment(&state, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
func (r *rateLimitAssignmentResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan, state rateLimitAssignmentModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result rateLimitAssignmentResponse
	body := map[string]any{"policy_id": plan.PolicyID.ValueString()}
	if err := r.client.Do(ctx, http.MethodPatch, "rate-limits/assignments/"+url.PathEscape(state.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo rate limit assignment", err.Error())
		return
	}
	setRateLimitAssignment(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *rateLimitAssignmentResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state rateLimitAssignmentModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "rate-limits/assignments/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo rate limit assignment", err.Error())
	}
}
func (r *rateLimitAssignmentResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}
func setRateLimitAssignment(m *rateLimitAssignmentModel, d rateLimitAssignmentAPIModel) {
	m.ID = types.StringValue(d.ID)
	m.PolicyID = types.StringValue(d.PolicyID)
	m.TargetType = types.StringValue(d.TargetType)
	m.TargetID = nullableString(d.TargetID)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
}
