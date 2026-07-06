import app.phaseo.sdk.Phaseo;
import app.phaseo.sdk.PhaseoDevtools;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;

public class SmokeResponsesSdk {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("PHASEO_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("PHASEO_API_KEY is required");
        }

        String baseUrl = System.getenv("PHASEO_BASE_URL");
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "https://api.phaseo.ai/v1";
        }

        String model = System.getenv("PHASEO_SMOKE_MODEL");
        if (model == null || model.isEmpty()) {
            model = "openai/gpt-5.4-nano";
        }

        String input = System.getenv("PHASEO_SMOKE_INPUT");
        if (input == null || input.isEmpty()) {
            input = "Hi";
        }

        int maxOutputTokens = 32;
        String maxOutputTokensRaw = System.getenv("PHASEO_SMOKE_MAX_OUTPUT_TOKENS");
        if (maxOutputTokensRaw != null && !maxOutputTokensRaw.isEmpty()) {
            try {
                maxOutputTokens = Integer.parseInt(maxOutputTokensRaw);
            } catch (NumberFormatException ignored) {
            }
        }

        Phaseo client = new Phaseo(
            apiKey,
            baseUrl,
            false,
            false,
            null,
            PhaseoDevtools.create()
        );

        Map<String, Object> payload = new HashMap<>();
        payload.put("model", model);
        payload.put("input", input);
        payload.put("max_output_tokens", maxOutputTokens);

        JsonNode response = client.createResponse(payload);
        if (response.path("id").asText("").isEmpty()) {
            throw new IllegalStateException("missing response id in response payload");
        }

        System.out.println(new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(response));
    }
}
