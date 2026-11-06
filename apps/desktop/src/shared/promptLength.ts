/** The longest message a send command takes (validateCommand). */
export const messageCharacterLimit = 100_000;

/** A rough token count: about four characters a token for English and code. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * Why a draft may not go through as it is: past the app's own limit it cannot be sent at all; near or past the model's
 * context window it can, but the model may cut it off or refuse it.
 */
export function promptLengthProblem(text: string, contextTokens?: number, modelName = "the model"): { blocking: boolean; message: string } | undefined {
	if (text.length > messageCharacterLimit) return { blocking: true, message: `This message is ${text.length.toLocaleString("en-US")} characters; a message can be up to ${messageCharacterLimit.toLocaleString("en-US")}. Attach long text as a file instead.` };
	const tokens = estimateTokens(text);
	if (contextTokens && tokens > contextTokens * 0.8) return { blocking: false, message: `This message is about ${tokens.toLocaleString("en-US")} tokens, ${tokens > contextTokens ? "more than" : "close to"} ${modelName}'s ${contextTokens.toLocaleString("en-US")}-token context window, so it may be cut off or refused.` };
	return undefined;
}
