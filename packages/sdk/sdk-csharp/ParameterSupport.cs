using System.Text.Json;
using System.Text.Json.Nodes;

namespace PhaseoSdk;

public static class ParameterSupport
{
    public static JsonObject Check(JsonNode model, IReadOnlyDictionary<string, object?> values, IReadOnlyDictionary<string, object?>? options = null)
    {
        options ??= new Dictionary<string, object?>();
        var providers = new HashSet<string>(StringComparer.Ordinal);
        if (options.TryGetValue("provider", out var providerOption) && providerOption is not null)
        {
            if (providerOption is IEnumerable<string> many) foreach (var provider in many) providers.Add(provider);
            else providers.Add(providerOption.ToString()!);
        }
        var endpoint = options.TryGetValue("endpoint", out var endpointOption) ? NormalizeEndpoint(endpointOption?.ToString() ?? "") : null;
        var routes = (model["endpoints"] as JsonArray ?? [])
            .Where(route => route?["routable"]?.GetValue<bool>() == true && route?["status"]?.GetValue<string>() == "active")
            .Where(route => providers.Count == 0 || providers.Contains(route?["provider"]?["id"]?.GetValue<string>() ?? ""))
            .Where(route => endpoint is null || EndpointMatches(route!, endpoint))
            .Select(route => route!).ToList();

        var parameters = new JsonArray();
        foreach (var (name, rawValue) in values)
        {
            var value = JsonSerializer.SerializeToNode(rawValue);
            var supportedBy = new JsonArray(); var acceptedBy = new JsonArray(); var unsupportedBy = new JsonArray(); var constraints = new JsonArray();
            var valueIssues = new List<string>(); var knownRoutes = 0;
            foreach (var route in routes)
            {
                var reference = RouteReference(route);
                if (route["capabilities"]?["parameters"] is not JsonArray advertised) { unsupportedBy.Add(reference); continue; }
                knownRoutes++;
                var detail = route["capabilities"]?["parameter_details"]?[name] as JsonObject ?? new JsonObject();
                var supports = advertised.Any(item => item?.GetValue<string>() == name) || detail["supported"]?.GetValue<bool>() == true;
                if (!supports || detail["supported"]?.GetValue<bool>() == false) { unsupportedBy.Add(reference); continue; }
                supportedBy.Add(reference);
                if (detail.Count > 0) constraints.Add(new JsonObject { ["route"] = reference.DeepClone(), ["detail"] = detail.DeepClone() });
                var issues = ValueIssues(name, value, detail);
                if (issues.Count == 0) acceptedBy.Add(reference.DeepClone()); else valueIssues.AddRange(issues);
            }
            var status = routes.Count == 0 || knownRoutes == 0 ? "unknown" : supportedBy.Count == 0 ? "unsupported" : supportedBy.Count == routes.Count ? "supported" : "partial";
            var issuesNode = new JsonArray();
            if (status == "unsupported") issuesNode.Add($"{name} is not supported by any matching active route");
            else if (supportedBy.Count > 0 && acceptedBy.Count == 0) foreach (var issue in valueIssues.Distinct()) issuesNode.Add(issue);
            parameters.Add(new JsonObject { ["name"] = name, ["value"] = value, ["status"] = status, ["supported_by"] = supportedBy, ["accepted_by"] = acceptedBy, ["unsupported_by"] = unsupportedBy, ["constraints"] = constraints, ["issues"] = issuesNode });
        }

        var matchingRoutes = new JsonArray();
        foreach (var route in routes)
        {
            var reference = RouteReference(route); var id = reference["id"]!.GetValue<string>();
            if (parameters.All(parameter => (parameter?["accepted_by"] as JsonArray)?.Any(candidate => candidate?["id"]?.GetValue<string>() == id) == true)) matchingRoutes.Add(reference);
        }
        var reportIssues = new JsonArray();
        if (routes.Count == 0) reportIssues.Add("No active routable model endpoints matched the filters");
        else if (matchingRoutes.Count == 0 && parameters.Count > 0) reportIssues.Add("No active route supports all requested parameter values together");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var parameter in parameters) foreach (var issue in parameter?["issues"] as JsonArray ?? []) { var text = issue!.GetValue<string>(); if (seen.Add(text)) reportIssues.Add(text); }
        return new JsonObject { ["ok"] = routes.Count > 0 && matchingRoutes.Count > 0, ["model_id"] = model["id"]?.GetValue<string>() ?? "unknown", ["route_count"] = routes.Count, ["matching_routes"] = matchingRoutes, ["parameters"] = parameters, ["issues"] = reportIssues };
    }

    private static JsonObject RouteReference(JsonNode route) { var provider=route["provider"]?["id"]?.GetValue<string>() ?? "unknown"; var endpoint=route["endpoint"]?.GetValue<string>() ?? route["capability_id"]?.GetValue<string>() ?? "unknown"; return new JsonObject { ["id"] = route["id"]?.GetValue<string>() ?? $"{provider}:{endpoint}", ["provider"] = provider, ["endpoint"] = endpoint, ["public_path"] = route["public_path"]?.GetValue<string>() ?? endpoint }; }
    private static bool EndpointMatches(JsonNode route,string endpoint) => endpoint == route["endpoint"]?.GetValue<string>() || endpoint == route["capability_id"]?.GetValue<string>() || endpoint == NormalizeEndpoint(route["public_path"]?.GetValue<string>() ?? "");
    private static string NormalizeEndpoint(string value) { if(value.StartsWith("/v1/")) return value[4..]; return value.TrimStart('/'); }
    private static List<string> ValueIssues(string name,JsonNode? value,JsonObject detail) { var issues=new List<string>(); var allowed=detail["values"] as JsonArray ?? detail["enum"] as JsonArray; if(allowed is not null && !allowed.Any(item=>JsonNode.DeepEquals(item,value))) issues.Add($"{name} must be one of: {string.Join(", ",allowed.Select(item=>item?.ToString()))}"); if(value is JsonValue jsonValue && jsonValue.TryGetValue<double>(out var number)){if(!double.IsFinite(number))issues.Add($"{name} must be finite");if(detail["minimum"]?.GetValue<double>() is double min&&number<min)issues.Add($"{name} must be at least {min}");if(detail["maximum"]?.GetValue<double>() is double max&&number>max)issues.Add($"{name} must be at most {max}");if(detail["step"]?.GetValue<double>() is double step&&step>0){var start=detail["minimum"]?.GetValue<double>()??0;if(Math.Abs((number-start)/step-Math.Round((number-start)/step))>1e-8)issues.Add($"{name} must use steps of {step}");}}return issues; }
}
