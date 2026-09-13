package provider

import (
	"context"
	"net/http"
	"net/url"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/phaseoteam/terraform-provider-phaseo/internal/client"
)

type guardrailResource struct{ client *client.Client }
type guardrailModel struct {
	ID                                types.String `tfsdk:"id"`
	WorkspaceID                       types.String `tfsdk:"workspace_id"`
	Name                              types.String `tfsdk:"name"`
	Description                       types.String `tfsdk:"description"`
	Enabled                           types.Bool   `tfsdk:"enabled"`
	PrivacyPaidMayTrain               types.Bool   `tfsdk:"privacy_paid_may_train"`
	PrivacyFreeMayTrain               types.Bool   `tfsdk:"privacy_free_may_train"`
	PrivacyFreeMayPublishPrompts      types.Bool   `tfsdk:"privacy_free_may_publish_prompts"`
	PrivacyInputOutputLogging         types.Bool   `tfsdk:"privacy_input_output_logging"`
	PrivacyZDROnly                    types.Bool   `tfsdk:"privacy_zdr_only"`
	ProviderRestrictionMode           types.String `tfsdk:"provider_restriction_mode"`
	ProviderIDs                       types.Set    `tfsdk:"provider_ids"`
	ProviderRestrictionEnforceAllowed types.Bool   `tfsdk:"provider_restriction_enforce_allowed"`
	ModelRestrictionMode              types.String `tfsdk:"model_restriction_mode"`
	ModelIDs                          types.Set    `tfsdk:"model_ids"`
	PromptInjectionEnabled            types.Bool   `tfsdk:"prompt_injection_enabled"`
	PromptInjectionAction             types.String `tfsdk:"prompt_injection_action"`
	SensitiveInfoEnabled              types.Bool   `tfsdk:"sensitive_info_enabled"`
	SensitiveInfoDefaultAction        types.String `tfsdk:"sensitive_info_default_action"`
	CreatedAt                         types.String `tfsdk:"created_at"`
	UpdatedAt                         types.String `tfsdk:"updated_at"`
}
type guardrailAPIModel struct {
	ID                                string   `json:"id"`
	WorkspaceID                       string   `json:"workspace_id"`
	Name                              string   `json:"name"`
	Description                       *string  `json:"description"`
	Enabled                           *bool    `json:"enabled"`
	PrivacyPaidMayTrain               *bool    `json:"privacy_enable_paid_may_train"`
	PrivacyFreeMayTrain               *bool    `json:"privacy_enable_free_may_train"`
	PrivacyFreeMayPublishPrompts      *bool    `json:"privacy_enable_free_may_publish_prompts"`
	PrivacyInputOutputLogging         *bool    `json:"privacy_enable_input_output_logging"`
	PrivacyZDROnly                    *bool    `json:"privacy_zdr_only"`
	ProviderRestrictionMode           *string  `json:"provider_restriction_mode"`
	ProviderIDs                       []string `json:"provider_restriction_provider_ids"`
	ProviderRestrictionEnforceAllowed *bool    `json:"provider_restriction_enforce_allowed"`
	ModelRestrictionMode              *string  `json:"model_restriction_mode"`
	ModelIDs                          []string `json:"allowed_api_model_ids"`
	PromptInjectionEnabled            *bool    `json:"prompt_injection_enabled"`
	PromptInjectionAction             *string  `json:"prompt_injection_action"`
	SensitiveInfoEnabled              *bool    `json:"sensitive_info_enabled"`
	SensitiveInfoDefaultAction        *string  `json:"sensitive_info_default_action"`
	CreatedAt                         *string  `json:"created_at"`
	UpdatedAt                         *string  `json:"updated_at"`
}
type guardrailResponse struct {
	Data guardrailAPIModel `json:"data"`
}

func NewGuardrailResource() resource.Resource { return &guardrailResource{} }
func (r *guardrailResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_guardrail"
}
func (r *guardrailResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{Description: "Manages a Phaseo workspace guardrail policy.", Attributes: map[string]schema.Attribute{
		"id": schema.StringAttribute{Computed: true}, "workspace_id": schema.StringAttribute{Computed: true}, "name": schema.StringAttribute{Required: true}, "description": schema.StringAttribute{Optional: true, Computed: true}, "enabled": schema.BoolAttribute{Optional: true, Computed: true},
		"privacy_paid_may_train": schema.BoolAttribute{Optional: true, Computed: true}, "privacy_free_may_train": schema.BoolAttribute{Optional: true, Computed: true}, "privacy_free_may_publish_prompts": schema.BoolAttribute{Optional: true, Computed: true}, "privacy_input_output_logging": schema.BoolAttribute{Optional: true, Computed: true}, "privacy_zdr_only": schema.BoolAttribute{Optional: true, Computed: true},
		"provider_restriction_mode": schema.StringAttribute{Optional: true, Computed: true, Description: "none, allowlist, or blocklist."}, "provider_ids": schema.SetAttribute{Optional: true, Computed: true, ElementType: types.StringType}, "provider_restriction_enforce_allowed": schema.BoolAttribute{Optional: true, Computed: true}, "model_restriction_mode": schema.StringAttribute{Optional: true, Computed: true, Description: "none, allowlist, or blocklist."}, "model_ids": schema.SetAttribute{Optional: true, Computed: true, ElementType: types.StringType},
		"prompt_injection_enabled": schema.BoolAttribute{Optional: true, Computed: true}, "prompt_injection_action": schema.StringAttribute{Optional: true, Computed: true, Description: "flag or block."}, "sensitive_info_enabled": schema.BoolAttribute{Optional: true, Computed: true}, "sensitive_info_default_action": schema.StringAttribute{Optional: true, Computed: true, Description: "flag, redact, or block."}, "created_at": schema.StringAttribute{Computed: true}, "updated_at": schema.StringAttribute{Computed: true},
	}}
}
func (r *guardrailResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = configureClient(req.ProviderData, &resp.Diagnostics)
}
func (r *guardrailResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan guardrailModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := guardrailPayload(ctx, plan, &resp.Diagnostics)
	var result guardrailResponse
	if err := r.client.Do(ctx, http.MethodPost, "guardrails", body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to create Phaseo guardrail", err.Error())
		return
	}
	setGuardrail(ctx, &plan, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *guardrailResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state guardrailModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	var result guardrailResponse
	err := r.client.Do(ctx, http.MethodGet, "guardrails/"+url.PathEscape(state.ID.ValueString()), nil, &result)
	if client.IsNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Phaseo guardrail", err.Error())
		return
	}
	setGuardrail(ctx, &state, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
func (r *guardrailResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan guardrailModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := guardrailPayload(ctx, plan, &resp.Diagnostics)
	var result guardrailResponse
	if err := r.client.Do(ctx, http.MethodPatch, "guardrails/"+url.PathEscape(plan.ID.ValueString()), body, &result); err != nil {
		resp.Diagnostics.AddError("Unable to update Phaseo guardrail", err.Error())
		return
	}
	setGuardrail(ctx, &plan, result.Data, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}
func (r *guardrailResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state guardrailModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.Do(ctx, http.MethodDelete, "guardrails/"+url.PathEscape(state.ID.ValueString()), nil, nil)
	if err != nil && !client.IsNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Phaseo guardrail", err.Error())
	}
}
func (r *guardrailResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}
func guardrailPayload(ctx context.Context, m guardrailModel, diags *diag.Diagnostics) map[string]any {
	body := map[string]any{"name": m.Name.ValueString()}
	strings := map[string]types.String{"description": m.Description, "providerRestrictionMode": m.ProviderRestrictionMode, "modelRestrictionMode": m.ModelRestrictionMode, "promptInjectionAction": m.PromptInjectionAction, "sensitiveInfoDefaultAction": m.SensitiveInfoDefaultAction}
	for k, v := range strings {
		if !v.IsNull() && !v.IsUnknown() {
			body[k] = v.ValueString()
		}
	}
	bools := map[string]types.Bool{"enabled": m.Enabled, "privacyEnablePaidMayTrain": m.PrivacyPaidMayTrain, "privacyEnableFreeMayTrain": m.PrivacyFreeMayTrain, "privacyEnableFreeMayPublishPrompts": m.PrivacyFreeMayPublishPrompts, "privacyEnableInputOutputLogging": m.PrivacyInputOutputLogging, "privacyZdrOnly": m.PrivacyZDROnly, "providerRestrictionEnforceAllowed": m.ProviderRestrictionEnforceAllowed, "promptInjectionEnabled": m.PromptInjectionEnabled, "sensitiveInfoEnabled": m.SensitiveInfoEnabled}
	for k, v := range bools {
		if !v.IsNull() && !v.IsUnknown() {
			body[k] = v.ValueBool()
		}
	}
	sets := map[string]types.Set{"providerRestrictionProviderIds": m.ProviderIDs, "allowedApiModelIds": m.ModelIDs}
	for k, v := range sets {
		if !v.IsNull() && !v.IsUnknown() {
			var values []string
			diags.Append(v.ElementsAs(ctx, &values, false)...)
			body[k] = values
		}
	}
	return body
}
func setGuardrail(ctx context.Context, m *guardrailModel, d guardrailAPIModel, diags *diag.Diagnostics) {
	m.ID = types.StringValue(d.ID)
	m.WorkspaceID = types.StringValue(d.WorkspaceID)
	m.Name = types.StringValue(d.Name)
	m.Description = nullableString(d.Description)
	m.Enabled = nullableBool(d.Enabled)
	m.PrivacyPaidMayTrain = nullableBool(d.PrivacyPaidMayTrain)
	m.PrivacyFreeMayTrain = nullableBool(d.PrivacyFreeMayTrain)
	m.PrivacyFreeMayPublishPrompts = nullableBool(d.PrivacyFreeMayPublishPrompts)
	m.PrivacyInputOutputLogging = nullableBool(d.PrivacyInputOutputLogging)
	m.PrivacyZDROnly = nullableBool(d.PrivacyZDROnly)
	m.ProviderRestrictionMode = nullableString(d.ProviderRestrictionMode)
	m.ProviderRestrictionEnforceAllowed = nullableBool(d.ProviderRestrictionEnforceAllowed)
	m.ModelRestrictionMode = nullableString(d.ModelRestrictionMode)
	m.PromptInjectionEnabled = nullableBool(d.PromptInjectionEnabled)
	m.PromptInjectionAction = nullableString(d.PromptInjectionAction)
	m.SensitiveInfoEnabled = nullableBool(d.SensitiveInfoEnabled)
	m.SensitiveInfoDefaultAction = nullableString(d.SensitiveInfoDefaultAction)
	m.CreatedAt = nullableString(d.CreatedAt)
	m.UpdatedAt = nullableString(d.UpdatedAt)
	var ds diag.Diagnostics
	m.ProviderIDs, ds = types.SetValueFrom(ctx, types.StringType, d.ProviderIDs)
	diags.Append(ds...)
	m.ModelIDs, ds = types.SetValueFrom(ctx, types.StringType, d.ModelIDs)
	diags.Append(ds...)
}
func nullableBool(v *bool) types.Bool {
	if v == nil {
		return types.BoolNull()
	}
	return types.BoolValue(*v)
}

var _ resource.ResourceWithConfigure = (*guardrailResource)(nil)
var _ resource.ResourceWithImportState = (*guardrailResource)(nil)
