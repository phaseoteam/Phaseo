import ai.stats.sdk.AIStats;
import java.util.Map;

public class ChatCompletionsExample {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("AI_STATS_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("AI_STATS_API_KEY is required");
        }
        AIStats client = new AIStats(apiKey);
        Object response = client.createChatCompletion(Map.of(
            "model", "openai/gpt-5-nano",
            "messages", java.util.List.of(Map.of("role", "user", "content", "Say hi."))
        ));
        System.out.println(String.valueOf(response));
    }
}
