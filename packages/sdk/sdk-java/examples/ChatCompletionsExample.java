import app.phaseo.sdk.Phaseo;
import java.util.Map;

public class ChatCompletionsExample {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("PHASEO_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("PHASEO_API_KEY is required");
        }
        Phaseo client = new Phaseo(apiKey);
        Object response = client.createChatCompletion(Map.of(
            "model", "openai/gpt-5-nano",
            "messages", java.util.List.of(Map.of("role", "user", "content", "Say hi."))
        ));
        System.out.println(String.valueOf(response));
    }
}
