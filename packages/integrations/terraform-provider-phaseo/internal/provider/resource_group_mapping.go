package provider

import (
	"context"
	"net/http"
	"net/url"

	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

var _ resource.ResourceWithConfigure = (*groupMappingResource)(nil)
var _ resource.ResourceWithImportState = (*groupMappingResource)(nil)

type groupMappingResource struct{ client *client.Client }
type groupMappingModel struct {
	ID                 types.String `tfsdk:"id"`
	SCIMGroupID        types.String `tfsdk:"scim_group_id"`
	DepartmentID       types.String `tfsdk:"department_id"`
	AccessRole         types.String `tfsdk:"access_role"`
	DepartmentPosition types.String `tfsdk:"department_position"`
	CreatedAt          types.String `tfsdk:"created_at"`
	UpdatedAt          types.String `tfsdk:"updated_at"`
}
type groupMappingAPIModel struct {
	ID                 string  `json:"id"`
	SCIMGroupID        string  `json:"scim_group_id"`
	DepartmentID       string  `json:"department_id"`
	AccessRole         string  `json:"access_role"`
	DepartmentPosition string  `json:"department_position"`
	CreatedAt          *string `json:"created_at"`
	UpdatedAt          *string `json:"updated_at"`
}
type groupMappingResponse struct {
	Data groupMappingAPIModel `json:"data"`
}
type groupMappingListResponse struct {
	Data []groupMappingAPIModel `json:"data"`
}

func NewGroupMappingResource() resource.Resource { return &groupMappingResource{} }
func (r *groupMappingResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_scim_group_mapping"
}
func (r *groupMappingResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{Description: "Maps a provisioned SCIM group to a Phaseo department and workspace role.", Attributes: map[string]schema.Attribute{
		"id": schema.StringAttribute{Computed: true}, "scim_group_id": schema.StringAttribute{Required: true, PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()}}, "department_id": schema.StringAttribute{Required: true, PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()}},
		"access_role": schema.StringAttribute{Optional: true, Computed: true, Description: "member or admin."}, "department_position": schema.StringAttribute{Optional: true, Computed: true, Description: "member or lead."},
		"created_at": schema.StringAttribute{Computed: true}, "updated_at": schema.StringAttribute{Computed: true},
	}}
}
func (r *groupMappingResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}
func (r *groupMappingResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan groupMappingModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]any{"scim_group_id": plan.SCIMGroupID.ValueString(), "department_id": plan.DepartmentID.ValueString()}
	if !plan.AccessRole.IsNull() && !plan.AccessRole.IsUnknown() {
		body["access_role"] = plan.AccessRole.ValueString()
	}
	if !plan.DepartmentPosition.IsNull() && !plan.DepartmentPosition.IsUnknown() {
		body["department_position"] = plan.DepartmentPosition.ValueString()
	}
	var result groupMappingResponse
	if err := r.client.Do(ctx, http.MethodPost, "identity/group-mappings", body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo SCIM group mapping", err.Error())
		return
	}
	setGroupMapping(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *groupMappingResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state groupMappingModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result groupMappingListResponse
	if err := r.client.Do(ctx, http.MethodGet, "identity/group-mappings", nil, &result); err != nil {
		resp.Diagnostics.AddError("Unable to read Phaseo SCIM group mapping", err.Error())
		return
	}
	for _, mapping := range result.Data {
		if mapping.ID == state.ID.ValueString() {
			setGroupMapping(&state, mapping)
			resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
			return
		}
	}
	resp.State.RemoveResource(ctx)
}
func (r *groupMappingResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan groupMappingModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]any{"access_role": plan.AccessRole.ValueString(), "department_position": plan.DepartmentPosition.ValueString()}
	var result groupMappingResponse
	if err := r.client.Do(ctx, http.MethodPatch, "identity/group-mappings/"+url.PathEscape(plan.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo SCIM group mapping", err.Error())
		return
	}
	setGroupMapping(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *groupMappingResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state groupMappingModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "identity/group-mappings/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo SCIM group mapping", err.Error())
	}
}
func (r *groupMappingResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}
func setGroupMapping(m *groupMappingModel, d groupMappingAPIModel) {
	m.ID = types.StringValue(d.ID)
	m.SCIMGroupID = types.StringValue(d.SCIMGroupID)
	m.DepartmentID = types.StringValue(d.DepartmentID)
	m.AccessRole = types.StringValue(d.AccessRole)
	m.DepartmentPosition = types.StringValue(d.DepartmentPosition)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
}
