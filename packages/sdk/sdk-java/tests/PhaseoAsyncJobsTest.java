import app.phaseo.sdk.Phaseo;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class PhaseoAsyncJobsTest {
	@Test
	void asyncJobsResourceBuildsExpectedUrl() {
		Phaseo client = new Phaseo("test", "https://api.phaseo.ai/v1");

		String url = client.asyncJobs.websocketUrl("video", "video 123", 1500, false);

		assertEquals(
			"wss://api.phaseo.ai/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
			url
		);
	}
}
