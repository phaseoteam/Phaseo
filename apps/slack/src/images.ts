import type { AgentTool } from "@phaseo/agent-sdk";
import { classifyTurnError, type GeneratedImage, type ImageSize } from "./agent";
import type { UploadResult } from "./slack-files";
import { ToolInputError } from "./usage-tools";

// generate_image: the agent makes an image through the gateway, with the
// installation's key (so the Slack agent guardrail and the key's limits apply,
// and it is billed as a normal request), and posts it in the thread. It is
// offered only when the installation has files:write.
//
// The model is DEFAULT_IMAGE_MODEL: OpenAI's GPT Image 2, served by a provider
// that doesn't train on prompts, so the guardrail allows it. Its cost counts
// against the answer's $0.50 limit with the model's tokens and shows in the
// footer's total; an image is only started while IMAGE_COST_RESERVE_USD of the
// limit is left, and one answer makes at most MAX_IMAGES_PER_ANSWER.

export const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2";
/** What an answer must have left of its limit to start an image (a medium 1024 px image costs a few cents). */
export const IMAGE_COST_RESERVE_USD = 0.15;
export const MAX_IMAGES_PER_ANSWER = 2;
const MAX_PROMPT_CHARS = 4_000;
const SIZES: Record<string, ImageSize> = { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" };
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export const GENERATE_IMAGE_TOOL_ID = "generate_image";

function shorten(text: string, limit: number): string {
	return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** Why an image couldn't be made, for the model to pass on. */
function imageErrorText(error: unknown): string {
	switch (classifyTurnError(error, DEFAULT_IMAGE_MODEL)) {
		case "no_credits":
			return "This Phaseo workspace is out of credits, so no image could be made.";
		case "cap_reached":
			return "The Phaseo agent's monthly spending limit on its key has been reached, so no image could be made.";
		case "model_not_allowed":
		case "model_unavailable":
			return "The image model isn't available to the Slack agent right now.";
		default:
			return "The image couldn't be made just now. The provider may have refused the prompt; you can try a different one.";
	}
}

/**
 * The generate_image tool. `generate` calls the gateway; `remainingUsd` is what
 * is left of the answer's limit; `onCost` adds an image's cost to the answer;
 * `post` uploads it to the thread.
 */
export function generateImageTool(options: {
	generate: (prompt: string, size: ImageSize) => Promise<GeneratedImage>;
	remainingUsd: () => number;
	onCost: (costUsd: number) => Promise<void> | void;
	post: (file: { filename: string; title: string; altText: string; bytes: Uint8Array }) => Promise<UploadResult>;
	notes: string[];
}): AgentTool<any, any> {
	let made = 0;
	return {
		id: GENERATE_IMAGE_TOOL_ID,
		description: `Make an image from a text description and post it in this Slack thread. Use it when someone asks for a picture, illustration, icon or similar; for charts of numbers, use make_chart instead. Describe the image fully in the prompt (subject, style, colours, any text it should show). One answer can make up to ${MAX_IMAGES_PER_ANSWER} images, and each costs a few cents of the answer's limit. The image appears in the thread on its own; in your reply, say briefly what you made.`,
		parameters: {
			type: "object",
			properties: {
				prompt: { type: "string", description: `What the image should show, at most ${MAX_PROMPT_CHARS} characters.` },
				size: { type: "string", enum: Object.keys(SIZES), description: "square (default), landscape or portrait." },
			},
			required: ["prompt"],
			additionalProperties: false,
		},
		onError: "return-to-model",
		execute: async (input: { prompt?: unknown; size?: unknown }) => {
			const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
			if (!prompt) throw new ToolInputError("prompt is required");
			if (prompt.length > MAX_PROMPT_CHARS) throw new ToolInputError(`prompt must be at most ${MAX_PROMPT_CHARS} characters`);
			const size = input?.size === undefined || input.size === null ? SIZES.square : SIZES[String(input.size)];
			if (!size) throw new ToolInputError(`size must be one of ${Object.keys(SIZES).join(", ")}`);
			if (made >= MAX_IMAGES_PER_ANSWER) {
				return { posted: false, error: `You've made ${MAX_IMAGES_PER_ANSWER} images in this answer, the most one answer may make. They can ask for more in a new message.` };
			}
			if (options.remainingUsd() < IMAGE_COST_RESERVE_USD) {
				return { posted: false, error: "Not enough of this answer's $0.50 limit is left for an image. Say so: they can ask for it again in a new message." };
			}
			let image: GeneratedImage;
			try {
				image = await options.generate(prompt, size);
			} catch (error) {
				console.warn("[slack-agent] image not generated", { kind: classifyTurnError(error, DEFAULT_IMAGE_MODEL) });
				return { posted: false, error: imageErrorText(error) };
			}
			made += 1;
			await options.onCost(image.costUsd);
			const extension = EXTENSIONS[image.mimeType] ?? "png";
			const posted = await options.post({
				filename: `image.${extension}`,
				title: shorten(prompt, 80),
				altText: `Generated image: ${prompt}`,
				bytes: image.bytes,
			});
			if (posted.ok === false) {
				console.warn("[slack-agent] image not posted", { error: posted.error });
				return { posted: false, error: "The image was made, but Slack didn't take it just now. Say so; they can ask again." };
			}
			options.notes.push(`generate_image: posted an image of "${shorten(prompt, 120)}"`);
			return { posted: true, cost_usd: Math.round(image.costUsd * 10_000) / 10_000 };
		},
	};
}
