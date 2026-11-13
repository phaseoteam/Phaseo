import { createMathPlugin } from "@streamdown/math";

export { normalizeChatMarkdown } from "@phaseo/app-kit/markdown-math";

export const chatMarkdownPlugins = {
	math: createMathPlugin({ singleDollarTextMath: true }),
};
