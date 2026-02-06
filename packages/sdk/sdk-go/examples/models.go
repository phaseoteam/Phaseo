package main

import (
	"context"
	"fmt"
	"os"

	sdk "github.com/AI-Stats/ai-stats-go-sdk-wrapper"
)

func main() {
	apiKey := os.Getenv("AI_STATS_API_KEY")
	if apiKey == "" {
		panic("Set AI_STATS_API_KEY")
	}

	client := sdk.New(apiKey, "https://api.phaseo.app/v1")
	resp, err := client.GetModels(context.Background(), nil)
	if err != nil {
		panic(err)
	}
	if list, ok := resp["models"].([]any); ok {
		fmt.Println("models:", list)
	} else {
		fmt.Println("models:", resp)
	}
}
