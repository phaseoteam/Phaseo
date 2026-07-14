package app.phaseo.sdk;

public final class PhaseoDevtools {
	private PhaseoDevtools() {
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
