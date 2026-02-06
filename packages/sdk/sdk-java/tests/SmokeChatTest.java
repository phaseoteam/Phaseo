import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;

public class SmokeChatTest {
    @Test
    public void smokeChatRuns() throws Exception {
        String apiKey = System.getenv("AI_STATS_API_KEY");
        Assumptions.assumeTrue(apiKey != null && !apiKey.isBlank(), "AI_STATS_API_KEY is required");
        SmokeChat.main(new String[0]);
    }
}
