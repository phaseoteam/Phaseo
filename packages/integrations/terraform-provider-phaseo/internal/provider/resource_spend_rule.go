package provider

import (
	"context"
	"net/http"
	"net/url"
	"sort"

	"github.com/hashicorp/terraform-plugin-framework-validators/float64validator"
	"github.com/hashicorp/terraform-plugin-framework-validators/int64validator"
	"github.com/hashicorp/terraform-plugin-framework-validators/setvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/attr"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/booldefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/int64default"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/setdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

// The values the spend rules API accepts. The API also checks how fields combine (which
// metric needs which threshold, base and period), so those rules are not repeated here.
var (
	spendRuleMetrics   = []string{"spend", "budget_percent", "forecast", "spike", "balance"}
	spendRuleScopes    = []string{"workspace", "key", "member", "department", "model", "provider"}
	spendRulePeriods   = []string{"day", "week", "month", "rolling"}
	spendRuleBaseKinds = []string{"amount", "workspace_budget", "key_limit", "previous_period"}
	spendRuleBaseRefs  = []string{"daily", "weekly", "monthly"}
	spendRuleActions   = []string{"notify", "block"}
)

type spendRuleResource struct{ client *client.Client }

type spendRuleModel struct {
	ID                 types.String  `tfsdk:"id"`
	WorkspaceID        types.String  `tfsdk:"workspace_id"`
	Name               types.String  `tfsdk:"name"`
	Enabled            types.Bool    `tfsdk:"enabled"`
	Metric             types.String  `tfsdk:"metric"`
	ScopeType          types.String  `tfsdk:"scope_type"`
	ScopeID            types.String  `tfsdk:"scope_id"`
	Period             types.String  `tfsdk:"period"`
	WindowHours        types.Int64   `tfsdk:"window_hours"`
	TimeZone           types.String  `tfsdk:"time_zone"`
	BaseKind           types.String  `tfsdk:"base_kind"`
	BaseRef            types.String  `tfsdk:"base_ref"`
	BaseAmountUSD      types.Float64 `tfsdk:"base_amount_usd"`
	ThresholdPercents  types.Set     `tfsdk:"threshold_percents"`
	ThresholdAmountUSD types.Float64 `tfsdk:"threshold_amount_usd"`
	RunwayDays         types.Int64   `tfsdk:"runway_days"`
	SpikeMultiplier    types.Float64 `tfsdk:"spike_multiplier"`
	SpikeFloorUSD      types.Float64 `tfsdk:"spike_floor_usd"`
	Action             types.String  `tfsdk:"action"`
	BlockAtPercent     types.Int64   `tfsdk:"block_at_percent"`
	BlockAtAmountUSD   types.Float64 `tfsdk:"block_at_amount_usd"`
	BlockFreeModels    types.Bool    `tfsdk:"block_free_models"`
	CooldownMinutes    types.Int64   `tfsdk:"cooldown_minutes"`
	DestinationIDs     types.Set     `tfsdk:"destination_ids"`
	Evaluated          types.Bool    `tfsdk:"evaluated"`
	CreatedBy          types.String  `tfsdk:"created_by"`
	CreatedAt          types.String  `tfsdk:"created_at"`
	UpdatedAt          types.String  `tfsdk:"updated_at"`
}

// spendRuleAPIModel is the SpendRule object of /v1/spend-rules. Amounts are read from the
// exact *_nanos fields.
type spendRuleAPIModel struct {
	ID                   string   `json:"id"`
	WorkspaceID          string   `json:"workspace_id"`
	Name                 string   `json:"name"`
	Enabled              bool     `json:"enabled"`
	Metric               string   `json:"metric"`
	Evaluated            bool     `json:"evaluated"`
	ScopeType            string   `json:"scope_type"`
	ScopeID              *string  `json:"scope_id"`
	Period               string   `json:"period"`
	WindowHours          *int64   `json:"window_hours"`
	TimeZone             *string  `json:"time_zone"`
	BaseKind             *string  `json:"base_kind"`
	BaseRef              *string  `json:"base_ref"`
	BaseAmountNanos      *int64   `json:"base_amount_nanos"`
	ThresholdPercents    []int64  `json:"threshold_percents"`
	ThresholdAmountNanos *int64   `json:"threshold_amount_nanos"`
	RunwayDays           *int64   `json:"runway_days"`
	SpikeMultiplier      *float64 `json:"spike_multiplier"`
	SpikeFloorNanos      *int64   `json:"spike_floor_nanos"`
	Action               string   `json:"action"`
	BlockAtPercent       int64    `json:"block_at_percent"`
	BlockAtAmountNanos   *int64   `json:"block_at_amount_nanos"`
	BlockFreeModels      bool     `json:"block_free_models"`
	CooldownMinutes      int64    `json:"cooldown_minutes"`
	DestinationIDs       []string `json:"destination_ids"`
	CreatedBy            *string  `json:"created_by"`
	CreatedAt            *string  `json:"created_at"`
	UpdatedAt            *string  `json:"updated_at"`
}

type spendRuleResponse struct {
	Data spendRuleAPIModel `json:"data"`
}

func NewSpendRuleResource() resource.Resource { return &spendRuleResource{} }

func (r *spendRuleResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_spend_rule"
}

func (r *spendRuleResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	keep := []planmodifier.String{stringplanmodifier.UseStateForUnknown()}
	resp.Schema = schema.Schema{
		Description: "Manages a Phaseo spend rule: an alert on spend, a percentage of a base, a forecast, a spike, or the workspace balance, that can also block requests once spend passes a grace margin.",
		Attributes: map[string]schema.Attribute{
			"id":              schema.StringAttribute{Computed: true, Description: "Spend rule identifier.", PlanModifiers: keep},
			"workspace_id":    schema.StringAttribute{Computed: true, Description: "Workspace identifier.", PlanModifiers: keep},
			"name":            schema.StringAttribute{Required: true, Description: "Rule name, 1 to 100 characters.", Validators: []validator.String{stringvalidator.LengthBetween(1, 100)}},
			"enabled":         schema.BoolAttribute{Optional: true, Computed: true, Default: booldefault.StaticBool(true), Description: "Whether the rule is evaluated. Defaults to true."},
			"metric":          schema.StringAttribute{Required: true, Description: "spend, budget_percent, forecast, spike, or balance.", Validators: []validator.String{stringvalidator.OneOf(spendRuleMetrics...)}},
			"scope_type":      schema.StringAttribute{Optional: true, Computed: true, Default: stringdefault.StaticString("workspace"), Description: "workspace, key, member, department, model, or provider. Defaults to workspace.", Validators: []validator.String{stringvalidator.OneOf(spendRuleScopes...)}},
			"scope_id":        schema.StringAttribute{Optional: true, Description: "The key id, member user id, department id, model id, or provider id. Leave unset for the workspace scope."},
			"period":          schema.StringAttribute{Required: true, Description: "day, week (Monday to Sunday), month, or rolling.", Validators: []validator.String{stringvalidator.OneOf(spendRulePeriods...)}},
			"window_hours":    schema.Int64Attribute{Optional: true, Description: "Hours in a rolling window (1 to 720). Required for the rolling period. Spike rules use it as the spike window (at most 56); balance rules as the burn-rate lookback.", Validators: []validator.Int64{int64validator.Between(1, 720)}},
			"time_zone":       schema.StringAttribute{Optional: true, Description: "IANA time zone for calendar periods, such as Europe/London. Leave unset to use the workspace billing time zone."},
			"base_kind":       schema.StringAttribute{Optional: true, Description: "What percentages are measured against: amount, workspace_budget, key_limit, or previous_period.", Validators: []validator.String{stringvalidator.OneOf(spendRuleBaseKinds...)}},
			"base_ref":        schema.StringAttribute{Optional: true, Description: "daily, weekly, or monthly: which workspace budget or key limit is the base. It must match the period.", Validators: []validator.String{stringvalidator.OneOf(spendRuleBaseRefs...)}},
			"base_amount_usd": schema.Float64Attribute{Optional: true, Description: "The base in USD when base_kind is amount.", Validators: []validator.Float64{float64validator.AtLeast(0.000000001)}},
			"threshold_percents": schema.SetAttribute{Optional: true, ElementType: types.Int64Type, Description: "One to five percentages of the base (1 to 1000) that send an alert.", Validators: []validator.Set{
				setvalidator.SizeBetween(1, 5),
				setvalidator.ValueInt64sAre(int64validator.Between(1, 1000)),
			}},
			"threshold_amount_usd": schema.Float64Attribute{Optional: true, Description: "spend: the USD amount that sends an alert. forecast: the projected USD amount. balance: alert when the available balance is at or below this amount.", Validators: []validator.Float64{float64validator.AtLeast(0.000000001)}},
			"runway_days":          schema.Int64Attribute{Optional: true, Description: "Balance rules: alert when the balance would last fewer than this many days (1 to 365) at the recent burn rate.", Validators: []validator.Int64{int64validator.Between(1, 365)}},
			"spike_multiplier":     schema.Float64Attribute{Optional: true, Computed: true, Description: "Spike rules: alert when spend in the window is at least this multiple of the usual spend. Defaults to 3 for spike rules.", Validators: []validator.Float64{float64validator.Between(1.01, 100)}},
			"spike_floor_usd":      schema.Float64Attribute{Optional: true, Computed: true, Description: "Spike rules: the least spend in the window, in USD, that can alert. Defaults to 5 for spike rules.", Validators: []validator.Float64{float64validator.AtLeast(0)}},
			"action":               schema.StringAttribute{Optional: true, Computed: true, Default: stringdefault.StaticString("notify"), Description: "notify, or block (spend and budget_percent rules only). Defaults to notify.", Validators: []validator.String{stringvalidator.OneOf(spendRuleActions...)}},
			"block_at_percent":     schema.Int64Attribute{Optional: true, Computed: true, Default: int64default.StaticInt64(110), Description: "budget_percent rules that block: block once spend reaches this percentage of the base (100 to 1000, at least the highest threshold). Defaults to 110.", Validators: []validator.Int64{int64validator.Between(100, 1000)}},
			"block_at_amount_usd":  schema.Float64Attribute{Optional: true, Description: "spend rules that block: block once spend reaches this USD amount (at least threshold_amount_usd). Required for those rules.", Validators: []validator.Float64{float64validator.AtLeast(0.000000001)}},
			"block_free_models":    schema.BoolAttribute{Optional: true, Computed: true, Default: booldefault.StaticBool(false), Description: "Whether a block also refuses free models. Defaults to false."},
			"cooldown_minutes":     schema.Int64Attribute{Optional: true, Computed: true, Default: int64default.StaticInt64(360), Description: "Rolling, spike, and balance rules: minutes before the rule can alert again (5 to 43200). Defaults to 360.", Validators: []validator.Int64{int64validator.Between(5, 43200)}},
			"destination_ids":      schema.SetAttribute{Optional: true, Computed: true, ElementType: types.StringType, Default: setdefault.StaticValue(types.SetValueMust(types.StringType, []attr.Value{})), Description: "Notification destinations for this rule. When empty, the workspace's spend alert and spend block routes are used.", Validators: []validator.Set{setvalidator.SizeAtMost(50)}},
			"evaluated":            schema.BoolAttribute{Computed: true, Description: "Whether the evaluator fires on this combination of metric, period, and base."},
			"created_by":           schema.StringAttribute{Computed: true, Description: "User who created the rule.", PlanModifiers: keep},
			"created_at":           schema.StringAttribute{Computed: true, Description: "Creation timestamp.", PlanModifiers: keep},
			"updated_at":           schema.StringAttribute{Computed: true, Description: "Last update timestamp."},
		},
	}
}

func (r *spendRuleResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}

func (r *spendRuleResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan spendRuleModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := spendRulePayload(ctx, plan, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	var result spendRuleResponse
	if err := r.client.Do(ctx, http.MethodPost, "spend-rules", body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo spend rule", err.Error())
		return
	}
	setSpendRule(ctx, &plan, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *spendRuleResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state spendRuleModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result spendRuleResponse
	err := r.client.Do(ctx, http.MethodGet, "spend-rules/"+url.PathEscape(state.ID.ValueString()), nil, &result)
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Phaseo spend rule", err.Error())
		return
	}
	setSpendRule(ctx, &state, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *spendRuleResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan spendRuleModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := spendRulePayload(ctx, plan, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	var result spendRuleResponse
	if err := r.client.Do(ctx, http.MethodPatch, "spend-rules/"+url.PathEscape(plan.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo spend rule", err.Error())
		return
	}
	setSpendRule(ctx, &plan, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *spendRuleResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state spendRuleModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "spend-rules/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo spend rule", err.Error())
	}
}

func (r *spendRuleResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}

// spendRulePayload is the full rule for a create or an update. Optional fields that are not
// configured are sent as null so that removing one from the configuration clears it. The
// spike settings are left out when not configured, so the API applies its spike defaults.
func spendRulePayload(ctx context.Context, m spendRuleModel, diags *diag.Diagnostics) map[string]any {
	body := map[string]any{
		"name":                   m.Name.ValueString(),
		"metric":                 m.Metric.ValueString(),
		"period":                 m.Period.ValueString(),
		"scope_id":               optionalString(m.ScopeID),
		"window_hours":           optionalInt64(m.WindowHours),
		"time_zone":              optionalString(m.TimeZone),
		"base_kind":              optionalString(m.BaseKind),
		"base_ref":               optionalString(m.BaseRef),
		"base_amount_nanos":      optionalNanos(m.BaseAmountUSD),
		"threshold_amount_nanos": optionalNanos(m.ThresholdAmountUSD),
		"runway_days":            optionalInt64(m.RunwayDays),
		"block_at_amount_nanos":  optionalNanos(m.BlockAtAmountUSD),
		"threshold_percents":     nil,
		"destination_ids":        []string{},
	}
	if !m.Enabled.IsNull() && !m.Enabled.IsUnknown() {
		body["enabled"] = m.Enabled.ValueBool()
	}
	if !m.ScopeType.IsNull() && !m.ScopeType.IsUnknown() {
		body["scope_type"] = m.ScopeType.ValueString()
	}
	if !m.Action.IsNull() && !m.Action.IsUnknown() {
		body["action"] = m.Action.ValueString()
	}
	if !m.BlockAtPercent.IsNull() && !m.BlockAtPercent.IsUnknown() {
		body["block_at_percent"] = m.BlockAtPercent.ValueInt64()
	}
	if !m.BlockFreeModels.IsNull() && !m.BlockFreeModels.IsUnknown() {
		body["block_free_models"] = m.BlockFreeModels.ValueBool()
	}
	if !m.CooldownMinutes.IsNull() && !m.CooldownMinutes.IsUnknown() {
		body["cooldown_minutes"] = m.CooldownMinutes.ValueInt64()
	}
	if !m.SpikeMultiplier.IsNull() && !m.SpikeMultiplier.IsUnknown() {
		body["spike_multiplier"] = m.SpikeMultiplier.ValueFloat64()
	}
	if !m.SpikeFloorUSD.IsNull() && !m.SpikeFloorUSD.IsUnknown() {
		body["spike_floor_nanos"] = usdToNanos(m.SpikeFloorUSD.ValueFloat64())
	}
	if !m.ThresholdPercents.IsNull() && !m.ThresholdPercents.IsUnknown() {
		var percents []int64
		diags.Append(m.ThresholdPercents.ElementsAs(ctx, &percents, false)...)
		sort.Slice(percents, func(i, j int) bool { return percents[i] < percents[j] })
		body["threshold_percents"] = percents
	}
	if !m.DestinationIDs.IsNull() && !m.DestinationIDs.IsUnknown() {
		destinations := []string{}
		diags.Append(m.DestinationIDs.ElementsAs(ctx, &destinations, false)...)
		sort.Strings(destinations)
		body["destination_ids"] = destinations
	}
	return body
}

func optionalNanos(value types.Float64) any {
	if value.IsNull() || value.IsUnknown() {
		return nil
	}
	return usdToNanos(value.ValueFloat64())
}

func setSpendRule(ctx context.Context, m *spendRuleModel, d spendRuleAPIModel, diags *diag.Diagnostics) {
	m.ID = types.StringValue(d.ID)
	m.WorkspaceID = types.StringValue(d.WorkspaceID)
	m.Name = types.StringValue(d.Name)
	m.Enabled = types.BoolValue(d.Enabled)
	m.Metric = types.StringValue(d.Metric)
	m.Evaluated = types.BoolValue(d.Evaluated)
	m.ScopeType = types.StringValue(d.ScopeType)
	m.ScopeID = stringKeepingCase(m.ScopeID, d.ScopeID)
	m.Period = types.StringValue(d.Period)
	m.WindowHours = nullableInt64(d.WindowHours)
	m.TimeZone = nullableString(d.TimeZone)
	m.BaseKind = nullableString(d.BaseKind)
	m.BaseRef = nullableString(d.BaseRef)
	m.BaseAmountUSD = usdFromNanos(m.BaseAmountUSD, d.BaseAmountNanos)
	m.ThresholdAmountUSD = usdFromNanos(m.ThresholdAmountUSD, d.ThresholdAmountNanos)
	m.RunwayDays = nullableInt64(d.RunwayDays)
	m.SpikeMultiplier = nullableFloat64(d.SpikeMultiplier)
	m.SpikeFloorUSD = usdFromNanos(m.SpikeFloorUSD, d.SpikeFloorNanos)
	m.Action = types.StringValue(d.Action)
	m.BlockAtPercent = types.Int64Value(d.BlockAtPercent)
	m.BlockAtAmountUSD = usdFromNanos(m.BlockAtAmountUSD, d.BlockAtAmountNanos)
	m.BlockFreeModels = types.BoolValue(d.BlockFreeModels)
	m.CooldownMinutes = types.Int64Value(d.CooldownMinutes)
	m.CreatedBy = nullableString(d.CreatedBy)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
	var ds diag.Diagnostics
	if len(d.ThresholdPercents) == 0 {
		m.ThresholdPercents = types.SetNull(types.Int64Type)
	} else {
		m.ThresholdPercents, ds = types.SetValueFrom(ctx, types.Int64Type, d.ThresholdPercents)
		diags.Append(ds...)
	}
	destinations := d.DestinationIDs
	if destinations == nil {
		destinations = []string{}
	}
	m.DestinationIDs, ds = types.SetValueFrom(ctx, types.StringType, destinations)
	diags.Append(ds...)
}

var _ resource.ResourceWithConfigure = (*spendRuleResource)(nil)
var _ resource.ResourceWithImportState = (*spendRuleResource)(nil)
