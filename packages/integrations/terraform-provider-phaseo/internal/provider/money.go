package provider

import (
	"math"
	"strings"

	"github.com/hashicorp/terraform-plugin-framework/types"
)

const nanosPerUSD = 1_000_000_000

// usdToNanos rounds a USD amount to whole nanodollars, as the Phaseo API does.
func usdToNanos(usd float64) int64 {
	return int64(math.Round(usd * nanosPerUSD))
}

// usdFromNanos returns the USD value of an amount the API stores in nanodollars. When the
// configured value already rounds to the same nanodollars it is kept, so a value such as 0.1
// never shows a diff because of floating-point formatting.
func usdFromNanos(prior types.Float64, nanos *int64) types.Float64 {
	if nanos == nil {
		return types.Float64Null()
	}
	if !prior.IsNull() && !prior.IsUnknown() && usdToNanos(prior.ValueFloat64()) == *nanos {
		return prior
	}
	return types.Float64Value(float64(*nanos) / nanosPerUSD)
}

// stringKeepingCase keeps the configured spelling when the API returns the same value in
// another case (the API lowercases key, member and department ids).
func stringKeepingCase(prior types.String, value *string) types.String {
	if value == nil {
		return types.StringNull()
	}
	if !prior.IsNull() && !prior.IsUnknown() && strings.EqualFold(prior.ValueString(), *value) {
		return prior
	}
	return types.StringValue(*value)
}

func nullableFloat64(value *float64) types.Float64 {
	if value == nil {
		return types.Float64Null()
	}
	return types.Float64Value(*value)
}

// optionalValue is the JSON value of an optional attribute: nil (JSON null, which clears the
// field) when it is null or unknown.
func optionalString(value types.String) any {
	if value.IsNull() || value.IsUnknown() {
		return nil
	}
	return value.ValueString()
}

func optionalFloat64(value types.Float64) any {
	if value.IsNull() || value.IsUnknown() {
		return nil
	}
	return value.ValueFloat64()
}
