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

	client := aistats.New(apiKey, "https://api.phaseo.app/v1")
	resp, err := client.GetModels(context.Background(), nil)
	if err != nil {
		panic(err)
	}
	fmt.Println("models:", resp["models"])
}
