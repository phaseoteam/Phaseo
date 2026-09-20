package phaseo

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3/src/gen"
)

type ParameterSupportStatus string

const (
	ParameterSupported   ParameterSupportStatus = "supported"
	ParameterPartial     ParameterSupportStatus = "partial"
	ParameterUnsupported ParameterSupportStatus = "unsupported"
	ParameterUnknown     ParameterSupportStatus = "unknown"
)

type ParameterRouteReference struct {
	ID         string `json:"id"`
	Provider   string `json:"provider"`
	Endpoint   string `json:"endpoint"`
	PublicPath string `json:"public_path"`
}

type ParameterConstraint struct {
	Route  ParameterRouteReference `json:"route"`
	Detail map[string]any          `json:"detail"`
}

type ParameterSupport struct {
	Name          string                    `json:"name"`
	Value         any                       `json:"value"`
	Status        ParameterSupportStatus    `json:"status"`
	SupportedBy   []ParameterRouteReference `json:"supported_by"`
	AcceptedBy    []ParameterRouteReference `json:"accepted_by"`
	UnsupportedBy []ParameterRouteReference `json:"unsupported_by"`
	Constraints   []ParameterConstraint     `json:"constraints"`
	Issues        []string                  `json:"issues"`
}

type ParameterSupportOptions struct {
	Endpoint  string
	Providers []string
}

type ParameterSupportReport struct {
	OK             bool                      `json:"ok"`
	ModelID        string                    `json:"model_id"`
	RouteCount     int                       `json:"route_count"`
	MatchingRoutes []ParameterRouteReference `json:"matching_routes"`
	Parameters     []ParameterSupport        `json:"parameters"`
	Issues         []string                  `json:"issues"`
}

type PreflightReport struct {
	OK                bool                   `json:"ok"`
	ModelID           string                 `json:"model_id"`
	CheckedParameters map[string]any         `json:"checked_parameters"`
	ParameterSupport  ParameterSupportReport `json:"parameter_support"`
}

var preflightStructuralFields = map[string]bool{
	"model": true, "input": true, "messages": true, "prompt": true, "contents": true,
	"provider": true, "providers": true, "routing": true, "metadata": true,
	"session_id": true, "app": true, "webhook": true, "idempotency_key": true,
}

func splitModelID(modelID string) (map[string]string, error) {
	parts := strings.SplitN(strings.TrimSpace(modelID), "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, fmt.Errorf("model ID must use author/slug format")
	}
	return map[string]string{"author": parts[0], "slug": parts[1]}, nil
}

// GetModelEndpointCapabilities returns live, provider-specific endpoint metadata for a model.
func (c *Phaseo) GetModelEndpointCapabilities(_ context.Context, modelID string, query map[string]string) (map[string]interface{}, error) {
	path, err := splitModelID(modelID)
	if err != nil {
		return nil, err
	}
	return gen.ListModelEndpoints(c.raw, path, query, nil, nil)
}

// CheckModelParameters reports which active routes support and accept the supplied values.
func (c *Phaseo) CheckModelParameters(ctx context.Context, modelID string, values map[string]any, options ParameterSupportOptions) (ParameterSupportReport, error) {
	payload, err := c.GetModelEndpointCapabilities(ctx, modelID, nil)
	if err != nil {
		return ParameterSupportReport{}, err
	}
	return CheckParameterSupport(payload, values, options), nil
}

// PreflightRequest checks every non-structural request field against live model routes.
func (c *Phaseo) PreflightRequest(ctx context.Context, request map[string]any, options ParameterSupportOptions) (PreflightReport, error) {
	modelID := strings.TrimSpace(asString(request["model"]))
	if modelID == "" { return PreflightReport{}, fmt.Errorf("preflight requires request model") }
	values := map[string]any{}
	for name, value := range request {
		if !preflightStructuralFields[name] && value != nil { values[name] = value }
	}
	support, err := c.CheckModelParameters(ctx, modelID, values, options)
	if err != nil { return PreflightReport{}, err }
	return PreflightReport{OK: support.OK, ModelID: modelID, CheckedParameters: values, ParameterSupport: support}, nil
}

// CheckParameterSupport builds a UI-friendly report from a model endpoint response.
func CheckParameterSupport(model map[string]any, values map[string]any, options ParameterSupportOptions) ParameterSupportReport {
	providerFilter := map[string]bool{}
	for _, provider := range options.Providers {
		providerFilter[provider] = true
	}
	routes := []map[string]any{}
	for _, raw := range asSlice(model["endpoints"]) {
		route, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if route["routable"] != true || asString(route["status"]) != "active" {
			continue
		}
		provider := asString(asMap(route["provider"])["id"])
		if len(providerFilter) > 0 && !providerFilter[provider] {
			continue
		}
		if options.Endpoint != "" && !endpointMatches(route, options.Endpoint) {
			continue
		}
		routes = append(routes, route)
	}
	parameters := make([]ParameterSupport, 0, len(values))
	for name, value := range values {
		item := ParameterSupport{Name: name, Value: value, SupportedBy: []ParameterRouteReference{}, AcceptedBy: []ParameterRouteReference{}, UnsupportedBy: []ParameterRouteReference{}, Constraints: []ParameterConstraint{}, Issues: []string{}}
		knownRoutes := 0
		valueIssues := []string{}
		for _, route := range routes {
			ref := routeReference(route)
			capabilities := asMap(route["capabilities"])
			advertised, known := stringSlice(capabilities["parameters"])
			if !known {
				item.UnsupportedBy = append(item.UnsupportedBy, ref)
				continue
			}
			knownRoutes++
			detail := asMap(asMap(capabilities["parameter_details"])[name])
			if !contains(advertised, name) && detail["supported"] != true || detail["supported"] == false {
				item.UnsupportedBy = append(item.UnsupportedBy, ref)
				continue
			}
			item.SupportedBy = append(item.SupportedBy, ref)
			if len(detail) > 0 {
				item.Constraints = append(item.Constraints, ParameterConstraint{Route: ref, Detail: detail})
			}
			issues := parameterValueIssues(name, value, detail)
			if len(issues) == 0 {
				item.AcceptedBy = append(item.AcceptedBy, ref)
			} else {
				valueIssues = append(valueIssues, issues...)
			}
		}
		switch {
		case len(routes) == 0 || knownRoutes == 0:
			item.Status = ParameterUnknown
		case len(item.SupportedBy) == 0:
			item.Status = ParameterUnsupported
		case len(item.SupportedBy) == len(routes):
			item.Status = ParameterSupported
		default:
			item.Status = ParameterPartial
		}
		if item.Status == ParameterUnsupported {
			item.Issues = []string{fmt.Sprintf("%s is not supported by any matching active route", name)}
		} else if len(item.SupportedBy) > 0 && len(item.AcceptedBy) == 0 {
			item.Issues = unique(valueIssues)
		}
		parameters = append(parameters, item)
	}
	matching := []ParameterRouteReference{}
	for _, route := range routes {
		ref := routeReference(route)
		if everyAccepted(parameters, ref.ID) {
			matching = append(matching, ref)
		}
	}
	issues := []string{}
	if len(routes) == 0 {
		issues = append(issues, "No active routable model endpoints matched the filters")
	} else if len(matching) == 0 && len(parameters) > 0 {
		issues = append(issues, "No active route supports all requested parameter values together")
	}
	for _, parameter := range parameters {
		issues = append(issues, parameter.Issues...)
	}
	modelID := asString(model["id"])
	if modelID == "" {
		modelID = "unknown"
	}
	return ParameterSupportReport{OK: len(routes) > 0 && len(matching) > 0, ModelID: modelID, RouteCount: len(routes), MatchingRoutes: matching, Parameters: parameters, Issues: unique(issues)}
}

func routeReference(route map[string]any) ParameterRouteReference {
	provider := asString(asMap(route["provider"])["id"])
	if provider == "" {
		provider = "unknown"
	}
	endpoint := asString(route["endpoint"])
	if endpoint == "" {
		endpoint = asString(route["capability_id"])
	}
	id := asString(route["id"])
	if id == "" {
		id = provider + ":" + endpoint
	}
	publicPath := asString(route["public_path"])
	if publicPath == "" {
		publicPath = endpoint
	}
	return ParameterRouteReference{ID: id, Provider: provider, Endpoint: endpoint, PublicPath: publicPath}
}
func endpointMatches(route map[string]any, requested string) bool {
	normalized := strings.TrimPrefix(strings.TrimPrefix(requested, "/v1/"), "/")
	for _, value := range []string{asString(route["endpoint"]), asString(route["capability_id"]), strings.TrimPrefix(strings.TrimPrefix(asString(route["public_path"]), "/v1/"), "/")} {
		if value == requested || value == normalized {
			return true
		}
	}
	return false
}
func parameterValueIssues(name string, value any, detail map[string]any) []string {
	issues := []string{}
	if detail["supported"] == false {
		issues = append(issues, name+" is unsupported")
	}
	allowed := asSlice(detail["values"])
	if len(allowed) == 0 {
		allowed = asSlice(detail["enum"])
	}
	if len(allowed) > 0 {
		encoded, _ := json.Marshal(value)
		found := false
		for _, item := range allowed {
			other, _ := json.Marshal(item)
			if string(encoded) == string(other) {
				found = true
				break
			}
		}
		if !found {
			parts := []string{}
			for _, item := range allowed {
				parts = append(parts, fmt.Sprint(item))
			}
			issues = append(issues, fmt.Sprintf("%s must be one of: %s", name, strings.Join(parts, ", ")))
		}
	}
	number, ok := asFloat(value)
	if ok {
		if math.IsInf(number, 0) || math.IsNaN(number) {
			issues = append(issues, name+" must be finite")
		}
		if minimum, ok := asFloat(detail["minimum"]); ok && number < minimum {
			issues = append(issues, fmt.Sprintf("%s must be at least %v", name, minimum))
		}
		if maximum, ok := asFloat(detail["maximum"]); ok && number > maximum {
			issues = append(issues, fmt.Sprintf("%s must be at most %v", name, maximum))
		}
		if step, ok := asFloat(detail["step"]); ok && step > 0 {
			minimum, _ := asFloat(detail["minimum"])
			steps := (number - minimum) / step
			if math.Abs(steps-math.Round(steps)) > 1e-8 {
				issues = append(issues, fmt.Sprintf("%s must use steps of %v", name, step))
			}
		}
	}
	return issues
}
func asFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	default:
		return 0, false
	}
}
func stringSlice(v any) ([]string, bool) {
	raw, ok := v.([]any)
	if !ok {
		return nil, false
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if text, ok := item.(string); ok {
			out = append(out, text)
		}
	}
	return out, true
}
func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
func everyAccepted(parameters []ParameterSupport, routeID string) bool {
	for _, parameter := range parameters {
		found := false
		for _, route := range parameter.AcceptedBy {
			if route.ID == routeID {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
func unique(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		if !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	return out
}
