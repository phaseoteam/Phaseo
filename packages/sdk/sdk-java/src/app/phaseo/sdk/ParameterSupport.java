package app.phaseo.sdk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Evaluates request parameters against live model endpoint metadata. */
public final class ParameterSupport {
	private static final ObjectMapper MAPPER = new ObjectMapper();
	private ParameterSupport() {}

	public static ObjectNode check(JsonNode model, Map<String, ?> values) {
		return check(model, values, Map.of());
	}

	public static ObjectNode check(JsonNode model, Map<String, ?> values, Map<String, ?> options) {
		Set<String> providers = new HashSet<>();
		Object providerOption = options.get("provider");
		if (providerOption instanceof Iterable<?> iterable) for (Object item : iterable) providers.add(String.valueOf(item));
		else if (providerOption != null) providers.add(String.valueOf(providerOption));
		String endpoint = options.get("endpoint") == null ? null : normalizeEndpoint(String.valueOf(options.get("endpoint")));
		List<JsonNode> routes = new ArrayList<>();
		for (JsonNode route : model.path("endpoints")) {
			if (!route.path("routable").asBoolean(false) || !"active".equals(route.path("status").asText())) continue;
			if (!providers.isEmpty() && !providers.contains(route.path("provider").path("id").asText())) continue;
			if (endpoint != null && !endpointMatches(route, endpoint)) continue;
			routes.add(route);
		}
		ArrayNode parameters = MAPPER.createArrayNode();
		for (Map.Entry<String, ?> entry : values.entrySet()) {
			String name = entry.getKey();
			JsonNode value = MAPPER.valueToTree(entry.getValue());
			ArrayNode supportedBy = MAPPER.createArrayNode();
			ArrayNode acceptedBy = MAPPER.createArrayNode();
			ArrayNode unsupportedBy = MAPPER.createArrayNode();
			ArrayNode constraints = MAPPER.createArrayNode();
			List<String> valueIssues = new ArrayList<>();
			int knownRoutes = 0;
			for (JsonNode route : routes) {
				ObjectNode reference = routeReference(route);
				JsonNode advertised = route.path("capabilities").path("parameters");
				if (!advertised.isArray()) { unsupportedBy.add(reference); continue; }
				knownRoutes++;
				JsonNode detail = route.path("capabilities").path("parameter_details").path(name);
				boolean supports = contains(advertised, name) || detail.path("supported").asBoolean(false);
				if (!supports || detail.path("supported").isBoolean() && !detail.path("supported").asBoolean()) { unsupportedBy.add(reference); continue; }
				supportedBy.add(reference);
				if (detail.isObject() && detail.size() > 0) {
					ObjectNode constraint = MAPPER.createObjectNode();
					constraint.set("route", reference);
					constraint.set("detail", detail);
					constraints.add(constraint);
				}
				List<String> issues = valueIssues(name, value, detail);
				if (issues.isEmpty()) acceptedBy.add(reference); else valueIssues.addAll(issues);
			}
			String status = routes.isEmpty() || knownRoutes == 0 ? "unknown" : supportedBy.isEmpty() ? "unsupported" : supportedBy.size() == routes.size() ? "supported" : "partial";
			ArrayNode issues = MAPPER.createArrayNode();
			if ("unsupported".equals(status)) issues.add(name + " is not supported by any matching active route");
			else if (!supportedBy.isEmpty() && acceptedBy.isEmpty()) new HashSet<>(valueIssues).forEach(issues::add);
			ObjectNode parameter = MAPPER.createObjectNode();
			parameter.put("name", name);
			parameter.set("value", value);
			parameter.put("status", status);
			parameter.set("supported_by", supportedBy);
			parameter.set("accepted_by", acceptedBy);
			parameter.set("unsupported_by", unsupportedBy);
			parameter.set("constraints", constraints);
			parameter.set("issues", issues);
			parameters.add(parameter);
		}
		ArrayNode matchingRoutes = MAPPER.createArrayNode();
		for (JsonNode route : routes) {
			ObjectNode reference = routeReference(route);
			boolean accepted = true;
			for (JsonNode parameter : parameters) if (!containsId(parameter.path("accepted_by"), reference.path("id").asText())) { accepted = false; break; }
			if (accepted) matchingRoutes.add(reference);
		}
		ArrayNode issues = MAPPER.createArrayNode();
		if (routes.isEmpty()) issues.add("No active routable model endpoints matched the filters");
		else if (matchingRoutes.isEmpty() && !parameters.isEmpty()) issues.add("No active route supports all requested parameter values together");
		Set<String> seen = new HashSet<>();
		for (JsonNode parameter : parameters) for (JsonNode issue : parameter.path("issues")) if (seen.add(issue.asText())) issues.add(issue.asText());
		ObjectNode report = MAPPER.createObjectNode();
		report.put("ok", !routes.isEmpty() && !matchingRoutes.isEmpty()).put("model_id", model.path("id").asText("unknown")).put("route_count", routes.size());
		report.set("matching_routes", matchingRoutes);
		report.set("parameters", parameters);
		report.set("issues", issues);
		return report;
	}

	private static ObjectNode routeReference(JsonNode route) { String provider=route.path("provider").path("id").asText("unknown"); String endpoint=route.path("endpoint").asText(route.path("capability_id").asText("unknown")); ObjectNode ref=MAPPER.createObjectNode(); ref.put("id",route.path("id").asText(provider+":"+endpoint)).put("provider",provider).put("endpoint",endpoint).put("public_path",route.path("public_path").asText(endpoint)); return ref; }
	private static boolean endpointMatches(JsonNode route,String endpoint){return endpoint.equals(route.path("endpoint").asText())||endpoint.equals(route.path("capability_id").asText())||endpoint.equals(normalizeEndpoint(route.path("public_path").asText()));}
	private static String normalizeEndpoint(String value){return value.replaceFirst("^/?(?:v1/)?","");}
	private static boolean contains(JsonNode array,String value){for(JsonNode item:array)if(value.equals(item.asText()))return true;return false;}
	private static boolean containsId(JsonNode array,String id){for(JsonNode item:array)if(id.equals(item.path("id").asText()))return true;return false;}
	private static List<String> valueIssues(String name,JsonNode value,JsonNode detail){List<String> issues=new ArrayList<>();JsonNode allowed=detail.has("values")?detail.path("values"):detail.path("enum");if(allowed.isArray()){boolean found=false;for(JsonNode item:allowed)if(item.equals(value)){found=true;break;}if(!found)issues.add(name+" must be one of: "+join(allowed));}if(value.isNumber()){double number=value.asDouble();if(!Double.isFinite(number))issues.add(name+" must be finite");if(detail.has("minimum")&&number<detail.path("minimum").asDouble())issues.add(name+" must be at least "+detail.path("minimum").asText());if(detail.has("maximum")&&number>detail.path("maximum").asDouble())issues.add(name+" must be at most "+detail.path("maximum").asText());if(detail.path("step").asDouble(0)>0){double step=detail.path("step").asDouble();double steps=(number-detail.path("minimum").asDouble(0))/step;if(Math.abs(steps-Math.rint(steps))>1e-8)issues.add(name+" must use steps of "+detail.path("step").asText());}}return issues;}
	private static String join(JsonNode array){List<String> values=new ArrayList<>();for(JsonNode item:array)values.add(item.asText());return String.join(", ",values);}
}
