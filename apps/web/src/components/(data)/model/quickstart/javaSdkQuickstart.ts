export function buildJavaSdkQuickstart({
	path,
	payloadJson,
	streaming,
	modelId,
}: {
	path: string;
	payloadJson: string;
	streaming: boolean;
	modelId?: string;
}): string {
	const request = modelId !== undefined
		? `var response = client.listModels(Map.of("model_id", ${JSON.stringify(modelId)}, "availability", "all"));
        System.out.println(response);`
		: streaming
			? `try (var lines = client.rawClient().requestLines(
            "POST", ${JSON.stringify(path)}, null, null, ${JSON.stringify(payloadJson)}
        )) {
            lines.forEach(System.out::println);
        }`
			: `var payload = new ObjectMapper().readTree(${JSON.stringify(payloadJson)});
        var response = client.request("POST", ${JSON.stringify(path)}, null, null, payload);
        System.out.println(response);`;
	return `// Build from source: https://phaseo.app/docs/v1/sdk-reference/java/installation
import app.phaseo.sdk.Phaseo;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

public class Main {
    public static void main(String[] args) throws Exception {
        var client = new Phaseo(System.getenv("PHASEO_API_KEY"));
        ${request}
    }
}
`;
}
