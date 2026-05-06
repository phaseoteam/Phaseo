//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"os"

	aistats "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go"
)

func main() {
	apiKey := os.Getenv("AI_STATS_API_KEY")
	if apiKey == "" {
		panic("Set AI_STATS_API_KEY")
	}

	client := aistats.NewAIStats(apiKey, "https://api.phaseo.app/v1")
	resp, err := client.GetModels(context.Background(), map[string]string{
		"provider": "anthropic",
		"provider_status": "beta,not_ready",
		"provider_availability_reason": "preview_only,provider_not_ready",
		"capability_status": "coming_soon,internal_testing",
		"availability": "all",
		"limit": "5",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println("models:", resp["models"])
}
