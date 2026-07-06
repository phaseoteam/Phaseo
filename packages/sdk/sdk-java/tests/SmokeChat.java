import app.phaseo.gen.Client;
import app.phaseo.gen.Operations;

import java.net.http.HttpClient;
import java.util.HashMap;
import java.util.Map;

public class SmokeChat {
    private static String envOrDefault(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static String jsonEscape(String value) {
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
    }

    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("PHASEO_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("PHASEO_API_KEY is required");
        }
        String baseUrl = System.getenv("PHASEO_BASE_URL");
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "https://api.phaseo.ai/v1";
        }

        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + apiKey);

        Client client = new Client(baseUrl, HttpClient.newHttpClient(), headers);
        String model = envOrDefault("PHASEO_SMOKE_MODEL", "openai/gpt-5.4-nano");
        String input = envOrDefault("PHASEO_SMOKE_INPUT", "Hi");
        String payload = "{\"model\":\"" + jsonEscape(model)
            + "\",\"messages\":[{\"role\":\"user\",\"content\":\"" + jsonEscape(input) + "\"}]}";
        Object response = Operations.createChatCompletion(client, null, null, null, payload);
        System.out.println(String.valueOf(response));
    }
}
