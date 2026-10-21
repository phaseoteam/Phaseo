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

var workspaceBudgetIntervals = []string{"daily", "weekly", "monthly", "lifetime"}

type workspaceBudgetResource struct{ client *client.Client }

type workspaceBudgetModel struct {
	ID          types.String  `tfsdk:"id"`
	WorkspaceID types.String  `tfsdk:"workspace_id"`
	Interval    types.String  `tfsdk:"interval"`
	Limit       types.Float64 `tfsdk:"limit"`
	LimitNanos  types.Int64   `tfsdk:"limit_nanos"`
	CreatedBy   types.String  `tfsdk:"created_by"`
	CreatedAt   types.String  `tfsdk:"created_at"`
	UpdatedAt   types.String  `tfsdk:"updated_at"`
}

// workspaceBudgetAPIModel is the budget object of /v1/budgets. Usage fields (usage, remaining,
// exceeded, reset_at) change with every request, so the resource does not store them; the
// phaseo_workspace_budgets data source returns them.
type workspaceBudgetAPIModel struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	Interval    string  `json:"interval"`
	LimitNanos  int64   `json:"limit_nanos"`
	CreatedBy   *string `json:"created_by"`
	CreatedAt   *string `json:"created_at"`
	UpdatedAt   *string `json:"updated_at"`
}

type workspaceBudgetResponse struct {
	Data workspaceBudgetAPIModel `json:"data"`
}

func NewWorkspaceBudgetResource() resource.Resource { return &workspaceBudgetResource{} }

func (r *workspaceBudgetResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_workspace_budget"
}

func (r *workspaceBudgetResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	keep := []planmodifier.String{stringplanmodifier.UseStateForUnknown()}
	resp.Schema = schema.Schema{
		Description: "Manages an enforced Phaseo workspace budget. Requests are refused once the workspace's spend in the interval reaches the limit. Intervals reset in UTC.",
		Attributes: map[string]schema.Attribute{
			"id":           schema.StringAttribute{Computed: true, Description: "Budget identifier.", PlanModifiers: keep},
			"workspace_id": schema.StringAttribute{Computed: true, Description: "Workspace identifier.", PlanModifiers: keep},
			"interval":     schema.StringAttribute{Required: true, Description: "daily, weekly, monthly, or lifetime. A workspace has at most one budget per interval.", Validators: []validator.String{stringvalidator.OneOf(workspaceBudgetIntervals...)}},
			"limit":        schema.Float64Attribute{Required: true, Description: "Spend limit in USD for the interval.", Validators: []validator.Float64{float64validator.AtLeast(0.000000001)}},
			"limit_nanos":  schema.Int64Attribute{Computed: true, Description: "The limit in nanodollars, as the API stores it."},
			"created_by":   schema.StringAttribute{Computed: true, Description: "User who created the budget.", PlanModifiers: keep},
			"created_at":   schema.StringAttribute{Computed: true, Description: "Creation timestamp.", PlanModifiers: keep},
			"updated_at":   schema.StringAttribute{Computed: true, Description: "Last update timestamp."},
		},
	}
}

func (r *workspaceBudgetResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}

func workspaceBudgetPayload(m workspaceBudgetModel) map[string]any {
	return map[string]any{"interval": m.Interval.ValueString(), "limit": m.Limit.ValueFloat64()}
}

func (r *workspaceBudgetResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan workspaceBudgetModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result workspaceBudgetResponse
	if err := r.client.Do(ctx, http.MethodPost, "budgets", workspaceBudgetPayload(plan), &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo workspace budget", err.Error())
		return
	}
	setWorkspaceBudget(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *workspaceBudgetResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state workspaceBudgetModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result workspaceBudgetResponse
	err := r.client.Do(ctx, http.MethodGet, "budgets/"+url.PathEscape(state.ID.ValueString()), nil, &result)
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Phaseo workspace budget", err.Error())
		return
	}
	setWorkspaceBudget(&state, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *workspaceBudgetResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan workspaceBudgetModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result workspaceBudgetResponse
	if err := r.client.Do(ctx, http.MethodPatch, "budgets/"+url.PathEscape(plan.ID.ValueString()), workspaceBudgetPayload(plan), &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo workspace budget", err.Error())
		return
	}
	setWorkspaceBudget(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *workspaceBudgetResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state workspaceBudgetModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "budgets/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo workspace budget", err.Error())
	}
}

func (r *workspaceBudgetResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}

func setWorkspaceBudget(m *workspaceBudgetModel, d workspaceBudgetAPIModel) {
	nanos := d.LimitNanos
	m.ID = types.StringValue(d.ID)
	m.WorkspaceID = types.StringValue(d.WorkspaceID)
	m.Interval = types.StringValue(d.Interval)
	m.Limit = usdFromNanos(m.Limit, &nanos)
	m.LimitNanos = types.Int64Value(nanos)
	m.CreatedBy = nullableString(d.CreatedBy)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
}

var _ resource.ResourceWithConfigure = (*workspaceBudgetResource)(nil)
var _ resource.ResourceWithImportState = (*workspaceBudgetResource)(nil)
