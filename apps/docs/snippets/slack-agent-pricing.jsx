// Interactive calculator for the Slack agent's monthly charge.
// The rules mirror packages/shared/slack-agent-pricing/index.ts (slackAgentPlanNanos and
// slackAgentMonthlyCharge): plan price by people who used the agent, 300 answers included per
// person and pooled, $0.25 per 1,000 answers beyond that, never more than the spending cap.
// Model tokens are billed separately and are not part of this price.
// Every visible string comes from slackAgentPricingLabels; translated pages pass `locale`.

export const slackAgentPricingLabels = {
	people: "People who got an answer this month",
	answers: "Answers this month",
	cap: "Monthly spending cap (optional)",
	plan: "Plan price",
	included: "Answers included",
	extra: "Extra answers",
	extraCost: "Extra answers cost",
	charge: "Charged at month end",
	capped: "Capped at your monthly spending cap",
	note: "Model tokens are billed separately, at each model's price.",
};

export const slackAgentPricingLocales = {
	es: {
		people: "Personas que recibieron una respuesta este mes",
		answers: "Respuestas este mes",
		cap: "Límite de gasto mensual (opcional)",
		plan: "Precio del plan",
		included: "Respuestas incluidas",
		extra: "Respuestas adicionales",
		extraCost: "Coste de las respuestas adicionales",
		charge: "Cargo a fin de mes",
		capped: "Limitado a tu límite de gasto mensual",
		note: "Los tokens del modelo se facturan aparte, al precio de cada modelo.",
	},
	fr: {
		people: "Personnes ayant reçu une réponse ce mois-ci",
		answers: "Réponses ce mois-ci",
		cap: "Plafond de dépenses mensuel (facultatif)",
		plan: "Prix de l’offre",
		included: "Réponses incluses",
		extra: "Réponses supplémentaires",
		extraCost: "Coût des réponses supplémentaires",
		charge: "Facturé en fin de mois",
		capped: "Plafonné à votre plafond de dépenses mensuel",
		note: "Les tokens du modèle sont facturés séparément, au prix de chaque modèle.",
	},
	de: {
		people: "Personen, die diesen Monat eine Antwort bekommen haben",
		answers: "Antworten diesen Monat",
		cap: "Monatliches Ausgabenlimit (optional)",
		plan: "Planpreis",
		included: "Enthaltene Antworten",
		extra: "Zusätzliche Antworten",
		extraCost: "Kosten für zusätzliche Antworten",
		charge: "Am Monatsende berechnet",
		capped: "Auf dein monatliches Ausgabenlimit begrenzt",
		note: "Modell-Tokens werden separat zum Preis des jeweiligen Modells abgerechnet.",
	},
	"pt-BR": {
		people: "Pessoas que receberam uma resposta este mês",
		answers: "Respostas este mês",
		cap: "Limite de gastos mensal (opcional)",
		plan: "Preço do plano",
		included: "Respostas incluídas",
		extra: "Respostas extras",
		extraCost: "Custo das respostas extras",
		charge: "Cobrado no fim do mês",
		capped: "Limitado ao seu limite de gastos mensal",
		note: "Os tokens do modelo são cobrados à parte, pelo preço de cada modelo.",
	},
	ja: {
		people: "今月回答を受け取った人数",
		answers: "今月の回答数",
		cap: "月額の支出上限 (任意)",
		plan: "プラン料金",
		included: "含まれる回答数",
		extra: "追加の回答数",
		extraCost: "追加の回答の料金",
		charge: "月末の請求額",
		capped: "月額の支出上限で打ち止めになっています",
		note: "モデルのトークンは、各モデルの料金で別途請求されます。",
	},
	"zh-Hans": {
		people: "本月收到回答的人数",
		answers: "本月回答数",
		cap: "每月支出上限（可选）",
		plan: "套餐价格",
		included: "包含的回答数",
		extra: "额外回答数",
		extraCost: "额外回答费用",
		charge: "月末扣费",
		capped: "已按你的每月支出上限封顶",
		note: "模型 token 按各模型的价格单独计费。",
	},
	hi: {
		people: "इस महीने जवाब पाने वाले लोग",
		answers: "इस महीने के जवाब",
		cap: "मासिक खर्च सीमा (वैकल्पिक)",
		plan: "प्लान की कीमत",
		included: "शामिल जवाब",
		extra: "अतिरिक्त जवाब",
		extraCost: "अतिरिक्त जवाबों की लागत",
		charge: "महीने के अंत में शुल्क",
		capped: "आपकी मासिक खर्च सीमा पर सीमित",
		note: "मॉडल टोकन का बिल अलग से, हर मॉडल की कीमत पर बनता है।",
	},
	ar: {
		people: "الأشخاص الذين تلقوا إجابة هذا الشهر",
		answers: "الإجابات هذا الشهر",
		cap: "حد الإنفاق الشهري (اختياري)",
		plan: "سعر الخطة",
		included: "الإجابات المضمّنة",
		extra: "الإجابات الإضافية",
		extraCost: "تكلفة الإجابات الإضافية",
		charge: "المبلغ المحصّل في نهاية الشهر",
		capped: "محدود بحد الإنفاق الشهري الخاص بك",
		note: "تُحتسب رموز النموذج بشكل منفصل، بسعر كل نموذج.",
	},
};

export const slackAgentPricingText = (locale) => ({
	...slackAgentPricingLabels,
	...(slackAgentPricingLocales[locale] ?? {}),
});

const TIERS = [
	{ people: 3, cents: 99 },
	{ people: 10, cents: 299 },
	{ people: 25, cents: 499 },
	{ people: 50, cents: 799 },
	{ people: 100, cents: 1499 },
];

// Plan price in cents for this many people.
export const slackAgentPlanCents = (people) => {
	if (!Number.isFinite(people) || people <= 0) return 0;
	const count = Math.ceil(people);
	for (const tier of TIERS) if (count <= tier.people) return tier.cents;
	const topCents = 1499;
	const curveCents = count >= 1000 ? 5900 : topCents + ((5900 - topCents) * (count - 100)) / 900;
	const dollars = Math.max(Math.round(curveCents / 100), Math.round((count * 45) / 1000));
	return dollars * 100;
};

// Month's charge in tenths of a cent, to keep $0.00025 per answer exact.
export const slackAgentCharge = (people, answers, capDollars) => {
	const p = Math.max(0, Math.floor(people || 0));
	const a = Math.max(0, Math.floor(answers || 0));
	const planMills = slackAgentPlanCents(p) * 10;
	const included = p * 300;
	const extra = Math.max(0, a - included);
	const extraMills = extra / 4;
	const total = planMills + extraMills;
	const cap = capDollars > 0 ? capDollars * 1000 : null;
	const charged = cap == null ? total : Math.min(total, cap);
	return { planMills, included, extra, extraMills, charged, capped: cap != null && total > cap };
};

const usd = (mills) => `$${(Math.round(mills / 10) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SlackAgentPricing = ({ locale }) => {
	const text = slackAgentPricingText(locale);
	const [people, setPeople] = useState(8);
	const [answers, setAnswers] = useState(3000);
	const [cap, setCap] = useState("");
	const result = slackAgentCharge(Number(people), Number(answers), Number(cap));
	const rows = [
		[text.plan, usd(result.planMills)],
		[text.included, result.included.toLocaleString("en-US")],
		[text.extra, result.extra.toLocaleString("en-US")],
		[text.extraCost, usd(result.extraMills)],
	];
	return (
		<div className="ph-sap">
			<div className="ph-sap-inputs">
				<label>
					{text.people}
					<input type="number" min="0" value={people} onChange={(event) => setPeople(event.target.value)} />
				</label>
				<label>
					{text.answers}
					<input type="number" min="0" step="100" value={answers} onChange={(event) => setAnswers(event.target.value)} />
				</label>
				<label>
					{text.cap}
					<input type="number" min="0" value={cap} placeholder="$" onChange={(event) => setCap(event.target.value)} />
				</label>
			</div>
			<dl className="ph-sap-rows">
				{rows.map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
				<div className="ph-sap-total">
					<dt>{text.charge}</dt>
					<dd>{usd(result.charged)}</dd>
				</div>
			</dl>
			{result.capped ? <p className="ph-sap-note">{text.capped}</p> : null}
			<p className="ph-sap-note">{text.note}</p>
		</div>
	);
};
