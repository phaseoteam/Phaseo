use phaseo::models::ErrorResponse;
use serde_json::{json, Value};

fn error_response(error: Value) -> ErrorResponse {
    ErrorResponse {
        attempt_count: None,
        code: None,
        description: None,
        details: None,
        error,
        error_origin: None,
        error_type: None,
        failed_providers: None,
        failed_statuses: None,
        failure_sample: None,
        generation_id: None,
        message: None,
        missing_pricing_providers: None,
        ok: None,
        provider_candidate_diagnostics: None,
        provider_enablement: None,
        provider_failure_diagnostics: None,
        provider_payment_required_provider: None,
        provider_payment_required_support_notice: None,
        reason: None,
        routing_diagnostics: None,
        status_code: None,
        upstream_error: None,
    }
}

#[test]
fn error_field_holds_the_error_object() {
    let raw = r#"{"code":"rate_limit_exceeded","message":"Slow down.","type":"rate_limit_error","param":null,"metadata":{"failed_statuses":[429],"retry_after_seconds":2}}"#;
    let response = error_response(serde_json::from_str(raw).unwrap());
    assert_eq!(response.error["code"], "rate_limit_exceeded");
    assert_eq!(response.error["message"], "Slow down.");
    assert_eq!(response.error["type"], "rate_limit_error");
    assert_eq!(response.error["metadata"]["failed_statuses"], json!([429]));
    let round_trip: Value = serde_json::from_str(&serde_json::to_string(&response.error).unwrap()).unwrap();
    assert_eq!(round_trip, serde_json::from_str::<Value>(raw).unwrap());
}

#[test]
fn error_field_holds_the_older_code_string() {
    let response = error_response(serde_json::from_str(r#""validation_error""#).unwrap());
    assert_eq!(response.error.as_str(), Some("validation_error"));
    assert_eq!(serde_json::to_string(&response.error).unwrap(), r#""validation_error""#);
}
