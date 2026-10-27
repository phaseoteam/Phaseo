package provider

import (
	"context"
	"net/http"
	"net/url"
	"regexp"

	"github.com/hashicorp/terraform-plugin-framework-validators/int64validator"
	"github.com/hashicorp/terraform-plugin-framework-validators/listvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/mapvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/attr"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/booldefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/int64default"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

var _ resource.ResourceWithConfigure = (*trustedWorkloadResource)(nil)
var _ resource.ResourceWithImportState = (*trustedWorkloadResource)(nil)

type trustedWorkloadResource struct{ client *client.Client }
type trustedWorkloadModel struct {
	ID                      types.String `tfsdk:"id"`
	Name                    types.String `tfsdk:"name"`
	Platform                types.String `tfsdk:"platform"`
	Issuer                  types.String `tfsdk:"issuer"`
	OwnerID                 types.String `tfsdk:"owner_id"`
	ClaimConditions         types.Map    `tfsdk:"claim_conditions"`
	MaxTokenLifetimeSeconds types.Int64  `tfsdk:"max_token_lifetime_seconds"`
	Enabled                 types.Bool   `tfsdk:"enabled"`
	Audience                types.String `tfsdk:"audience"`
	KeyID                   types.String `tfsdk:"key_id"`
	CreatedAt               types.String `tfsdk:"created_at"`
	UpdatedAt               types.String `tfsdk:"updated_at"`
}
type trustedWorkloadAPIModel struct {
	ID                      string              `json:"id"`
	Name                    string              `json:"name"`
	Provider                string              `json:"provider"`
	Issuer                  string              `json:"issuer"`
	OwnerID                 string              `json:"owner_id"`
	ClaimConditions         map[string][]string `json:"claim_conditions"`
	MaxTokenLifetimeSeconds int64               `json:"max_token_lifetime_seconds"`
	Status                  string              `json:"status"`
	Audience                string              `json:"audience"`
	KeyID                   string              `json:"key_id"`
	CreatedAt               *string             `json:"created_at"`
	UpdatedAt               *string             `json:"updated_at"`
}
type trustedWorkloadResponse struct {
	Data trustedWorkloadAPIModel `json:"data"`
}

const trustedWorkloadsPath = "workload-identity/policies"

var claimName = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
var conditionValueList = types.ListType{ElemType: types.StringType}

func NewTrustedWorkloadResource() resource.Resource { return &trustedWorkloadResource{} }
func (r *trustedWorkloadResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_trusted_workload"
}
func (r *trustedWorkloadResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	keep := []planmodifier.String{stringplanmodifier.UseStateForUnknown()}
	replace := []planmodifier.String{stringplanmodifier.RequiresReplace()}
	resp.Schema = schema.Schema{Description: "A trust policy that lets Vercel deployments or GitHub Actions workflows call Phaseo with their OIDC token instead of an API key. Beta: only workspaces in the trusted workloads beta can use it.", Attributes: map[string]schema.Attribute{
		"id":       schema.StringAttribute{Computed: true, PlanModifiers: keep},
		"name":     schema.StringAttribute{Required: true, Validators: []validator.String{stringvalidator.LengthBetween(1, 100), stringvalidator.RegexMatches(trimmedText, "must not start or end with whitespace")}},
		"platform": schema.StringAttribute{Required: true, Description: "vercel or github_actions. Changing it replaces the policy.", PlanModifiers: replace, Validators: []validator.String{stringvalidator.OneOf("vercel", "github_actions")}},
		"issuer": schema.StringAttribute{Optional: true, Computed: true, Description: "Token issuer. Required for Vercel; defaults to https://token.actions.githubusercontent.com for GitHub Actions. Changing it replaces the policy.",
			PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown(), stringplanmodifier.RequiresReplaceIfConfigured()}},
		"owner_id": schema.StringAttribute{Required: true, Description: "The Vercel team ID, or the GitHub organisation or user ID. Changing it replaces the policy.", PlanModifiers: replace, Validators: []validator.String{stringvalidator.RegexMatches(trimmedText, "must not be empty or start or end with whitespace")}},
		"claim_conditions": schema.MapAttribute{Optional: true, ElementType: conditionValueList, Description: "Extra claims the token must match: claim name to allowed values.", Validators: []validator.Map{
			mapvalidator.SizeBetween(1, 16),
			mapvalidator.KeysAre(stringvalidator.RegexMatches(claimName, "must be 1 to 64 letters, digits, '.', '_' or '-'"), stringvalidator.NoneOf("iss", "aud", "exp", "iat", "nbf", "jti", "owner_id", "repository_owner_id")),
			mapvalidator.ValueListsAre(listvalidator.SizeBetween(1, 20), listvalidator.ValueStringsAre(stringvalidator.LengthBetween(1, 256), stringvalidator.RegexMatches(trimmedText, "must not start or end with whitespace"))),
		}},
		"max_token_lifetime_seconds": schema.Int64Attribute{Optional: true, Computed: true, Default: int64default.StaticInt64(43200), Description: "Longest token lifetime the policy accepts, from 60 to 43200 seconds.", Validators: []validator.Int64{int64validator.Between(60, 43200)}},
		"enabled":                    schema.BoolAttribute{Optional: true, Computed: true, Default: booldefault.StaticBool(true), Description: "Whether matching tokens are accepted."},
		"audience":                   schema.StringAttribute{Computed: true, PlanModifiers: keep, Description: "The audience tokens must be issued for."},
		"key_id":                     schema.StringAttribute{Computed: true, PlanModifiers: keep, Description: "The policy's key. Requests, usage and limits are recorded against it."},
		"created_at":                 schema.StringAttribute{Computed: true, PlanModifiers: keep},
		"updated_at":                 schema.StringAttribute{Computed: true},
	}}
}
func (r *trustedWorkloadResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}

// Unset conditions are sent as an empty object, so removing them from the configuration removes them from the policy.
func trustedWorkloadConditions(ctx context.Context, m trustedWorkloadModel, diags *diag.Diagnostics) map[string][]string {
	conditions := map[string][]string{}
	if !m.ClaimConditions.IsNull() && !m.ClaimConditions.IsUnknown() {
		diags.Append(m.ClaimConditions.ElementsAs(ctx, &conditions, false)...)
	}
	return conditions
}
func trustedWorkloadStatus(m trustedWorkloadModel) string {
	if m.Enabled.ValueBool() {
		return "active"
	}
	return "disabled"
}

func (r *trustedWorkloadResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan trustedWorkloadModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	conditions := trustedWorkloadConditions(ctx, plan, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]any{
		"name":                       plan.Name.ValueString(),
		"provider":                   plan.Platform.ValueString(),
		"owner_id":                   plan.OwnerID.ValueString(),
		"claim_conditions":           conditions,
		"max_token_lifetime_seconds": plan.MaxTokenLifetimeSeconds.ValueInt64(),
	}
	if !plan.Issuer.IsNull() && !plan.Issuer.IsUnknown() {
		body["issuer"] = plan.Issuer.ValueString()
	}
	var result trustedWorkloadResponse
	if err := r.client.Do(ctx, http.MethodPost, trustedWorkloadsPath, body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo trusted workload", err.Error())
		return
	}
	// Policies are created enabled; a disabled one is switched off straight away.
	if !plan.Enabled.ValueBool() {
		if err := r.client.Do(ctx, http.MethodPatch, trustedWorkloadsPath+"/"+url.PathEscape(result.Data.ID), map[string]any{"status": "disabled"}, &result); err != nil {
			setTrustedWorkload(&plan, result.Data)
			resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
			resp.Diagnostics.AddError("Created the Phaseo trusted workload but could not disable it", err.Error())
			return
		}
	}
	setTrustedWorkload(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *trustedWorkloadResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state trustedWorkloadModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result trustedWorkloadResponse
	if err := r.client.Do(ctx, http.MethodGet, trustedWorkloadsPath+"/"+url.PathEscape(state.ID.ValueString()), nil, &result); err != nil {
		if client.IsNotFound(err) {
			resp.State.RemoveResource(ctx)
			return
		}
		resp.Diagnostics.AddError("Unable to read Phaseo trusted workload", err.Error())
		return
	}
	setTrustedWorkload(&state, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
func (r *trustedWorkloadResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan, state trustedWorkloadModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	conditions := trustedWorkloadConditions(ctx, plan, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]any{
		"name":                       plan.Name.ValueString(),
		"status":                     trustedWorkloadStatus(plan),
		"claim_conditions":           conditions,
		"max_token_lifetime_seconds": plan.MaxTokenLifetimeSeconds.ValueInt64(),
	}
	var result trustedWorkloadResponse
	if err := r.client.Do(ctx, http.MethodPatch, trustedWorkloadsPath+"/"+url.PathEscape(state.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo trusted workload", err.Error())
		return
	}
	setTrustedWorkload(&plan, result.Data)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *trustedWorkloadResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state trustedWorkloadModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, trustedWorkloadsPath+"/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo trusted workload", err.Error())
	}
}
func (r *trustedWorkloadResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}
func setTrustedWorkload(m *trustedWorkloadModel, d trustedWorkloadAPIModel) {
	m.ID = types.StringValue(d.ID)
	m.Name = types.StringValue(d.Name)
	m.Platform = types.StringValue(d.Provider)
	m.Issuer = types.StringValue(d.Issuer)
	m.OwnerID = types.StringValue(d.OwnerID)
	// The API returns {} for no conditions; the configuration leaves them out.
	if len(d.ClaimConditions) == 0 {
		m.ClaimConditions = types.MapNull(conditionValueList)
	} else {
		elements := make(map[string]attr.Value, len(d.ClaimConditions))
		for claim, values := range d.ClaimConditions {
			items := make([]attr.Value, len(values))
			for i, value := range values {
				items[i] = types.StringValue(value)
			}
			elements[claim] = types.ListValueMust(types.StringType, items)
		}
		m.ClaimConditions = types.MapValueMust(conditionValueList, elements)
	}
	m.MaxTokenLifetimeSeconds = types.Int64Value(d.MaxTokenLifetimeSeconds)
	m.Enabled = types.BoolValue(d.Status != "disabled")
	m.Audience = types.StringValue(d.Audience)
	m.KeyID = types.StringValue(d.KeyID)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
}
