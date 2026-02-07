package main

import (
	"context"
	"fmt"
	"os"

	sdk "packages/sdk/sdk-go"
)

func main() {
	apiKey := os.Getenv("AI_STATS_API_KEY")
	if apiKey == "" {
		panic("Set AI_STATS_API_KEY")
	}

	client := sdk.New(apiKey, "https://api.phaseo.app/v1")
	resp, _, err := client.GetModels(context.Background(), nil)
	if err != nil {
		panic(err)
	}
	fmt.Println("models:", resp.Models)
}
