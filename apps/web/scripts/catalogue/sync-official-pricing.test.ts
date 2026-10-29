import { anthropicMarkdownCandidates, extractHtmlTableRows, extractOfficialPricing } from "./sync-official-pricing";

describe("official pricing extraction", () => {
	test("preserves table row and cell boundaries", () => {
		expect(extractHtmlTableRows(`
			<table>
				<tr><th>Model</th><th>Input</th></tr>
				<tr><td>example</td><td>$1 / MTok</td></tr>
			</table>
		`)).toEqual([[ ["Model", "Input"], ["example", "$1 / MTok"] ]]);
	});

	test("extracts horizontal official token pricing", () => {
		expect(extractOfficialPricing("anthropic", `
			<table>
				<tr><th>Model</th><th>Base Input Tokens</th><th>5m Cache Writes</th><th>Cache Hits</th><th>Output Tokens</th></tr>
				<tr><td>Claude Example 1</td><td>$2 / MTok</td><td>$2.50 / MTok</td><td>$0.20 / MTok</td><td>$10 / MTok</td></tr>
			</table>
		`)).toEqual([{
			providerModel: "Claude Example 1",
			meters: {
				input_text_tokens: 2,
				cached_write_text_tokens_5m: 2.5,
				cached_read_text_tokens: 0.2,
				output_text_tokens: 10,
			},
		}]);
	});

	test("extracts transposed DeepSeek pricing", () => {
		expect(extractOfficialPricing("deepseek", `
			<table>
				<tr><th>MODEL</th><th>deepseek-a</th><th>deepseek-b</th></tr>
				<tr><td>1M INPUT TOKENS (CACHE HIT)</td><td>$0.01</td><td>$0.02</td></tr>
				<tr><td>1M INPUT TOKENS (CACHE MISS)</td><td>$0.10</td><td>$0.20</td></tr>
				<tr><td>1M OUTPUT TOKENS</td><td>$0.30</td><td>$0.40</td></tr>
			</table>
		`)).toEqual([
			{ providerModel: "deepseek-a", meters: { input_text_tokens: 0.1, cached_read_text_tokens: 0.01, output_text_tokens: 0.3 } },
			{ providerModel: "deepseek-b", meters: { input_text_tokens: 0.2, cached_read_text_tokens: 0.02, output_text_tokens: 0.4 } },
		]);
	});

	test("extracts Moonshot MDX pricing", () => {
		expect(extractOfficialPricing("moonshotai", `
			<DocTable
				rows={[
					["kimi-example", "1M tokens", <> {"$"}0.16</>, <> {"$"}0.95</>, <> {"$"}4.00</>],
				]}
			/>
		`)).toEqual([{
			providerModel: "kimi-example",
			meters: {
				cached_read_text_tokens: 0.16,
				input_text_tokens: 0.95,
				output_text_tokens: 4,
			},
		}]);
	});

	test("extracts Fireworks standard token pricing", () => {
		expect(extractOfficialPricing("fireworks", `
			<table>
				<tr><th>Model</th><th>Standard</th><th>Priority</th></tr>
				<tr><td>accounts/fireworks/models/example</td><td>$0.20 / $0.02 / $0.80</td><td>$1.00</td></tr>
			</table>
		`)).toEqual([{
			providerModel: "accounts/fireworks/models/example",
			meters: {
				input_text_tokens: 0.2,
				cached_read_text_tokens: 0.02,
				output_text_tokens: 0.8,
			},
		}]);
	});

	test("extracts Voyage embedding and reranking pricing with capabilities", () => {
		expect(extractOfficialPricing("voyage", `
			<table>
				<tr><th>Model</th><th>Price per million tokens</th></tr>
				<tr><td>voyage-4 voyage-4-lite</td><td>$0.12</td></tr>
				<tr><td>rerank-2.5</td><td>$0.05</td></tr>
			</table>
		`)).toEqual([
			{ providerModel: "voyage-4", capabilityId: "text.embed", meters: { input_text_tokens: 0.12 } },
			{ providerModel: "voyage-4-lite", capabilityId: "text.embed", meters: { input_text_tokens: 0.12 } },
			{ providerModel: "rerank-2.5", capabilityId: "text.rerank", meters: { input_text_tokens: 0.05 } },
		]);
	});

	test("extracts Z.AI horizontal token pricing", () => {
		expect(extractOfficialPricing("z-ai", `
			<table>
				<tr><th>Model</th><th>Input</th><th>Cached Input</th><th>Cached Input Storage</th><th>Output</th></tr>
				<tr><td>glm-example</td><td>$0.40 / M tokens</td><td>$0.04 / M tokens</td><td>Limited-time Free</td><td>$1.20 / M tokens</td></tr>
			</table>
		`)).toEqual([{
			providerModel: "glm-example",
			meters: {
				input_text_tokens: 0.4,
				cached_read_text_tokens: 0.04,
				output_text_tokens: 1.2,
			},
		}]);
	});

	test("extracts Anthropic's official Markdown pricing table with effective dates", () => {
		expect(anthropicMarkdownCandidates(`
## Model pricing

| Model | Base Input Tokens | 5m Cache Writes | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- | --- |
| Claude Example 1 | $2 / MTok | $2.50 / MTok | $0.20 / MTok | $10 / MTok |
| Claude Future starting December 31, 2099 | $3 / MTok | $3 / MTok | $0.30 / MTok | $12 / MTok |
`, new Date("2026-08-11T00:00:00Z"))).toEqual([{
			providerModel: "Claude Example 1",
			meters: {
				input_text_tokens: 2,
				cached_write_text_tokens_5m: 2.5,
				cached_read_text_tokens: 0.2,
				output_text_tokens: 10,
			},
		}]);
	});

	test("extracts Cloudflare Workers AI token and audio pricing", () => {
		expect(extractOfficialPricing("cloudflare", `
			<table>
				<tr><th>Model</th><th>Price in Tokens</th><th>Price in Neurons</th></tr>
				<tr><td>@cf/example/text</td><td>$0.10 per M input tokens $0.20 per M cached input tokens $0.30 per M output tokens</td><td></td></tr>
			</table>
			<table>
				<tr><th>Model</th><th>Price in Tokens</th><th>Price in Neurons</th></tr>
				<tr><td>@cf/example/whisper</td><td>$0.0005 per audio minute</td><td></td></tr>
			</table>
		`)).toEqual([
			{
				providerModel: "example/text",
				capabilityId: "text.generate",
				meters: { input_text_tokens: 0.1, cached_read_text_tokens: 0.2, output_text_tokens: 0.3 },
			},
			{
				providerModel: "example/whisper",
				capabilityId: "audio.transcribe",
				meters: { input_audio_minutes: 0.0005 },
				ruleOptions: { input_audio_minutes: { unit: "minute", unitSize: 1 } },
			},
		]);
	});

	test("extracts W&B hosted model pricing", () => {
		expect(extractOfficialPricing("weights-and-biases", `
			<table data-compare="header-table">
				<tr><th>Model</th><th>Input Tokens</th><th>Output Tokens</th><th>Cache Hit</th></tr>
			</table>
			<table data-compare="body-table">
				<tr><td>Z.AI GLM 5.2</td><td>$0.76</td><td>$2.42</td><td>$0.14</td></tr>
			</table>
		`)).toEqual([{
			providerModel: "GLM 5.2",
			meters: {
				input_text_tokens: 0.76,
				output_text_tokens: 2.42,
				cached_read_text_tokens: 0.14,
			},
		}]);
	});

	test("extracts Xiaomi pricing cards", () => {
		expect(extractOfficialPricing("xiaomi", `
			<section><h4>MiMo-V2.5-Pro</h4><p>Flagship model.</p>
			<div>Input (cache hit)$0.0036 / MTok</div>
			<div>Input (cache miss)$0.435 / MTok</div>
			<div>Output$0.87 / MTok</div></section>
		`)).toEqual([{
			providerModel: "MiMo-V2.5-Pro",
			meters: {
				cached_read_text_tokens: 0.0036,
				input_text_tokens: 0.435,
				output_text_tokens: 0.87,
			},
		}]);
	});

	test("removes script elements whose closing tags contain whitespace", () => {
		expect(extractOfficialPricing("xiaomi", `
			<script >MiMo-Fake Input (cache hit)$1 / MTok Input (cache miss)$2 / MTok Output$3 / MTok</script >
			<section><h4>MiMo-Real</h4>
			<div>Input (cache hit)$0.01 / MTok</div>
			<div>Input (cache miss)$0.10 / MTok</div>
			<div>Output$0.30 / MTok</div></section>
		`)).toEqual([{
			providerModel: "MiMo-Real",
			meters: {
				cached_read_text_tokens: 0.01,
				input_text_tokens: 0.1,
				output_text_tokens: 0.3,
			},
		}]);
	});

	test("extracts StepFun CNY token pricing without currency conversion", () => {
		expect(extractOfficialPricing("stepfun", `
			<table>
				<tr><th>模型</th><th>计费单位</th><th>输入价格(缓存未命中)</th><th>输入价格(缓存命中)</th><th>输出价格</th></tr>
				<tr><td>step-3.5-flash</td><td>1M tokens</td><td>0.7元</td><td>0.14元</td><td>2.1元</td></tr>
			</table>
		`)).toEqual([{
			providerModel: "step-3.5-flash",
			currency: "CNY",
			meters: {
				input_text_tokens: 0.7,
				cached_read_text_tokens: 0.14,
				output_text_tokens: 2.1,
			},
		}]);
	});

	test("skips conditional short and long context tables", () => {
		expect(extractOfficialPricing("openai", `
			<table>
				<tr><th>Short context</th><th>Model</th><th>Input</th><th>Output</th><th>Long context Input</th><th>Output</th></tr>
				<tr><td></td><td>gpt-example</td><td>$1</td><td>$2</td><td>$3</td><td>$4</td></tr>
			</table>
		`)).toEqual([]);
	});
});
