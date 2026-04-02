package ai.stats.sdk;

public final class DevtoolsConfig {
	final boolean enabled;
	final String directory;
	final boolean captureHeaders;
	final boolean saveAssets;

	public DevtoolsConfig() {
		this(true, null, false, true);
	}

	public DevtoolsConfig(boolean enabled, String directory, boolean captureHeaders, boolean saveAssets) {
		this.enabled = enabled;
		this.directory = directory;
		this.captureHeaders = captureHeaders;
		this.saveAssets = saveAssets;
	}
}
