// Interactive explainers for default routing. The model mirrors the gateway's
// apps/api/src/pipeline/execute/routing-cost.ts; keep the constants in step with it.
// Every visible string comes from routingCostLabels; translated pages pass `locale`.

export const routingCostModel = (hosts, mix) => {
	const WAIT_VALUE_SHARE = 1;
	const TTFT_EXTRA_WEIGHT = 1;
	const PROVIDER_ERROR_PENALTY = 7;
	const RATE_LIMIT_PENALTY = 1.5;
	const COMPETITIVE_EDGE = 0.3;
	const MIN_SHARE_WEIGHT = 0.01;
	const median = (values) => {
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	};
	const rows = hosts.map((host) => {
		const hit = host.hitRate ?? 0;
		const perToken = (perMillion) => perMillion / 1_000_000;
		const tokens =
			mix.prompt * (1 - hit) * perToken(host.input) +
			mix.prompt * hit * perToken(host.cachedRead ?? host.input) +
			mix.output * perToken(host.output);
		const waitSeconds = mix.output / host.tps + TTFT_EXTRA_WEIGHT * (host.ttftMs / 1000);
		const failureRate = (host.errorRate ?? 0) + (host.limitRate ?? 0);
		return { host, tokens, waitSeconds, success: Math.max(0.05, 1 - failureRate) };
	});
	const valueOfSecond = (WAIT_VALUE_SHARE * median(rows.map((r) => r.tokens))) / median(rows.map((r) => r.waitSeconds));
	for (const row of rows) {
		row.waiting = valueOfSecond * row.waitSeconds;
		row.tryCost = row.tokens + row.waiting;
	}
	const typicalTry = median(rows.map((r) => r.tryCost));
	for (const row of rows) {
		row.cost =
			(row.tryCost / row.success) * (1 + PROVIDER_ERROR_PENALTY * (row.host.errorRate ?? 0)) +
			RATE_LIMIT_PENALTY * (row.host.limitRate ?? 0) * typicalTry;
		row.failures = row.cost - row.tryCost;
	}
	const minCost = Math.min(...rows.map((r) => r.cost));
	for (const row of rows) {
		row.relative = row.cost / minCost;
		row.weight = Math.max(MIN_SHARE_WEIGHT, Math.exp(-(((row.relative - 1) / COMPETITIVE_EDGE) ** 2)));
	}
	const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
	for (const row of rows) row.share = row.weight / totalWeight;
	return { rows, minCost, edge: COMPETITIVE_EDGE, floor: MIN_SHARE_WEIGHT };
};

export const routingCostLabels = {
	tokens: "Tokens",
	waiting: "Waiting",
	failures: "Failures and retries",
	band: "Within 30% of the lowest",
	host: "Provider",
	cost: "Cost per successful answer",
	share: "Share of traffic",
	perThousand: "per 1,000 answers",
	vsBest: "Compared with the lowest",
	cacheHits: "cache hits",
	failed: "failed",
	mix: "Typical request",
	mixTokens: "{prompt} prompt tokens, {output} output tokens",
	successRate: "success rate",
	penalties: "error and rate-limit penalties",
	axisUsers: "Dollars per 1,000 successful answers. Waiting is converted to dollars at the model's typical price per second.",
	axisProviders: "Dollars per 1,000 successful answers for a typical request on this model.",
	scenarios: ["Open model, five providers", "Agent with cached prompts", "One provider failing"],
	hosts: {
		budget: "Budget",
		value: "Value",
		cached: "Cached",
		fast: "Fast",
		premium: "Premium",
		lowestList: "Lowest list price",
		goodCache: "Good cache",
		noCachePrice: "No cache price",
		healthy: "Healthy",
		failing: "Failing",
	},
	you: "Your endpoint",
	youShort: "You",
	provider: "Provider",
	yourShare: "Your share of traffic",
	curve: "Traffic weight by cost compared with the lowest",
	levers: "What each change is worth",
	points: "pts",
	workload: ["Chat: 3K prompt, 500 output", "Agent: 60K prompt, 800 output"],
	controls: {
		input: "Input price ($/M)",
		output: "Output price ($/M)",
		hit: "Prompt served from cache",
		ttft: "Time to first token",
		tps: "Output speed",
		errors: "Errors you cause",
		limits: "Rate-limit rejections",
	},
	leverNames: ["Cut prices 10%", "First token 30% sooner", "Output 30% faster", "Halve errors and rejections"],
};

export const routingCostNote = (host, text) => {
	const parts = [
		`$${host.input.toFixed(2)} / $${host.output.toFixed(2)}`,
		`${(host.ttftMs / 1000).toFixed(1)} s`,
		`${Math.round(host.tps)} tok/s`,
	];
	if (host.hitRate) parts.push(`${Math.round(host.hitRate * 100)}% ${text.cacheHits}`);
	const failureRate = (host.errorRate ?? 0) + (host.limitRate ?? 0);
	if (failureRate >= 0.02) parts.push(`${Math.round(failureRate * 100)}% ${text.failed}`);
	return parts.join(" · ");
};

export const RoutingCostBars = ({ model, text, axis, highlight }) => {
	const [hover, setHover] = useState(null);
	const axisMax = Math.max(...model.rows.map((r) => r.cost));
	const pct = (value) => `${(value / axisMax) * 100}%`;
	const money = (value) => `$${(value * 1000).toFixed(value * 1000 < 1 ? 3 : 2)}`;
	const parts = [
		{ key: "tokens", label: text.tokens },
		{ key: "waiting", label: text.waiting },
		{ key: "failures", label: text.failures },
	];
	return (
		<div className="ph-rc-chart">
			<div className="ph-rc-legend" aria-hidden="true">
				{parts.map((part) => (
					<span key={part.key}>
						<i className={`ph-rc-swatch ph-rc-${part.key}`} />
						{part.label}
					</span>
				))}
				<span>
					<i className="ph-rc-swatch ph-rc-band-swatch" />
					{text.band}
				</span>
			</div>
			<div className="ph-rc-head">
				<span>{text.host}</span>
				<span>{text.cost}</span>
				<span className="ph-rc-num">{text.share}</span>
			</div>
			{model.rows.map((row, index) => (
				<div key={row.host.name} className={`ph-rc-row${highlight === row.host.name ? " ph-rc-you" : ""}`}>
					<div className="ph-rc-name">
						<strong>{row.host.name}</strong>
						<span>{routingCostNote(row.host, text)}</span>
					</div>
					<div className="ph-rc-track">
						<div className="ph-rc-band" style={{ left: pct(model.minCost), width: pct(model.minCost * model.edge) }} />
						<div className="ph-rc-bar" role="img" aria-label={`${row.host.name}: ${money(row.cost)} ${text.perThousand}`}>
							{parts.map((part) => (
								<div
									key={part.key}
									className={`ph-rc-seg ph-rc-${part.key}`}
									style={{ width: pct(row[part.key]) }}
									onMouseEnter={() => setHover({ index, part })}
									onMouseLeave={() => setHover(null)}
								/>
							))}
							<span className="ph-rc-total">{money(row.cost)}</span>
						</div>
						{hover && hover.index === index && (
							<div className={`ph-rc-tip${row.cost / axisMax > 0.6 ? " ph-rc-tip-left" : ""}`} style={{ left: pct(row.cost) }}>
								<strong>{row.host.name}</strong>
								{parts.map((part) => (
									<div key={part.key} className={hover.part.key === part.key ? "ph-rc-tip-on" : ""}>
										<i className={`ph-rc-swatch ph-rc-${part.key}`} />
										{part.label}
										<b>{money(row[part.key])}</b>
									</div>
								))}
								<div className="ph-rc-tip-sum">
									{text.vsBest}
									<b>{row.relative.toFixed(2)}×</b>
								</div>
							</div>
						)}
					</div>
					<div className="ph-rc-share">
						<span className="ph-rc-num">{row.share < 0.005 ? "<1%" : `${Math.round(row.share * 100)}%`}</span>
						<div className="ph-rc-sharebar">
							<div style={{ width: `${row.share * 100}%` }} />
						</div>
					</div>
				</div>
			))}
			<div className="ph-rc-axis">{axis}</div>
		</div>
	);
};

export const routingCostText = (locale) => {
	const localized = routingCostLocales[locale] ?? {};
	return {
		...routingCostLabels,
		...localized,
		hosts: { ...routingCostLabels.hosts, ...localized.hosts },
		controls: { ...routingCostLabels.controls, ...localized.controls },
	};
};

export const RoutingCostExplainer = ({ locale }) => {
	const text = routingCostText(locale);
	const h = text.hosts;
	const scenarios = [
		{
			mix: { prompt: 6000, output: 600 },
			hosts: [
				{ name: h.budget, input: 0.2, output: 0.8, ttftMs: 2400, tps: 25, errorRate: 0.03, limitRate: 0.06 },
				{ name: h.value, input: 0.25, output: 1, ttftMs: 900, tps: 60, errorRate: 0.005, limitRate: 0.01 },
				{ name: h.cached, input: 0.3, cachedRead: 0.03, hitRate: 0.5, output: 1.2, ttftMs: 600, tps: 90, errorRate: 0.003, limitRate: 0.005 },
				{ name: h.fast, input: 0.35, output: 1.4, ttftMs: 400, tps: 150, errorRate: 0.002, limitRate: 0 },
				{ name: h.premium, input: 0.6, output: 2.4, ttftMs: 300, tps: 250, errorRate: 0.001, limitRate: 0 },
			],
		},
		{
			mix: { prompt: 90000, output: 900 },
			hosts: [
				{ name: h.lowestList, input: 0.5, cachedRead: 0.05, hitRate: 0.05, output: 2, ttftMs: 2000, tps: 40, errorRate: 0.01, limitRate: 0.04 },
				{ name: h.goodCache, input: 0.6, cachedRead: 0.12, hitRate: 0.8, output: 2.2, ttftMs: 900, tps: 70, errorRate: 0.004, limitRate: 0.01 },
				{ name: h.noCachePrice, input: 0.55, output: 2, ttftMs: 1200, tps: 60, errorRate: 0.004, limitRate: 0.01 },
				{ name: h.fast, input: 0.9, cachedRead: 0.09, hitRate: 0.7, output: 3, ttftMs: 500, tps: 120, errorRate: 0.002, limitRate: 0 },
			],
		},
		{
			mix: { prompt: 3000, output: 400 },
			hosts: [
				{ name: h.healthy, input: 1, output: 3, ttftMs: 700, tps: 80, errorRate: 0.002, limitRate: 0.005 },
				{ name: h.failing, input: 0.95, output: 2.9, ttftMs: 1100, tps: 70, errorRate: 0.08, limitRate: 0.02 },
			],
		},
	];
	const [active, setActive] = useState(0);
	const scenario = scenarios[active];
	const model = routingCostModel(scenario.hosts, scenario.mix);
	const mixTokens = text.mixTokens
		.replace("{prompt}", scenario.mix.prompt.toLocaleString("en-US"))
		.replace("{output}", scenario.mix.output.toLocaleString("en-US"));
	return (
		<div className="ph-rc not-prose">
			<div className="ph-rc-tabs" role="tablist">
				{text.scenarios.map((name, index) => (
					<button
						key={name}
						type="button"
						role="tab"
						aria-selected={active === index}
						className={active === index ? "ph-rc-tab-on" : ""}
						onClick={() => setActive(index)}
					>
						{name}
					</button>
				))}
			</div>
			<div className="ph-rc-formula">
				<span>(</span>
				<span className="ph-rc-term"><i className="ph-rc-swatch ph-rc-tokens" />{text.tokens}</span>
				<span>+</span>
				<span className="ph-rc-term"><i className="ph-rc-swatch ph-rc-waiting" />{text.waiting}</span>
				<span>) ÷ {text.successRate}</span>
				<span>+</span>
				<span className="ph-rc-term"><i className="ph-rc-swatch ph-rc-failures" />{text.penalties}</span>
				<span>=</span>
				<strong>{text.cost}</strong>
			</div>
			<div className="ph-rc-mix">
				{text.mix}: {mixTokens}
			</div>
			<RoutingCostBars model={model} text={text} axis={text.axisUsers} />
		</div>
	);
};

export const ProviderTrafficPlayground = ({ locale }) => {
	const text = routingCostText(locale);
	const [you, setYou] = useState({ input: 0.4, output: 1.6, hitRate: 0.2, ttftMs: 1200, tps: 70, errorRate: 0.01, limitRate: 0.02 });
	const [workload, setWorkload] = useState(0);
	const mix = workload === 0 ? { prompt: 3000, output: 500 } : { prompt: 60000, output: 800 };
	const competitors = [
		{ name: `${text.provider} A`, short: "A", input: 0.3, output: 1.2, cachedRead: 0.03, hitRate: 0.1, ttftMs: 1500, tps: 45, errorRate: 0.01, limitRate: 0.03 },
		{ name: `${text.provider} B`, short: "B", input: 0.45, output: 1.8, cachedRead: 0.045, hitRate: 0.5, ttftMs: 600, tps: 110, errorRate: 0.003, limitRate: 0.005 },
		{ name: `${text.provider} C`, short: "C", input: 0.7, output: 2.8, ttftMs: 400, tps: 180, errorRate: 0.002, limitRate: 0 },
	];
	const yours = (overrides = {}) => ({ name: text.you, cachedRead: you.input / 10, ...you, ...overrides });
	const shareWith = (host) => routingCostModel([host, ...competitors], mix).rows[0].share;
	const model = routingCostModel([yours(), ...competitors], mix);
	const mine = model.rows[0];
	const levers = [
		yours({ input: you.input * 0.9, output: you.output * 0.9, cachedRead: (you.input / 10) * 0.9 }),
		yours({ ttftMs: you.ttftMs * 0.7 }),
		yours({ tps: you.tps * 1.3 }),
		yours({ errorRate: you.errorRate / 2, limitRate: you.limitRate / 2 }),
	].map((host, index) => ({ name: text.leverNames[index], gain: shareWith(host) - mine.share }));

	const sliders = [
		{ key: "input", label: "input", min: 0.1, max: 1.5, step: 0.05, show: (v) => `$${v.toFixed(2)}` },
		{ key: "output", label: "output", min: 0.4, max: 6, step: 0.1, show: (v) => `$${v.toFixed(2)}` },
		{ key: "hitRate", label: "hit", min: 0, max: 0.9, step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
		{ key: "ttftMs", label: "ttft", min: 200, max: 4000, step: 50, show: (v) => `${(v / 1000).toFixed(2)} s` },
		{ key: "tps", label: "tps", min: 15, max: 300, step: 5, show: (v) => `${v} tok/s` },
		{ key: "errorRate", label: "errors", min: 0, max: 0.1, step: 0.002, show: (v) => `${(v * 100).toFixed(1)}%` },
		{ key: "limitRate", label: "limits", min: 0, max: 0.15, step: 0.005, show: (v) => `${(v * 100).toFixed(1)}%` },
	];

	// Share curve: weight against cost relative to the lowest.
	const W = 320, H = 132, padL = 30, padB = 22, padT = 8, padR = 8;
	const xMax = 2.2;
	const x = (rel) => padL + ((Math.min(rel, xMax) - 1) / (xMax - 1)) * (W - padL - padR);
	const y = (weight) => padT + (1 - weight) * (H - padT - padB);
	const curve = Array.from({ length: 61 }, (_, i) => {
		const rel = 1 + (i / 60) * (xMax - 1);
		const weight = Math.max(model.floor, Math.exp(-(((rel - 1) / model.edge) ** 2)));
		return `${i ? "L" : "M"}${x(rel).toFixed(1)},${y(weight).toFixed(1)}`;
	}).join(" ");

	return (
		<div className="ph-rc not-prose">
			<div className="ph-rc-tabs" role="tablist">
				{text.workload.map((name, index) => (
					<button key={name} type="button" role="tab" aria-selected={workload === index} className={workload === index ? "ph-rc-tab-on" : ""} onClick={() => setWorkload(index)}>
						{name}
					</button>
				))}
			</div>
			<div className="ph-rc-play">
				<div className="ph-rc-controls">
					{sliders.map((s) => (
						<label key={s.key}>
							<span>
								{text.controls[s.label]}
								<b>{s.show(you[s.key])}</b>
							</span>
							<input
								type="range"
								min={s.min}
								max={s.max}
								step={s.step}
								value={you[s.key]}
								onChange={(event) => setYou({ ...you, [s.key]: Number(event.target.value) })}
							/>
						</label>
					))}
				</div>
				<div className="ph-rc-summary">
					<div className="ph-rc-hero">
						<span>{text.yourShare}</span>
						<strong>{Math.round(mine.share * 100)}%</strong>
					</div>
					<svg viewBox={`0 0 ${W} ${H}`} className="ph-rc-curve" role="img" aria-label={text.curve}>
						<rect x={x(1)} y={padT} width={x(1 + model.edge) - x(1)} height={H - padT - padB} className="ph-rc-band-fill" />
						<line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="ph-rc-baseline" />
						{[1, 1.5, 2].map((t) => (
							<text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="ph-rc-tick">{t.toFixed(1)}×</text>
						))}
						<text x={padL - 6} y={y(1) + 4} textAnchor="end" className="ph-rc-tick">1</text>
						<text x={padL - 6} y={y(0) + 4} textAnchor="end" className="ph-rc-tick">0</text>
						<path d={curve} className="ph-rc-line" />
						{model.rows.slice(1).map((row) => (
							<g key={row.host.name}>
								<circle cx={x(row.relative)} cy={y(row.weight)} r="4" className="ph-rc-dot-other" />
								<text x={x(row.relative)} y={y(row.weight) - 8} textAnchor="middle" className="ph-rc-tick">{row.host.short}</text>
							</g>
						))}
						<circle cx={x(mine.relative)} cy={y(mine.weight)} r="6" className="ph-rc-dot-you" />
						<text x={x(mine.relative) + 9} y={y(mine.weight) + 4} className="ph-rc-dot-label">{text.youShort}</text>
					</svg>
					<div className="ph-rc-caption">{text.curve}</div>
					<div className="ph-rc-levers">
						<div className="ph-rc-levers-title">{text.levers}</div>
						{levers.map((lever) => (
							<div key={lever.name}>
								<span>{lever.name}</span>
								<b>{lever.gain >= 0.0005 ? "+" : ""}{(lever.gain * 100).toFixed(1)} {text.points}</b>
							</div>
						))}
					</div>
				</div>
			</div>
			<RoutingCostBars model={model} text={text} axis={text.axisProviders} highlight={text.you} />
		</div>
	);
};

export const routingCostLocales = {
	"de": {
		"tokens": "Tokens",
		"waiting": "Wartezeit",
		"failures": "Fehler und Wiederholungen",
		"band": "Bis 30 % über dem Minimum",
		"host": "Anbieter",
		"cost": "Kosten pro erfolgreicher Antwort",
		"share": "Anteil am Traffic",
		"perThousand": "pro 1.000 Antworten",
		"vsBest": "Im Vergleich zum Minimum",
		"cacheHits": "Cache-Treffer",
		"failed": "Fehler",
		"mix": "Typische Anfrage",
		"mixTokens": "{prompt} Prompt-Tokens, {output} Ausgabe-Tokens",
		"successRate": "Erfolgsquote",
		"penalties": "Aufschläge für Fehler und Ratenlimits",
		"axisUsers": "Dollar pro 1.000 erfolgreiche Antworten. Die Wartezeit wird zum typischen Preis pro Sekunde des Modells in Dollar umgerechnet.",
		"axisProviders": "Dollar pro 1.000 erfolgreiche Antworten für eine typische Anfrage an dieses Modell.",
		"scenarios": [
			"Offenes Modell, fünf Anbieter",
			"Agent mit gecachten Prompts",
			"Ein Anbieter fällt aus"
		],
		"hosts": {
			"budget": "Günstig",
			"value": "Preiswert",
			"cached": "Mit Cache",
			"fast": "Schnell",
			"premium": "Premium",
			"lowestList": "Niedrigster Listenpreis",
			"goodCache": "Guter Cache",
			"noCachePrice": "Ohne Cache-Preis",
			"healthy": "Stabil",
			"failing": "Fehlerhaft"
		},
		"you": "Dein Endpunkt",
		"youShort": "Du",
		"provider": "Anbieter",
		"yourShare": "Dein Anteil am Traffic",
		"curve": "Traffic-Gewicht nach Kosten im Vergleich zum Minimum",
		"levers": "Was jede Änderung bringt",
		"points": "Pkt.",
		"workload": [
			"Chat: 3K Prompt, 500 Ausgabe",
			"Agent: 60K Prompt, 800 Ausgabe"
		],
		"controls": {
			"input": "Eingabepreis ($/M)",
			"output": "Ausgabepreis ($/M)",
			"hit": "Prompt aus dem Cache",
			"ttft": "Zeit bis zum ersten Token",
			"tps": "Ausgabegeschwindigkeit",
			"errors": "Von dir verursachte Fehler",
			"limits": "Ablehnungen wegen Ratenlimit"
		},
		"leverNames": [
			"Preise um 10 % senken",
			"Erstes Token 30 % früher",
			"Ausgabe 30 % schneller",
			"Fehler und Ablehnungen halbieren"
		]
	},
	"es": {
		"tokens": "Tokens",
		"waiting": "Espera",
		"failures": "Fallos y reintentos",
		"band": "Hasta un 30 % sobre el mínimo",
		"host": "Proveedor",
		"cost": "Coste por respuesta correcta",
		"share": "Cuota de tráfico",
		"perThousand": "por 1.000 respuestas",
		"vsBest": "Frente al mínimo",
		"cacheHits": "aciertos de caché",
		"failed": "fallos",
		"mix": "Solicitud típica",
		"mixTokens": "{prompt} tokens de prompt, {output} tokens de salida",
		"successRate": "tasa de éxito",
		"penalties": "penalizaciones por errores y límites de frecuencia",
		"axisUsers": "Dólares por cada 1.000 respuestas correctas. La espera se convierte a dólares según el precio típico por segundo del modelo.",
		"axisProviders": "Dólares por cada 1.000 respuestas correctas para una solicitud típica de este modelo.",
		"scenarios": [
			"Modelo abierto, cinco proveedores",
			"Agente con prompts en caché",
			"Un proveedor fallando"
		],
		"hosts": {
			"budget": "Económico",
			"value": "Equilibrado",
			"cached": "Con caché",
			"fast": "Rápido",
			"premium": "Premium",
			"lowestList": "Precio de lista más bajo",
			"goodCache": "Buena caché",
			"noCachePrice": "Sin precio de caché",
			"healthy": "Estable",
			"failing": "Con fallos"
		},
		"you": "Tu endpoint",
		"youShort": "Tú",
		"provider": "Proveedor",
		"yourShare": "Tu cuota de tráfico",
		"curve": "Peso de tráfico según el coste frente al mínimo",
		"levers": "Lo que aporta cada cambio",
		"points": "pts",
		"workload": [
			"Chat: 3K de prompt, 500 de salida",
			"Agente: 60K de prompt, 800 de salida"
		],
		"controls": {
			"input": "Precio de entrada ($/M)",
			"output": "Precio de salida ($/M)",
			"hit": "Prompt servido desde caché",
			"ttft": "Tiempo hasta el primer token",
			"tps": "Velocidad de salida",
			"errors": "Errores que causas",
			"limits": "Rechazos por límite de frecuencia"
		},
		"leverNames": [
			"Bajar precios un 10 %",
			"Primer token un 30 % antes",
			"Salida un 30 % más rápida",
			"Reducir a la mitad errores y rechazos"
		]
	},
	"fr": {
		"tokens": "Tokens",
		"waiting": "Attente",
		"failures": "Échecs et nouvelles tentatives",
		"band": "Jusqu’à 30 % au-dessus du minimum",
		"host": "Fournisseur",
		"cost": "Coût par réponse réussie",
		"share": "Part du trafic",
		"perThousand": "pour 1 000 réponses",
		"vsBest": "Par rapport au minimum",
		"cacheHits": "de succès du cache",
		"failed": "d’échecs",
		"mix": "Requête type",
		"mixTokens": "{prompt} tokens de prompt, {output} tokens de sortie",
		"successRate": "taux de réussite",
		"penalties": "pénalités pour erreurs et limites de débit",
		"axisUsers": "Dollars pour 1 000 réponses réussies. L’attente est convertie en dollars au prix typique par seconde du modèle.",
		"axisProviders": "Dollars pour 1 000 réponses réussies, pour une requête type sur ce modèle.",
		"scenarios": [
			"Modèle ouvert, cinq fournisseurs",
			"Agent avec prompts en cache",
			"Un fournisseur en échec"
		],
		"hosts": {
			"budget": "Économique",
			"value": "Bon rapport",
			"cached": "Avec cache",
			"fast": "Rapide",
			"premium": "Premium",
			"lowestList": "Prix catalogue le plus bas",
			"goodCache": "Bon cache",
			"noCachePrice": "Sans prix de cache",
			"healthy": "Stable",
			"failing": "En échec"
		},
		"you": "Votre endpoint",
		"youShort": "Vous",
		"provider": "Fournisseur",
		"yourShare": "Votre part du trafic",
		"curve": "Poids du trafic selon le coût par rapport au minimum",
		"levers": "Ce que vaut chaque changement",
		"points": "pts",
		"workload": [
			"Chat : 3K de prompt, 500 en sortie",
			"Agent : 60K de prompt, 800 en sortie"
		],
		"controls": {
			"input": "Prix d’entrée ($/M)",
			"output": "Prix de sortie ($/M)",
			"hit": "Prompt servi depuis le cache",
			"ttft": "Délai avant le premier token",
			"tps": "Vitesse de sortie",
			"errors": "Erreurs de votre fait",
			"limits": "Refus pour limite de débit"
		},
		"leverNames": [
			"Baisser les prix de 10 %",
			"Premier token 30 % plus tôt",
			"Sortie 30 % plus rapide",
			"Diviser par deux erreurs et refus"
		]
	},
	"pt-BR": {
		"tokens": "Tokens",
		"waiting": "Espera",
		"failures": "Falhas e novas tentativas",
		"band": "Até 30% acima do mínimo",
		"host": "Provedor",
		"cost": "Custo por resposta bem-sucedida",
		"share": "Parcela do tráfego",
		"perThousand": "por 1.000 respostas",
		"vsBest": "Em relação ao mínimo",
		"cacheHits": "de acertos de cache",
		"failed": "de falhas",
		"mix": "Solicitação típica",
		"mixTokens": "{prompt} tokens de prompt, {output} tokens de saída",
		"successRate": "taxa de sucesso",
		"penalties": "penalidades por erros e limites de taxa",
		"axisUsers": "Dólares por 1.000 respostas bem-sucedidas. A espera é convertida em dólares pelo preço típico por segundo do modelo.",
		"axisProviders": "Dólares por 1.000 respostas bem-sucedidas para uma solicitação típica deste modelo.",
		"scenarios": [
			"Modelo aberto, cinco provedores",
			"Agente com prompts em cache",
			"Um provedor falhando"
		],
		"hosts": {
			"budget": "Econômico",
			"value": "Custo-benefício",
			"cached": "Com cache",
			"fast": "Rápido",
			"premium": "Premium",
			"lowestList": "Menor preço de tabela",
			"goodCache": "Bom cache",
			"noCachePrice": "Sem preço de cache",
			"healthy": "Estável",
			"failing": "Com falhas"
		},
		"you": "Seu endpoint",
		"youShort": "Você",
		"provider": "Provedor",
		"yourShare": "Sua parcela do tráfego",
		"curve": "Peso do tráfego pelo custo em relação ao mínimo",
		"levers": "Quanto vale cada mudança",
		"points": "pts",
		"workload": [
			"Chat: 3K de prompt, 500 de saída",
			"Agente: 60K de prompt, 800 de saída"
		],
		"controls": {
			"input": "Preço de entrada ($/M)",
			"output": "Preço de saída ($/M)",
			"hit": "Prompt servido do cache",
			"ttft": "Tempo até o primeiro token",
			"tps": "Velocidade de saída",
			"errors": "Erros causados por você",
			"limits": "Recusas por limite de taxa"
		},
		"leverNames": [
			"Reduzir preços em 10%",
			"Primeiro token 30% mais cedo",
			"Saída 30% mais rápida",
			"Reduzir pela metade erros e recusas"
		]
	},
	"ja": {
		"tokens": "トークン",
		"waiting": "待ち時間",
		"failures": "失敗と再試行",
		"band": "最低コストから 30% 以内",
		"host": "プロバイダー",
		"cost": "成功した回答 1 件あたりのコスト",
		"share": "トラフィックのシェア",
		"perThousand": "（回答 1,000 件あたり）",
		"vsBest": "最低コストとの比較",
		"cacheHits": "キャッシュヒット",
		"failed": "失敗",
		"mix": "典型的なリクエスト",
		"mixTokens": "プロンプト {prompt} トークン、出力 {output} トークン",
		"successRate": "成功率",
		"penalties": "エラーとレート制限のペナルティ",
		"axisUsers": "成功した回答 1,000 件あたりのドル。待ち時間は、モデルの 1 秒あたりの典型的な価格でドルに換算しています。",
		"axisProviders": "このモデルの典型的なリクエストで、成功した回答 1,000 件あたりのドル。",
		"scenarios": [
			"オープンモデル、5 プロバイダー",
			"キャッシュ済みプロンプトのエージェント",
			"1 プロバイダーが障害中"
		],
		"hosts": {
			"budget": "低価格",
			"value": "バランス",
			"cached": "キャッシュあり",
			"fast": "高速",
			"premium": "プレミアム",
			"lowestList": "最安の表示価格",
			"goodCache": "キャッシュ良好",
			"noCachePrice": "キャッシュ価格なし",
			"healthy": "正常",
			"failing": "障害中"
		},
		"you": "あなたのエンドポイント",
		"youShort": "あなた",
		"provider": "プロバイダー",
		"yourShare": "あなたのトラフィックシェア",
		"curve": "最低コストとの比較によるトラフィックの重み",
		"levers": "各変更の効果",
		"points": "pt",
		"workload": [
			"チャット: プロンプト 3K、出力 500",
			"エージェント: プロンプト 60K、出力 800"
		],
		"controls": {
			"input": "入力価格 ($/M)",
			"output": "出力価格 ($/M)",
			"hit": "キャッシュから返すプロンプト",
			"ttft": "最初のトークンまでの時間",
			"tps": "出力速度",
			"errors": "自社起因のエラー",
			"limits": "レート制限による拒否"
		},
		"leverNames": [
			"価格を 10% 下げる",
			"最初のトークンを 30% 早く",
			"出力を 30% 速く",
			"エラーと拒否を半減"
		]
	},
	"zh-Hans": {
		"tokens": "Token",
		"waiting": "等待",
		"failures": "失败与重试",
		"band": "不高于最低成本 30%",
		"host": "提供商",
		"cost": "每次成功回答的成本",
		"share": "流量份额",
		"perThousand": "（每 1,000 次回答）",
		"vsBest": "与最低成本相比",
		"cacheHits": "缓存命中",
		"failed": "失败",
		"mix": "典型请求",
		"mixTokens": "{prompt} 个提示 Token，{output} 个输出 Token",
		"successRate": "成功率",
		"penalties": "错误和速率限制惩罚",
		"axisUsers": "每 1,000 次成功回答的美元成本。等待时间按该模型每秒的典型价格折算为美元。",
		"axisProviders": "该模型典型请求下每 1,000 次成功回答的美元成本。",
		"scenarios": [
			"开放模型，五个提供商",
			"使用缓存提示的智能体",
			"一个提供商出现故障"
		],
		"hosts": {
			"budget": "低价",
			"value": "均衡",
			"cached": "带缓存",
			"fast": "快速",
			"premium": "高端",
			"lowestList": "标价最低",
			"goodCache": "缓存良好",
			"noCachePrice": "无缓存价格",
			"healthy": "正常",
			"failing": "故障"
		},
		"you": "你的端点",
		"youShort": "你",
		"provider": "提供商",
		"yourShare": "你的流量份额",
		"curve": "按与最低成本之比得到的流量权重",
		"levers": "每项改进的效果",
		"points": "个百分点",
		"workload": [
			"聊天：3K 提示，500 输出",
			"智能体：60K 提示，800 输出"
		],
		"controls": {
			"input": "输入价格 ($/M)",
			"output": "输出价格 ($/M)",
			"hit": "由缓存提供的提示比例",
			"ttft": "首个 Token 时间",
			"tps": "输出速度",
			"errors": "由你造成的错误",
			"limits": "速率限制拒绝"
		},
		"leverNames": [
			"价格降低 10%",
			"首个 Token 提前 30%",
			"输出加快 30%",
			"错误和拒绝减半"
		]
	},
	"hi": {
		"tokens": "टोकन",
		"waiting": "प्रतीक्षा",
		"failures": "विफलताएँ और दोबारा प्रयास",
		"band": "न्यूनतम से 30% के भीतर",
		"host": "प्रदाता",
		"cost": "प्रति सफल उत्तर लागत",
		"share": "ट्रैफ़िक में हिस्सा",
		"perThousand": "प्रति 1,000 उत्तर",
		"vsBest": "न्यूनतम की तुलना में",
		"cacheHits": "cache hit",
		"failed": "विफल",
		"mix": "सामान्य अनुरोध",
		"mixTokens": "{prompt} prompt टोकन, {output} output टोकन",
		"successRate": "सफलता दर",
		"penalties": "त्रुटि और rate limit दंड",
		"axisUsers": "प्रति 1,000 सफल उत्तर डॉलर। प्रतीक्षा को मॉडल की प्रति सेकंड सामान्य कीमत पर डॉलर में बदला जाता है।",
		"axisProviders": "इस मॉडल पर सामान्य अनुरोध के लिए प्रति 1,000 सफल उत्तर डॉलर।",
		"scenarios": [
			"ओपन मॉडल, पाँच प्रदाता",
			"cache किए गए prompt वाला एजेंट",
			"एक प्रदाता विफल"
		],
		"hosts": {
			"budget": "सस्ता",
			"value": "किफ़ायती",
			"cached": "Cache वाला",
			"fast": "तेज़",
			"premium": "प्रीमियम",
			"lowestList": "सबसे कम सूची मूल्य",
			"goodCache": "अच्छा cache",
			"noCachePrice": "Cache मूल्य नहीं",
			"healthy": "स्थिर",
			"failing": "विफल हो रहा"
		},
		"you": "आपका endpoint",
		"youShort": "आप",
		"provider": "प्रदाता",
		"yourShare": "ट्रैफ़िक में आपका हिस्सा",
		"curve": "न्यूनतम की तुलना में लागत के अनुसार ट्रैफ़िक भार",
		"levers": "हर बदलाव का असर",
		"points": "अंक",
		"workload": [
			"चैट: 3K prompt, 500 output",
			"एजेंट: 60K prompt, 800 output"
		],
		"controls": {
			"input": "इनपुट कीमत ($/M)",
			"output": "आउटपुट कीमत ($/M)",
			"hit": "Cache से दिया गया prompt",
			"ttft": "पहले टोकन का समय",
			"tps": "आउटपुट गति",
			"errors": "आपकी वजह से त्रुटियाँ",
			"limits": "Rate limit के कारण अस्वीकृति"
		},
		"leverNames": [
			"कीमतें 10% घटाएँ",
			"पहला टोकन 30% पहले",
			"आउटपुट 30% तेज़",
			"त्रुटियाँ और अस्वीकृतियाँ आधी करें"
		]
	},
	"ar": {
		"tokens": "الرموز",
		"waiting": "الانتظار",
		"failures": "الإخفاقات وإعادة المحاولة",
		"band": "حتى 30% فوق الأدنى",
		"host": "المزوّد",
		"cost": "التكلفة لكل إجابة ناجحة",
		"share": "حصة الحركة",
		"perThousand": "لكل 1,000 إجابة",
		"vsBest": "مقارنةً بالأدنى",
		"cacheHits": "إصابات ذاكرة مؤقتة",
		"failed": "إخفاق",
		"mix": "طلب نموذجي",
		"mixTokens": "{prompt} رمز مطالبة، {output} رمز مخرجات",
		"successRate": "معدل النجاح",
		"penalties": "عقوبات الأخطاء وحدود المعدل",
		"axisUsers": "بالدولار لكل 1,000 إجابة ناجحة. يُحوَّل الانتظار إلى دولارات بالسعر النموذجي للنموذج في الثانية.",
		"axisProviders": "بالدولار لكل 1,000 إجابة ناجحة لطلب نموذجي على هذا النموذج.",
		"scenarios": [
			"نموذج مفتوح، خمسة مزوّدين",
			"وكيل بمطالبات مخزّنة مؤقتًا",
			"مزوّد واحد متعطّل"
		],
		"hosts": {
			"budget": "اقتصادي",
			"value": "متوازن",
			"cached": "بذاكرة مؤقتة",
			"fast": "سريع",
			"premium": "متميّز",
			"lowestList": "أدنى سعر معلن",
			"goodCache": "ذاكرة مؤقتة جيدة",
			"noCachePrice": "بلا سعر للذاكرة المؤقتة",
			"healthy": "مستقر",
			"failing": "متعطّل"
		},
		"you": "نقطة النهاية الخاصة بك",
		"youShort": "أنت",
		"provider": "المزوّد",
		"yourShare": "حصتك من الحركة",
		"curve": "وزن الحركة حسب التكلفة مقارنةً بالأدنى",
		"levers": "أثر كل تغيير",
		"points": "نقطة",
		"workload": [
			"محادثة: 3K مطالبة، 500 مخرجات",
			"وكيل: 60K مطالبة، 800 مخرجات"
		],
		"controls": {
			"input": "سعر الإدخال ($/M)",
			"output": "سعر الإخراج ($/M)",
			"hit": "المطالبة المقدَّمة من الذاكرة المؤقتة",
			"ttft": "الوقت حتى أول رمز",
			"tps": "سرعة الإخراج",
			"errors": "الأخطاء التي تسببها",
			"limits": "الرفض بسبب حدود المعدل"
		},
		"leverNames": [
			"خفض الأسعار 10%",
			"أول رمز أسرع بنسبة 30%",
			"إخراج أسرع بنسبة 30%",
			"خفض الأخطاء والرفض إلى النصف"
		]
	}
};
