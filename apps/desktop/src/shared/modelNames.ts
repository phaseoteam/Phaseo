/**
 * One spelling for a model's name, whichever list it came from: Codex says "GPT-6.1-Sol", the Phaseo catalogue
 * "GPT-6.1 Sol" or "GPT 5.6 Luna". Every list reads "GPT 6.1 Sol"; names such as GPT-4o-mini keep their hyphen.
 */
export const spellModelName = (name: string) => name.replace(/(\d)-(?=[A-Z][a-z])/g, "$1 ").replace(/\bGPT-(?=\d+(?:\.\d+)?(?:\s|$))/g, "GPT ");
