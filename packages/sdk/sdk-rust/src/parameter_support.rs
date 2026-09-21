use std::collections::{HashMap, HashSet};

use serde_json::{json, Value};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ParameterSupportOptions {
    pub endpoint: Option<String>,
    pub providers: Vec<String>,
}

/// Builds a UI-friendly report from live model endpoint metadata.
pub fn check_parameter_support(
    model: &Value,
    values: &HashMap<String, Value>,
    options: &ParameterSupportOptions,
) -> Value {
    let providers: HashSet<&str> = options.providers.iter().map(String::as_str).collect();
    let requested_endpoint = options.endpoint.as_deref().map(normalize_endpoint);
    let routes: Vec<&Value> = model["endpoints"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|route| {
            route["routable"].as_bool() == Some(true)
                && route["status"].as_str() == Some("active")
                && (providers.is_empty()
                    || providers.contains(route["provider"]["id"].as_str().unwrap_or("")))
                && requested_endpoint
                    .as_ref()
                    .map(|endpoint| endpoint_matches(route, endpoint))
                    .unwrap_or(true)
        })
        .collect();
    let mut parameters = Vec::new();
    for (name, value) in values {
        let mut supported_by = Vec::new();
        let mut accepted_by = Vec::new();
        let mut unsupported_by = Vec::new();
        let mut constraints = Vec::new();
        let mut value_issues = Vec::new();
        let mut known_routes = 0;
        for route in &routes {
            let reference = route_reference(route);
            let Some(advertised) = route["capabilities"]["parameters"].as_array() else {
                unsupported_by.push(reference);
                continue;
            };
            known_routes += 1;
            let detail = &route["capabilities"]["parameter_details"][name];
            let supports = advertised.iter().any(|item| item.as_str() == Some(name))
                || detail["supported"].as_bool() == Some(true);
            if !supports || detail["supported"].as_bool() == Some(false) {
                unsupported_by.push(reference);
                continue;
            }
            supported_by.push(reference.clone());
            if detail.as_object().is_some_and(|object| !object.is_empty()) {
                constraints.push(json!({"route": reference, "detail": detail}));
            }
            let issues = parameter_value_issues(name, value, detail);
            if issues.is_empty() {
                accepted_by.push(reference);
            } else {
                value_issues.extend(issues);
            }
        }
        let status = if routes.is_empty() || known_routes == 0 {
            "unknown"
        } else if supported_by.is_empty() {
            "unsupported"
        } else if supported_by.len() == routes.len() {
            "supported"
        } else {
            "partial"
        };
        let issues = if status == "unsupported" {
            vec![format!(
                "{name} is not supported by any matching active route"
            )]
        } else if !supported_by.is_empty() && accepted_by.is_empty() {
            unique(value_issues)
        } else {
            Vec::new()
        };
        parameters.push(json!({"name":name,"value":value,"status":status,"supported_by":supported_by,"accepted_by":accepted_by,"unsupported_by":unsupported_by,"constraints":constraints,"issues":issues}));
    }
    let matching_routes: Vec<Value> = routes
        .iter()
        .filter_map(|route| {
            let reference = route_reference(route);
            let id = reference["id"].as_str()?;
            parameters
                .iter()
                .all(|parameter| {
                    parameter["accepted_by"].as_array().is_some_and(|items| {
                        items.iter().any(|item| item["id"].as_str() == Some(id))
                    })
                })
                .then_some(reference)
        })
        .collect();
    let mut issues = Vec::new();
    if routes.is_empty() {
        issues.push("No active routable model endpoints matched the filters".to_string());
    } else if matching_routes.is_empty() && !parameters.is_empty() {
        issues.push("No active route supports all requested parameter values together".to_string());
    }
    for parameter in &parameters {
        for issue in parameter["issues"].as_array().into_iter().flatten() {
            if let Some(issue) = issue.as_str() {
                issues.push(issue.to_string())
            }
        }
    }
    json!({"ok":!routes.is_empty()&&!matching_routes.is_empty(),"model_id":model["id"].as_str().unwrap_or("unknown"),"route_count":routes.len(),"matching_routes":matching_routes,"parameters":parameters,"issues":unique(issues)})
}

fn route_reference(route: &Value) -> Value {
    let provider = route["provider"]["id"].as_str().unwrap_or("unknown");
    let endpoint = route["endpoint"]
        .as_str()
        .or_else(|| route["capability_id"].as_str())
        .unwrap_or("unknown");
    json!({"id":route["id"].as_str().map(str::to_owned).unwrap_or_else(||format!("{provider}:{endpoint}")),"provider":provider,"endpoint":endpoint,"public_path":route["public_path"].as_str().unwrap_or(endpoint)})
}
fn normalize_endpoint(value: &str) -> String {
    value
        .strip_prefix("/v1/")
        .or_else(|| value.strip_prefix('/'))
        .unwrap_or(value)
        .to_string()
}
fn endpoint_matches(route: &Value, endpoint: &str) -> bool {
    route["endpoint"].as_str() == Some(endpoint)
        || route["capability_id"].as_str() == Some(endpoint)
        || normalize_endpoint(route["public_path"].as_str().unwrap_or("")) == endpoint
}
fn parameter_value_issues(name: &str, value: &Value, detail: &Value) -> Vec<String> {
    let mut issues = Vec::new();
    let allowed = detail
        .get("values")
        .or_else(|| detail.get("enum"))
        .and_then(Value::as_array);
    if allowed.is_some_and(|items| !items.contains(value)) {
        issues.push(format!(
            "{name} must be one of: {}",
            allowed
                .unwrap()
                .iter()
                .map(Value::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    if let Some(number) = value.as_f64() {
        if !number.is_finite() {
            issues.push(format!("{name} must be finite"));
        }
        if let Some(min) = detail["minimum"].as_f64() {
            if number < min {
                issues.push(format!("{name} must be at least {min}"));
            }
        }
        if let Some(max) = detail["maximum"].as_f64() {
            if number > max {
                issues.push(format!("{name} must be at most {max}"));
            }
        }
        if let Some(step) = detail["step"].as_f64() {
            if step > 0.0 {
                let start = detail["minimum"].as_f64().unwrap_or(0.0);
                let steps = (number - start) / step;
                if (steps - steps.round()).abs() > 1e-8 {
                    issues.push(format!("{name} must use steps of {step}"));
                }
            }
        }
    }
    issues
}
fn unique(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn highlights_invalid_value() {
        let model = json!({"id":"openai/example","endpoints":[{"id":"openai:responses","endpoint":"responses","routable":true,"status":"active","provider":{"id":"openai"},"capabilities":{"parameters":["temperature"],"parameter_details":{"temperature":{"supported":true,"minimum":0,"maximum":1}}}}]});
        let values = HashMap::from([("temperature".to_string(), json!(1.5))]);
        let report = check_parameter_support(&model, &values, &ParameterSupportOptions::default());
        assert_eq!(report["ok"], false);
        assert_eq!(report["parameters"][0]["status"], "supported");
        assert_eq!(report["parameters"][0]["accepted_by"], json!([]));
    }
}
