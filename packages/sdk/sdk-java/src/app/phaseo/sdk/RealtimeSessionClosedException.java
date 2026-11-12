package app.phaseo.sdk;

/**
 * The relay socket closed, or {@code end()} timed out, without {@code session.ended}.
 * The call is still billed; {@link #finalBillPath()} returns the cost once it is settled.
 */
public final class RealtimeSessionClosedException extends RuntimeException {
	private final String sessionId;
	private final int closeCode;
	private final String closeReason;
	private final String finalBillPath;

	RealtimeSessionClosedException(String sessionId, int closeCode, String closeReason, String detail) {
		super("Realtime session " + sessionId + " "
			+ (detail != null ? detail : "closed (code " + (closeCode < 0 ? "none" : closeCode) + (closeReason.isEmpty() ? "" : ", " + closeReason) + ")")
			+ " without session.ended. The call is still billed; fetch the final bill with GET " + Realtime.finalBillPath(sessionId));
		this.sessionId = sessionId;
		this.closeCode = closeCode;
		this.closeReason = closeReason;
		this.finalBillPath = Realtime.finalBillPath(sessionId);
	}

	public String sessionId() {
		return sessionId;
	}

	/** The WebSocket close code, or -1 when there was none. */
	public int closeCode() {
		return closeCode;
	}

	public String closeReason() {
		return closeReason;
	}

	/** {@code /v1/generations?id=realtime%3A<session_id>}; send it as a GET. */
	public String finalBillPath() {
		return finalBillPath;
	}
}
