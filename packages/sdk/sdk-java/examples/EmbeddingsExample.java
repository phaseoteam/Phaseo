import app.phaseo.sdk.Phaseo;
import java.util.Map;

public class EmbeddingsExample {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("PHASEO_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("PHASEO_API_KEY is required");
        }
        Phaseo client = new Phaseo(apiKey);
        Object response = client.createEmbedding(Map.of(
            "model", "google/gemini-embedding-001",
            "input", "Vector search uses embeddings to compare meaning."
        ));
        System.out.println(String.valueOf(response));
    }
}
