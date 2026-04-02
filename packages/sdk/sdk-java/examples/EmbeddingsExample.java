import ai.stats.sdk.AIStats;
import java.util.Map;

public class EmbeddingsExample {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("AI_STATS_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("AI_STATS_API_KEY is required");
        }
        AIStats client = new AIStats(apiKey);
        Object response = client.createEmbedding(Map.of(
            "model", "google/gemini-embedding-001",
            "input", "Vector search uses embeddings to compare meaning."
        ));
        System.out.println(String.valueOf(response));
    }
}
