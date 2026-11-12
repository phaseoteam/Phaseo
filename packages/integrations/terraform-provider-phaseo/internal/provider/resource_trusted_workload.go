package provider

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"

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
var _ resource.ResourceWithValidateConfig = (*trustedWorkloadResource)(nil)
var _ resource.ResourceWithModifyPlan = (*trustedWorkloadResource)(nil)

type trustedWorkloadResource struct{ client *client.Client }
type trustedWorkloadModel struct {
	ID                      types.String `tfsdk:"id"`
	Name                    types.String `tfsdk:"name"`
	Platform                types.String `tfsdk:"platform"`
	Issuer                  types.String `tfsdk:"issuer"`
	OwnerClaim              types.String `tfsdk:"owner_claim"`
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
	OwnerClaim              string              `json:"owner_claim"`
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

// Slashes and colons appear in platform claims such as oidc.circleci.com/org-id.
var claimName = regexp.MustCompile(`^[A-Za-z0-9._:/-]{1,128}$`)

// Registered claims the API checks itself; they can be neither conditions nor the owner claim.
var reservedClaims = []string{"iss", "aud", "exp", "iat", "nbf", "jti"}

// Printable ASCII only, so look-alike spaces never reach the per-platform checks.
var workloadIssuerShape = regexp.MustCompile(`^https://[!-~]+$`)
var conditionValueList = types.ListType{ElemType: types.StringType}

const workloadUUID = `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`

type workloadPlatform struct {
	issuer        *regexp.Regexp
	host          *regexp.Regexp
	issuerHint    string
	defaultIssuer string
	ownerClaim    string
}

// Mirrors apps/api/src/lib/workload-identity/issuers.ts and REQUIRED_PINNED_CLAIMS in policy.ts.
var workloadPlatforms = map[string]workloadPlatform{
	"vercel": {
		issuer: regexp.MustCompile(`^https://oidc\.vercel\.com(/[a-z0-9][a-z0-9_-]{0,99})?$`), host: regexp.MustCompile(`^oidc\.vercel\.com$`),
		issuerHint: "https://oidc.vercel.com/<team-slug> or https://oidc.vercel.com", ownerClaim: "owner_id",
	},
	"github_actions": {
		issuer: regexp.MustCompile(`^https://token\.actions\.githubusercontent\.com(/[a-z0-9][a-z0-9_-]{0,99})?$`), host: regexp.MustCompile(`^token\.actions\.githubusercontent\.com$`),
		issuerHint: "https://token.actions.githubusercontent.com, optionally followed by /<enterprise-slug>", defaultIssuer: "https://token.actions.githubusercontent.com", ownerClaim: "repository_owner_id",
	},
	"gitlab": {
		issuer: regexp.MustCompile(`^https://gitlab\.com$`), host: regexp.MustCompile(`^gitlab\.com$`),
		issuerHint: "https://gitlab.com (use platform = \"custom\" for self-managed GitLab)", defaultIssuer: "https://gitlab.com", ownerClaim: "project_id",
	},
	"google_cloud": {
		issuer: regexp.MustCompile(`^https://accounts\.google\.com$`), host: regexp.MustCompile(`^accounts\.google\.com$`),
		issuerHint: "https://accounts.google.com", defaultIssuer: "https://accounts.google.com", ownerClaim: "sub",
	},
	"buildkite": {
		issuer: regexp.MustCompile(`^https://agent\.buildkite\.com$`), host: regexp.MustCompile(`^agent\.buildkite\.com$`),
		issuerHint: "https://agent.buildkite.com", defaultIssuer: "https://agent.buildkite.com", ownerClaim: "organization_id",
	},
	"circleci": {
		issuer: regexp.MustCompile(`^https://oidc\.circleci\.com/org/` + workloadUUID + `$`), host: regexp.MustCompile(`^oidc\.circleci\.com$`),
		issuerHint: "https://oidc.circleci.com/org/<organization-id>", ownerClaim: "oidc.circleci.com/org-id",
	},
	"aws": {
		issuer: regexp.MustCompile(`^https://` + workloadUUID + `\.tokens\.sts\.global\.api\.aws$`), host: regexp.MustCompile(`(^|\.)tokens\.sts\.global\.api\.aws$`),
		issuerHint: "your account's https://<id>.tokens.sts.global.api.aws issuer", ownerClaim: "sub",
	},
}

var workloadPlatformNames = []string{"vercel", "github_actions", "gitlab", "google_cloud", "buildkite", "circleci", "aws", "custom"}

var workloadIPv4 = regexp.MustCompile(`^\d{1,3}(\.\d{1,3}){3}$`)
var workloadLocalHost = regexp.MustCompile(`(^|\.)(localhost|local|internal|localdomain|home\.arpa)$`)

// A basic check of a custom issuer; the API also fetches its discovery document.
func isCustomWorkloadIssuer(issuer string) bool {
	if len(issuer) > 256 || !workloadIssuerShape.MatchString(issuer) {
		return false
	}
	u, err := url.Parse(issuer)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(issuer, "#") {
		return false
	}
	host := u.Hostname()
	if host != strings.ToLower(host) || !strings.Contains(host, ".") || strings.HasPrefix(u.Host, "[") || workloadIPv4.MatchString(host) || workloadLocalHost.MatchString(host) {
		return false
	}
	for _, platform := range workloadPlatforms {
		if platform.host.MatchString(host) {
			return false
		}
	}
	return true
}

func NewTrustedWorkloadResource() resource.Resource { return &trustedWorkloadResource{} }
func (r *trustedWorkloadResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_trusted_workload"
}
func (r *trustedWorkloadResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	keep := []planmodifier.String{stringplanmodifier.UseStateForUnknown()}
	replace := []planmodifier.String{stringplanmodifier.RequiresReplace()}
	resp.Schema = schema.Schema{Description: "A trust policy that lets deployments, CI jobs and cloud workloads (Vercel, GitHub Actions, GitLab, Google Cloud, Buildkite, CircleCI, AWS or your own OIDC issuer) call Phaseo with their OIDC token instead of an API key. Beta: only workspaces in the trusted workloads beta can use it.", Attributes: map[string]schema.Attribute{
		"id":       schema.StringAttribute{Computed: true, PlanModifiers: keep},
		"name":     schema.StringAttribute{Required: true, Validators: []validator.String{stringvalidator.LengthBetween(1, 100), stringvalidator.RegexMatches(trimmedText, "must not start or end with whitespace")}},
		"platform": schema.StringAttribute{Required: true, Description: "vercel, github_actions, gitlab, google_cloud, buildkite, circleci, aws or custom (any other OIDC issuer). Changing it replaces the policy.", PlanModifiers: replace, Validators: []validator.String{stringvalidator.OneOf(workloadPlatformNames...)}},
		"issuer": schema.StringAttribute{Optional: true, Computed: true, Description: "Token issuer. Optional for github_actions (defaults to https://token.actions.githubusercontent.com), gitlab (https://gitlab.com), google_cloud (https://accounts.google.com) and buildkite (https://agent.buildkite.com). Required for vercel, circleci, aws and custom. Changing it replaces the policy.",
			PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown(), stringplanmodifier.RequiresReplaceIfConfigured()},
			Validators:    []validator.String{stringvalidator.RegexMatches(workloadIssuerShape, "must be an https URL")}},
		"owner_claim": schema.StringAttribute{Optional: true, Computed: true, Description: "The token claim owner_id is matched against. Required for custom; fixed for the other platforms (owner_id, repository_owner_id, project_id, sub, organization_id, oidc.circleci.com/org-id or sub), so it can be omitted. Changing it replaces the policy.",
			PlanModifiers: []planmodifier.String{stringplanmodifier.RequiresReplaceIfConfigured()},
			Validators:    []validator.String{stringvalidator.RegexMatches(claimName, "must be 1 to 128 letters, digits, '.', '_', ':', '/' or '-'"), stringvalidator.NoneOf(reservedClaims...)}},
		"owner_id": schema.StringAttribute{Required: true, Description: "The value owner_claim must equal: a Vercel team ID, GitHub organisation or user ID, GitLab project ID, Google service account unique ID, Buildkite organization ID, CircleCI organization ID, AWS IAM role ARN, or the trusted value for a custom issuer. Changing it replaces the policy.", PlanModifiers: replace, Validators: []validator.String{stringvalidator.RegexMatches(trimmedText, "must not be empty or start or end with whitespace")}},
		"claim_conditions": schema.MapAttribute{Optional: true, ElementType: conditionValueList, Description: "Extra claims the token must match: claim name to allowed values. Up to 15 claims; the owner claim is set with owner_id and counts toward the API's 16.", Validators: []validator.Map{
			mapvalidator.SizeAtMost(15),
			mapvalidator.KeysAre(stringvalidator.RegexMatches(claimName, "must be 1 to 128 letters, digits, '.', '_', ':', '/' or '-'"), stringvalidator.NoneOf(reservedClaims...)),
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

// Checks that span attributes, so plans fail before the API refuses the policy.
func (r *trustedWorkloadResource) ValidateConfig(ctx context.Context, req resource.ValidateConfigRequest, resp *resource.ValidateConfigResponse) {
	var config trustedWorkloadModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() || config.Platform.IsUnknown() || config.Platform.IsNull() {
		return
	}
	name := config.Platform.ValueString()
	platform, preset := workloadPlatforms[name]
	if !preset && name != "custom" {
		return // The OneOf validator reports it.
	}

	issuerSet := !config.Issuer.IsNull() && !config.Issuer.IsUnknown()
	switch {
	case config.Issuer.IsNull() && (!preset || platform.defaultIssuer == ""):
		resp.Diagnostics.AddAttributeError(path.Root("issuer"), "Missing issuer", fmt.Sprintf("issuer is required when platform is %q.", name))
	case issuerSet && preset && !platform.issuer.MatchString(config.Issuer.ValueString()):
		resp.Diagnostics.AddAttributeError(path.Root("issuer"), "Invalid Attribute Value", fmt.Sprintf("A %s issuer must be %s.", name, platform.issuerHint))
	case issuerSet && !preset && !isCustomWorkloadIssuer(config.Issuer.ValueString()):
		resp.Diagnostics.AddAttributeError(path.Root("issuer"), "Invalid Attribute Value", "A custom issuer must be a public https URL with no port, credentials, query or fragment, on a host that does not belong to one of the other platforms.")
	}

	ownerClaim := platform.ownerClaim
	switch {
	case !preset && config.OwnerClaim.IsNull():
		resp.Diagnostics.AddAttributeError(path.Root("owner_claim"), "Missing owner_claim", "owner_claim is required when platform is \"custom\", for example \"sub\".")
	case !preset && config.OwnerClaim.IsUnknown():
		ownerClaim = ""
	case !preset:
		ownerClaim = config.OwnerClaim.ValueString()
	case !config.OwnerClaim.IsNull() && !config.OwnerClaim.IsUnknown() && config.OwnerClaim.ValueString() != platform.ownerClaim:
		resp.Diagnostics.AddAttributeError(path.Root("owner_claim"), "Invalid Attribute Value", fmt.Sprintf("owner_claim is always %q for %s; omit it.", platform.ownerClaim, name))
	}
	if ownerClaim != "" && !config.ClaimConditions.IsNull() && !config.ClaimConditions.IsUnknown() {
		if _, ok := config.ClaimConditions.Elements()[ownerClaim]; ok {
			resp.Diagnostics.AddAttributeError(path.Root("claim_conditions"), "Invalid Attribute Value", fmt.Sprintf("Set %s with owner_id, not in claim_conditions.", ownerClaim))
		}
	}
	// A CircleCI issuer belongs to one organization; the pinned organization must be that one.
	if name == "circleci" && issuerSet && !config.OwnerID.IsNull() && !config.OwnerID.IsUnknown() {
		issuer := config.Issuer.ValueString()
		if orgID := issuer[strings.LastIndex(issuer, "/")+1:]; config.OwnerID.ValueString() != orgID {
			resp.Diagnostics.AddAttributeError(path.Root("owner_id"), "Invalid Attribute Value", "owner_id must be the organization ID in the CircleCI issuer.")
		}
	}
}

// Preset platforms always pin the same claim, so it is known at plan time.
func (r *trustedWorkloadResource) ModifyPlan(ctx context.Context, req resource.ModifyPlanRequest, resp *resource.ModifyPlanResponse) {
	if req.Plan.Raw.IsNull() {
		return
	}
	var plan trustedWorkloadModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() || plan.Platform.IsUnknown() || !plan.OwnerClaim.IsUnknown() {
		return
	}
	if platform, ok := workloadPlatforms[plan.Platform.ValueString()]; ok {
		resp.Diagnostics.Append(resp.Plan.SetAttribute(ctx, path.Root("owner_claim"), platform.ownerClaim)...)
	}
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
	if plan.Platform.ValueString() == "custom" && !plan.OwnerClaim.IsNull() && !plan.OwnerClaim.IsUnknown() {
		body["owner_claim"] = plan.OwnerClaim.ValueString()
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
	ownerClaim := d.OwnerClaim
	if ownerClaim == "" {
		ownerClaim = workloadPlatforms[d.Provider].ownerClaim
	}
	m.OwnerClaim = types.StringValue(ownerClaim)
	m.OwnerID = types.StringValue(d.OwnerID)
	// The API returns {} for no conditions; keep null or {} as configured.
	if len(d.ClaimConditions) == 0 {
		if m.ClaimConditions.IsNull() || m.ClaimConditions.IsUnknown() {
			m.ClaimConditions = types.MapNull(conditionValueList)
		} else {
			m.ClaimConditions = types.MapValueMust(conditionValueList, map[string]attr.Value{})
		}
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
