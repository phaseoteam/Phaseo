import ai.stats.sdk.AIStats;
import java.util.Map;

public class ModerationsExample {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("AI_STATS_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("AI_STATS_API_KEY is required");
        }
        AIStats client = new AIStats(apiKey);
        Object response = client.createModeration(Map.of(
            "model", "openai/omni-moderation",
            "input", "Please rate this message for safety."
        ));
        System.out.println(String.valueOf(response));
    }
}
