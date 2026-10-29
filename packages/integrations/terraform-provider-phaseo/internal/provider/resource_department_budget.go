package provider

import (
	"context"
	"net/http"
	"net/url"

	"github.com/hashicorp/terraform-plugin-framework-validators/float64validator"
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

var _ resource.ResourceWithConfigure = (*departmentBudgetResource)(nil)
var _ resource.ResourceWithImportState = (*departmentBudgetResource)(nil)

type departmentBudgetResource struct{ client *client.Client }
type departmentBudgetModel struct {
	ID           types.String  `tfsdk:"id"`
	DepartmentID types.String  `tfsdk:"department_id"`
	Interval     types.String  `tfsdk:"interval"`
	Limit        types.Float64 `tfsdk:"limit"`
	CreatedAt    types.String  `tfsdk:"created_at"`
	UpdatedAt    types.String  `tfsdk:"updated_at"`
}
type departmentBudgetAPIModel struct {
	ID           string  `json:"id"`
	DepartmentID string  `json:"department_id"`
	Interval     string  `json:"interval"`
	Limit        float64 `json:"limit"`
	CreatedAt    *string `json:"created_at"`
	UpdatedAt    *string `json:"updated_at"`
}
type departmentBudgetResponse struct {
	Data departmentBudgetAPIModel `json:"data"`
}

func NewDepartmentBudgetResource() resource.Resource { return &departmentBudgetResource{} }
func (r *departmentBudgetResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_department_budget"
}
func (r *departmentBudgetResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{Description: "A department spend budget. API-key requests that count toward the department are refused once it is used up (batch, realtime and OAuth requests are not). If the budget check is briefly unavailable, requests are allowed rather than refused. Owners and admins are alerted at about 80% and 100%. Each department can have one budget per interval.", Attributes: map[string]schema.Attribute{
		"id":            schema.StringAttribute{Computed: true, PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}},
		"department_id": schema.StringAttribute{Required: true, PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplace()}},
		"interval":      schema.StringAttribute{Required: true, Description: "daily, weekly or monthly (UTC periods).", Validators: []validator.String{stringvalidator.OneOf("daily", "weekly", "monthly")}},
		"limit":         schema.Float64Attribute{Required: true, Description: "Budget in USD.", Validators: []validator.Float64{float64validator.AtLeast(0.000000001)}},
		"created_at":    schema.StringAttribute{Computed: true},
		"updated_at":    schema.StringAttribute{Computed: true},
	}}
}
func (r *departmentBudgetResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}
func (r *departmentBudgetResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan departmentBudgetModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]any{"department_id": plan.DepartmentID.ValueString(), "interval": plan.Interval.ValueString(), "limit": plan.Limit.ValueFloat64()}
	var result departmentBudgetResponse
	if err := r.client.Do(ctx, http.MethodPost, "department-budgets", body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo department budget", err.Error())
		return
	}
	setDepartmentBudget(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *departmentBudgetResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state departmentBudgetModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result departmentBudgetResponse
	if err := r.client.Do(ctx, http.MethodGet, "department-budgets/"+url.PathEscape(state.ID.ValueString()), nil, &result); err != nil {
		if client.IsNotFound(err) {
			resp.State.RemoveResource(ctx)
			return
		}
		resp.Diagnostics.AddError("Unable to read Phaseo department budget", err.Error())
		return
	}
	setDepartmentBudget(&state, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
func (r *departmentBudgetResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan, state departmentBudgetModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]any{"interval": plan.Interval.ValueString(), "limit": plan.Limit.ValueFloat64()}
	var result departmentBudgetResponse
	if err := r.client.Do(ctx, http.MethodPatch, "department-budgets/"+url.PathEscape(state.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo department budget", err.Error())
		return
	}
	setDepartmentBudget(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *departmentBudgetResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state departmentBudgetModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "department-budgets/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo department budget", err.Error())
	}
}
func (r *departmentBudgetResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}
func setDepartmentBudget(m *departmentBudgetModel, d departmentBudgetAPIModel) {
	m.ID = types.StringValue(d.ID)
	m.DepartmentID = types.StringValue(d.DepartmentID)
	m.Interval = types.StringValue(d.Interval)
	m.Limit = types.Float64Value(d.Limit)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
}
