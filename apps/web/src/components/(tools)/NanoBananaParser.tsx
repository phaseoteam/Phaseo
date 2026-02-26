"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { XCircle } from "lucide-react";

type JsonObject = Record<string, unknown>;

type ParsedCandidate = {
	index: number;
	finishReason: string | null;
	role: string | null;
	textParts: string[];
	inlineDataParts: Array<{
		mimeType: string | null;
		estimatedBytes: number;
		base64Preview: string;
	}>;
	functionCalls: Array<{
		name: string | null;
		args: unknown;
	}>;
	otherPartTypes: string[];
};

type ParsedSummary = {
	candidateCount: number;
	modelVersion: string | null;
	usageMetadata: JsonObject | null;
	candidates: ParsedCandidate[];
};

type ParseResult = {
	value: unknown;
	normalizedInput: string;
	warnings: string[];
};

const EXAMPLE_INPUT = `"candidates": [
  {
    "content": {
      "role": "model",
      "parts": [
        { "text": "A tiny banana balancing on a laptop keyboard." },
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "iVBORw0KGgoAAAANSUhEUgAAA..."
          }
        }
      ]
    },
    "finishReason": "STOP"
  }
],
"modelVersion": "gemini-2.5-flash-image-preview",
"usageMetadata": {
  "promptTokenCount": 123,
  "candidatesTokenCount": 87,
  "totalTokenCount": 210
}`;

function asObject(value: unknown): JsonObject | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as JsonObject;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stripTrailingCommas(input: string): string {
	return input.replace(/,\s*([}\]])/g, "$1");
}

function extractBalancedJsonBlock(input: string): string | null {
	let start = -1;
	const stack: string[] = [];
	let inString = false;
	let quoteChar = "";
	let escaping = false;

	for (let i = 0; i < input.length; i += 1) {
		const ch = input[i];

		if (inString) {
			if (escaping) {
				escaping = false;
				continue;
			}
			if (ch === "\\") {
				escaping = true;
				continue;
			}
			if (ch === quoteChar) {
				inString = false;
				quoteChar = "";
			}
			continue;
		}

		if (ch === `"` || ch === `'`) {
			inString = true;
			quoteChar = ch;
			continue;
		}

		if (ch === "{" || ch === "[") {
			if (start === -1) start = i;
			stack.push(ch);
			continue;
		}

		if (ch === "}" || ch === "]") {
			if (stack.length === 0) continue;
			const open = stack[stack.length - 1];
			const closesOpen =
				(open === "{" && ch === "}") || (open === "[" && ch === "]");
			if (!closesOpen) {
				stack.length = 0;
				start = -1;
				continue;
			}
			stack.pop();
			if (stack.length === 0 && start !== -1) {
				return input.slice(start, i + 1);
			}
		}
	}

	return null;
}

function parseRawInput(raw: string): ParseResult {
	const warnings: string[] = [];
	const cleaned = raw.trim();
	if (!cleaned) {
		throw new Error("Paste a raw response before parsing.");
	}

	let normalized = cleaned;
	const fencedBlocks = [
		...cleaned.matchAll(/```(?:json|javascript|js)?\s*([\s\S]*?)```/gi),
	];
	if (fencedBlocks.length > 0) {
		const preferred =
			fencedBlocks.find((match) => match[1].includes(`"candidates"`)) ??
			fencedBlocks[0];
		normalized = preferred[1].trim();
		warnings.push("Extracted JSON from a markdown code fence.");
	}

	const attempts: string[] = [normalized];
	const startsWithBrace =
		normalized.startsWith("{") || normalized.startsWith("[");
	const looksLikeCandidatesSnippet =
		normalized.startsWith(`"candidates"`) ||
		normalized.includes(`"candidates":`);
	if (!startsWithBrace && looksLikeCandidatesSnippet) {
		attempts.push(`{${normalized}}`);
	}

	const embeddedJson = extractBalancedJsonBlock(normalized);
	if (embeddedJson && embeddedJson !== normalized) {
		attempts.push(embeddedJson);
		warnings.push("Extracted the first JSON block from surrounding text.");
	}

	const expandedAttempts = attempts.flatMap((attempt) => {
		const fixed = stripTrailingCommas(attempt);
		return fixed === attempt ? [attempt] : [attempt, fixed];
	});

	const uniqueAttempts = Array.from(new Set(expandedAttempts));
	let lastError = "Unknown parse error";

	for (const attempt of uniqueAttempts) {
		try {
			return {
				value: JSON.parse(attempt),
				normalizedInput: attempt,
				warnings,
			};
		} catch (error) {
			lastError = (error as Error).message;
		}
	}

	throw new Error(`Unable to parse response JSON: ${lastError}`);
}

function findResponseRoot(value: unknown): JsonObject {
	const root = asObject(value);
	if (!root) {
		throw new Error("Parsed value is not an object.");
	}
	if (Array.isArray(root.candidates)) return root;

	const nestedKeys = ["response", "data", "result", "raw"];
	for (const key of nestedKeys) {
		const candidateRoot = asObject(root[key]);
		if (candidateRoot && Array.isArray(candidateRoot.candidates)) {
			return candidateRoot;
		}
	}

	if (`candidates` in root) return root;
	throw new Error("Could not find a candidates array in the parsed payload.");
}

function estimateBytesFromBase64(data: string): number {
	const trimmed = data.replace(/\s+/g, "");
	const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0;
	return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding);
}

function summarizeResponse(root: JsonObject): ParsedSummary {
	const candidatesRaw = asArray(root.candidates);
	const candidates: ParsedCandidate[] = candidatesRaw.map((candidateRaw, index) => {
		const candidate = asObject(candidateRaw) ?? {};
		const content = asObject(candidate.content) ?? {};
		const parts = asArray(content.parts);

		const textParts: string[] = [];
		const inlineDataParts: ParsedCandidate["inlineDataParts"] = [];
		const functionCalls: ParsedCandidate["functionCalls"] = [];
		const otherPartTypes: string[] = [];

		for (const partRaw of parts) {
			const part = asObject(partRaw);
			if (!part) continue;

			if (typeof part.text === "string") {
				textParts.push(part.text);
			}

			const inlineData = asObject(part.inlineData);
			if (inlineData && typeof inlineData.data === "string") {
				const mimeType =
					typeof inlineData.mimeType === "string" ? inlineData.mimeType : null;
				const data = inlineData.data;
				inlineDataParts.push({
					mimeType,
					estimatedBytes: estimateBytesFromBase64(data),
					base64Preview: data.length > 32 ? `${data.slice(0, 32)}...` : data,
				});
			}

			const functionCall = asObject(part.functionCall);
			if (functionCall) {
				functionCalls.push({
					name: typeof functionCall.name === "string" ? functionCall.name : null,
					args: functionCall.args ?? null,
				});
			}

			const knownKeys = new Set(["text", "inlineData", "functionCall"]);
			Object.keys(part).forEach((key) => {
				if (!knownKeys.has(key) && !otherPartTypes.includes(key)) {
					otherPartTypes.push(key);
				}
			});
		}

		return {
			index,
			finishReason:
				typeof candidate.finishReason === "string" ? candidate.finishReason : null,
			role: typeof content.role === "string" ? content.role : null,
			textParts,
			inlineDataParts,
			functionCalls,
			otherPartTypes,
		};
	});

	return {
		candidateCount: candidates.length,
		modelVersion:
			typeof root.modelVersion === "string" ? root.modelVersion : null,
		usageMetadata: asObject(root.usageMetadata),
		candidates,
	};
}

function sanitizeLargeBase64(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => sanitizeLargeBase64(item));
	const obj = asObject(value);
	if (!obj) return value;

	const out: JsonObject = {};
	Object.entries(obj).forEach(([key, raw]) => {
		if (key === "data" && typeof raw === "string" && raw.length > 80) {
			out[key] = `[base64 omitted: ${raw.length} chars]`;
			return;
		}
		out[key] = sanitizeLargeBase64(raw);
	});
	return out;
}

export default function NanoBananaParser() {
	const [input, setInput] = useState(EXAMPLE_INPUT);
	const [summaryText, setSummaryText] = useState("");
	const [sanitizedJsonText, setSanitizedJsonText] = useState("");
	const [error, setError] = useState("");
	const [warnings, setWarnings] = useState<string[]>([]);
	const [normalizedInput, setNormalizedInput] = useState("");
	const [stats, setStats] = useState({
		candidateCount: 0,
		textPartCount: 0,
		inlineDataCount: 0,
		functionCallCount: 0,
	});

	const extractedText = useMemo(() => {
		if (!summaryText) return "";
		try {
			const parsed = JSON.parse(summaryText) as ParsedSummary;
			const sections = parsed.candidates
				.map((candidate) => candidate.textParts.join("\n").trim())
				.filter(Boolean);
			return sections.length > 0
				? sections.join("\n\n--------------------\n\n")
				: "(No text parts found in candidates.)";
		} catch {
			return "";
		}
	}, [summaryText]);

	const handleParse = () => {
		try {
			const parsed = parseRawInput(input);
			const root = findResponseRoot(parsed.value);
			const summary = summarizeResponse(root);
			const textPartCount = summary.candidates.reduce(
				(acc, candidate) => acc + candidate.textParts.length,
				0
			);
			const inlineDataCount = summary.candidates.reduce(
				(acc, candidate) => acc + candidate.inlineDataParts.length,
				0
			);
			const functionCallCount = summary.candidates.reduce(
				(acc, candidate) => acc + candidate.functionCalls.length,
				0
			);

			setSummaryText(JSON.stringify(summary, null, 2));
			setSanitizedJsonText(
				JSON.stringify(sanitizeLargeBase64(parsed.value), null, 2)
			);
			setNormalizedInput(parsed.normalizedInput);
			setWarnings(parsed.warnings);
			setStats({
				candidateCount: summary.candidateCount,
				textPartCount,
				inlineDataCount,
				functionCallCount,
			});
			setError("");
		} catch (parseError) {
			setError((parseError as Error).message);
			setSummaryText("");
			setSanitizedJsonText("");
			setWarnings([]);
			setNormalizedInput("");
			setStats({
				candidateCount: 0,
				textPartCount: 0,
				inlineDataCount: 0,
				functionCallCount: 0,
			});
		}
	};

	const handleClear = () => {
		setInput("");
		setSummaryText("");
		setSanitizedJsonText("");
		setError("");
		setWarnings([]);
		setNormalizedInput("");
		setStats({
			candidateCount: 0,
			textPartCount: 0,
			inlineDataCount: 0,
			functionCallCount: 0,
		});
	};

	return (
		<div className="container mx-auto py-8 px-4 space-y-8">
			<div>
				<h1 className="text-3xl font-bold mb-2">Nano Banana Parser</h1>
				<p className="text-muted-foreground">
					Paste raw Nano Banana response payloads and parse them into a clean,
					readable structure.
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
				<Card>
					<CardContent className="pt-6">
						<p className="text-xs text-muted-foreground">Candidates</p>
						<p className="text-2xl font-semibold">{stats.candidateCount}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<p className="text-xs text-muted-foreground">Text Parts</p>
						<p className="text-2xl font-semibold">{stats.textPartCount}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<p className="text-xs text-muted-foreground">Inline Data Parts</p>
						<p className="text-2xl font-semibold">{stats.inlineDataCount}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<p className="text-xs text-muted-foreground">Function Calls</p>
						<p className="text-2xl font-semibold">{stats.functionCallCount}</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
				<Card>
					<CardHeader>
						<CardTitle>Raw Input</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<Textarea
							value={input}
							onChange={(event) => setInput(event.target.value)}
							className="min-h-[420px] font-mono text-xs"
							placeholder='Paste raw payload JSON or a snippet like "candidates": [...]'
						/>
						<div className="flex flex-wrap gap-2">
							<Button onClick={handleParse}>Parse</Button>
							<Button variant="outline" onClick={() => setInput(EXAMPLE_INPUT)}>
								Load Example
							</Button>
							<Button variant="outline" onClick={handleClear}>
								Clear
							</Button>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Parsed Summary</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{error && (
							<Alert variant="destructive">
								<XCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						{warnings.length > 0 && (
							<Alert>
								<AlertDescription>
									{warnings.map((warning, index) => (
										<p key={index}>{warning}</p>
									))}
								</AlertDescription>
							</Alert>
						)}
						<Textarea
							value={summaryText}
							readOnly
							className="min-h-[420px] font-mono text-xs"
							placeholder="Parsed summary will appear here."
						/>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
				<Card>
					<CardHeader>
						<CardTitle>Extracted Text</CardTitle>
					</CardHeader>
					<CardContent>
						<Textarea
							value={extractedText}
							readOnly
							className="min-h-[260px] font-mono text-xs"
							placeholder="Candidate text parts will appear here."
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Sanitized Raw JSON</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<Textarea
							value={sanitizedJsonText}
							readOnly
							className="min-h-[260px] font-mono text-xs"
							placeholder="Raw parsed JSON (large base64 fields omitted)."
						/>
					</CardContent>
				</Card>
			</div>

			{normalizedInput && (
				<Card>
					<CardHeader>
						<CardTitle>Normalized Input Used For Parsing</CardTitle>
					</CardHeader>
					<CardContent>
						<Textarea
							value={normalizedInput}
							readOnly
							className="min-h-[180px] font-mono text-xs"
						/>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
