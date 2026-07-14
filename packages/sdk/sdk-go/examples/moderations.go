//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"os"

	phaseo "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go"
)

func main() {
	apiKey := os.Getenv("PHASEO_API_KEY")
	if apiKey == "" {
		panic("Set PHASEO_API_KEY")
	}
	baseURL := os.Getenv("PHASEO_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.phaseo.app/v1"
	}

	client := phaseo.NewPhaseo(apiKey, baseURL)
	body := map[string]any{
		"model": "openai/omni-moderation",
		"input": "Please rate this message for safety.",
	}

	resp, err := client.GenerateModeration(context.Background(), body)
	if err != nil {
		panic(err)
	}
	fmt.Println(resp)
}
