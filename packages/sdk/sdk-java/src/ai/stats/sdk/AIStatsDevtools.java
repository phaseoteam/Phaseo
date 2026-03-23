package ai.stats.sdk;

public final class AIStatsDevtools {
	private AIStatsDevtools() {
	}

	public static DevtoolsConfig create() {
		return new DevtoolsConfig();
	}

	public static DevtoolsConfig create(
		boolean enabled,
		String directory,
		boolean captureHeaders,
		boolean saveAssets
	) {
		return new DevtoolsConfig(enabled, directory, captureHeaders, saveAssets);
	}
}
