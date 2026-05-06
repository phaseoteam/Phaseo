import ai.stats.sdk.AIStats;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class AIStatsAsyncJobsTest {
	@Test
	void asyncJobsResourceBuildsExpectedUrl() {
		AIStats client = new AIStats("test", "https://api.phaseo.app/v1");

		String url = client.asyncJobs.websocketUrl("video", "video 123", 1500, false);

		assertEquals(
			"wss://api.phaseo.app/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
			url
		);
	}
}
