import ai.stats.gen.Client;
import ai.stats.gen.Operations;

import java.net.http.HttpClient;
import java.util.HashMap;
import java.util.Map;

public class ChatCompletionsExample {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("AI_STATS_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("AI_STATS_API_KEY is required");
        }
        String baseUrl = System.getenv("AI_STATS_BASE_URL");
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "https://api.phaseo.app/v1";
        }

        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + apiKey);

        Client client = new Client(baseUrl, HttpClient.newHttpClient(), headers);
        String payload =
            "{\"model\":\"openai/gpt-5-nano\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hi.\"}]}";
        Object response = Operations.createChatCompletion(client, null, null, null, payload);
        System.out.println(String.valueOf(response));
    }
}
