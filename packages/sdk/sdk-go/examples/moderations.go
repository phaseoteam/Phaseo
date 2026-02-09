//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"os"

	aistats "github.com/AI-Stats/ai-stats-go-sdk-wrapper"
)

func main() {
	apiKey := os.Getenv("AI_STATS_API_KEY")
	if apiKey == "" {
		panic("Set AI_STATS_API_KEY")
	}
	baseURL := os.Getenv("AI_STATS_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.phaseo.app/v1"
	}

	client := aistats.New(apiKey, baseURL)
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
