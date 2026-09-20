import app.phaseo.sdk.Workflows;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class PhaseoWorkflowsTest {
    @Test void paginationAndJobHandlesAdvanceSafely() throws Exception {
        List<Integer> offsets = new ArrayList<>();
        var pages = new Workflows.PageIterator<Integer>(2, 0, (limit, offset) -> {
            offsets.add(offset);
            return offset == 0 ? new Workflows.Page<>(List.of(1, 2), true) : new Workflows.Page<>(List.of(3), false);
        });
        List<Integer> values = new ArrayList<>();
        pages.forEachRemaining(page -> values.addAll(page.data()));
        assertEquals(List.of(1, 2, 3), values);
        assertEquals(List.of(0, 2), offsets);

        var statuses = new ArrayDeque<>(List.of("running", "completed"));
        var job = new Workflows.JobHandle<>("video", "video_1", ignored -> statuses.remove(), value -> value);
        assertEquals("completed", job.waitForCompletion(Duration.ofMillis(1)));
    }
}
