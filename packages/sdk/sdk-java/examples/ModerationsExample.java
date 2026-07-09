import app.phaseo.sdk.Phaseo;
import java.util.Map;

public class ModerationsExample {
    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("PHASEO_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalStateException("PHASEO_API_KEY is required");
        }
        Phaseo client = new Phaseo(apiKey);
        Object response = client.createModeration(Map.of(
            "model", "openai/omni-moderation",
            "input", "Please rate this message for safety."
        ));
        System.out.println(String.valueOf(response));
    }
}
