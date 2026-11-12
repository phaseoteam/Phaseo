// Interactive explainer for how a preset merges into a Responses request.
// The rules mirror apps/api/src/pipeline/before/presetMerge.ts (mergePresetWithBody):
// defaults fill only missing fields, the preset prompt is prepended to `instructions`,
// and request `provider` fields win over the preset's.
// Every visible string comes from presetMergeLabels; translated pages pass `locale`.

export const presetMergeLabels = {
	request: "Your request",
	preset: "Preset @support-triage",
	merged: "What the gateway runs",
	toggles: {
		temperature: "Request sets temperature",
		instructions: "Request sends its own instructions",
		order: "Request sets a provider order",
	},
	fields: { model: "Model", prompt: "System prompt", params: "Default parameters", order: "Provider order" },
	legend: { request: "From your request", preset: "From the preset", both: "Combined" },
	input: "Customer says the invoice total is wrong.",
	presetPrompt: "You triage support tickets. Reply with a category and a one-line summary.",
	ownPrompt: "Answer in French.",
};

export const presetMergeLocales = {
	es: {
		request: "Tu solicitud",
		preset: "Preajuste @support-triage",
		merged: "Lo que ejecuta el Gateway",
		toggles: {
			temperature: "La solicitud fija temperature",
			instructions: "La solicitud envía sus propias instrucciones",
			order: "La solicitud fija un orden de proveedores",
		},
		fields: { model: "Modelo", prompt: "Prompt del sistema", params: "Parámetros predeterminados", order: "Orden de proveedores" },
		legend: { request: "De tu solicitud", preset: "Del preajuste", both: "Combinado" },
		input: "El cliente dice que el total de la factura es incorrecto.",
		presetPrompt: "Clasificas tickets de soporte. Responde con una categoría y un resumen de una línea.",
		ownPrompt: "Responde en francés.",
	},
	fr: {
		request: "Votre requête",
		preset: "Préréglage @support-triage",
		merged: "Ce qu’exécute le Gateway",
		toggles: {
			temperature: "La requête définit temperature",
			instructions: "La requête envoie ses propres instructions",
			order: "La requête définit un ordre de fournisseurs",
		},
		fields: { model: "Modèle", prompt: "Prompt système", params: "Paramètres par défaut", order: "Ordre des fournisseurs" },
		legend: { request: "De votre requête", preset: "Du préréglage", both: "Combiné" },
		input: "Le client dit que le total de la facture est faux.",
		presetPrompt: "Vous triez les tickets de support. Répondez avec une catégorie et un résumé d’une ligne.",
		ownPrompt: "Répondez en anglais.",
	},
	de: {
		request: "Deine Anfrage",
		preset: "Voreinstellung @support-triage",
		merged: "Was das Gateway ausführt",
		toggles: {
			temperature: "Anfrage setzt temperature",
			instructions: "Anfrage sendet eigene Anweisungen",
			order: "Anfrage setzt eine Anbieterreihenfolge",
		},
		fields: { model: "Modell", prompt: "System-Prompt", params: "Standardparameter", order: "Anbieterreihenfolge" },
		legend: { request: "Aus deiner Anfrage", preset: "Aus der Voreinstellung", both: "Kombiniert" },
		input: "Der Kunde sagt, die Rechnungssumme ist falsch.",
		presetPrompt: "Du sortierst Support-Tickets. Antworte mit einer Kategorie und einer einzeiligen Zusammenfassung.",
		ownPrompt: "Antworte auf Französisch.",
	},
	"pt-BR": {
		request: "Sua solicitação",
		preset: "Predefinição @support-triage",
		merged: "O que o Gateway executa",
		toggles: {
			temperature: "A solicitação define temperature",
			instructions: "A solicitação envia as próprias instruções",
			order: "A solicitação define uma ordem de provedores",
		},
		fields: { model: "Modelo", prompt: "Prompt do sistema", params: "Parâmetros padrão", order: "Ordem de provedores" },
		legend: { request: "Da sua solicitação", preset: "Da predefinição", both: "Combinado" },
		input: "O cliente diz que o total da fatura está errado.",
		presetPrompt: "Você faz a triagem de tickets de suporte. Responda com uma categoria e um resumo de uma linha.",
		ownPrompt: "Responda em francês.",
	},
	ja: {
		request: "あなたのリクエスト",
		preset: "プリセット @support-triage",
		merged: "ゲートウェイが実行する内容",
		toggles: {
			temperature: "リクエストで temperature を指定",
			instructions: "リクエストで独自の指示を送信",
			order: "リクエストでプロバイダーの順序を指定",
		},
		fields: { model: "モデル", prompt: "システムプロンプト", params: "既定のパラメーター", order: "プロバイダーの順序" },
		legend: { request: "リクエストから", preset: "プリセットから", both: "結合" },
		input: "請求書の合計金額が間違っているとお客様から連絡がありました。",
		presetPrompt: "あなたはサポートチケットを振り分けます。カテゴリと 1 行の要約で回答してください。",
		ownPrompt: "フランス語で回答してください。",
	},
	"zh-Hans": {
		request: "你的请求",
		preset: "预设 @support-triage",
		merged: "网关实际运行的内容",
		toggles: {
			temperature: "请求设置了 temperature",
			instructions: "请求发送了自己的指令",
			order: "请求设置了提供商顺序",
		},
		fields: { model: "模型", prompt: "系统提示词", params: "默认参数", order: "提供商顺序" },
		legend: { request: "来自你的请求", preset: "来自预设", both: "合并" },
		input: "客户说发票总额不对。",
		presetPrompt: "你负责分类支持工单。请回复一个类别和一句话摘要。",
		ownPrompt: "请用法语回答。",
	},
	hi: {
		request: "आपका अनुरोध",
		preset: "प्रीसेट @support-triage",
		merged: "गेटवे क्या चलाता है",
		toggles: {
			temperature: "अनुरोध temperature सेट करता है",
			instructions: "अनुरोध अपने निर्देश भेजता है",
			order: "अनुरोध प्रदाता क्रम सेट करता है",
		},
		fields: { model: "मॉडल", prompt: "सिस्टम प्रॉम्प्ट", params: "डिफ़ॉल्ट पैरामीटर", order: "प्रदाता क्रम" },
		legend: { request: "आपके अनुरोध से", preset: "प्रीसेट से", both: "मिलाकर" },
		input: "ग्राहक का कहना है कि इनवॉइस की कुल राशि गलत है।",
		presetPrompt: "आप सपोर्ट टिकट छाँटते हैं। एक श्रेणी और एक पंक्ति के सारांश के साथ उत्तर दें।",
		ownPrompt: "फ़्रेंच में उत्तर दें।",
	},
	ar: {
		request: "طلبك",
		preset: "الإعداد المسبق @support-triage",
		merged: "ما تشغّله البوابة",
		toggles: {
			temperature: "الطلب يحدد temperature",
			instructions: "الطلب يرسل تعليماته الخاصة",
			order: "الطلب يحدد ترتيب المزوّدين",
		},
		fields: { model: "النموذج", prompt: "موجّه النظام", params: "المعاملات الافتراضية", order: "ترتيب المزوّدين" },
		legend: { request: "من طلبك", preset: "من الإعداد المسبق", both: "مدمج" },
		input: "يقول العميل إن إجمالي الفاتورة خاطئ.",
		presetPrompt: "أنت تفرز تذاكر الدعم. أجب بفئة وملخص من سطر واحد.",
		ownPrompt: "أجب بالفرنسية.",
	},
};

export const presetMergeText = (locale) => {
	const localized = presetMergeLocales[locale] ?? {};
	return {
		...presetMergeLabels,
		...localized,
		toggles: { ...presetMergeLabels.toggles, ...localized.toggles },
		fields: { ...presetMergeLabels.fields, ...localized.fields },
		legend: { ...presetMergeLabels.legend, ...localized.legend },
	};
};

export const presetMergeLines = (on, text) => {
	const q = (value) => JSON.stringify(value);
	const request = [{ text: "{", from: null }, { text: `  "model": "@support-triage",`, from: "request" }];
	if (on.instructions) request.push({ text: `  "instructions": ${q(text.ownPrompt)},`, from: "request" });
	if (on.temperature) request.push({ text: `  "temperature": 0.9,`, from: "request" });
	if (on.order) request.push({ text: `  "provider": { "order": ["google-vertex"] },`, from: "request" });
	request.push({ text: `  "input": ${q(text.input)}`, from: "request" }, { text: "}", from: null });

	const preset = [
		{ text: `${text.fields.model}  anthropic/claude-sonnet-5.5`, from: "preset" },
		{ text: `${text.fields.prompt}  ${text.presetPrompt}`, from: "preset", wrap: true },
		{ text: `${text.fields.params}  temperature 0.2, max_output_tokens 300`, from: "preset", wrap: true },
		{ text: `${text.fields.order}  anthropic, google-vertex`, from: "preset" },
	];

	const prompt = on.instructions ? `${text.presetPrompt}\n\n${text.ownPrompt}` : text.presetPrompt;
	const merged = [
		{ text: "{", from: null },
		{ text: `  "model": "anthropic/claude-sonnet-5.5",`, from: "preset" },
		{ text: `  "instructions": ${q(prompt)},`, from: on.instructions ? "both" : "preset" },
		{ text: `  "temperature": ${on.temperature ? "0.9" : "0.2"},`, from: on.temperature ? "request" : "preset" },
		{ text: `  "max_output_tokens": 300,`, from: "preset" },
		{
			text: `  "provider": { "order": ${on.order ? '["google-vertex"]' : '["anthropic", "google-vertex"]'} },`,
			from: on.order ? "request" : "preset",
		},
		{ text: `  "input": ${q(text.input)}`, from: "request" },
		{ text: "}", from: null },
	];
	return { request, preset, merged };
};

const PresetMergeCode = ({ title, lines, settings }) => (
	<div className="ph-pm-panel">
		<div className="ph-pm-title">{title}</div>
		<pre className={settings ? "ph-pm-code ph-pm-settings" : "ph-pm-code"}>
			{lines.map((line, index) => (
				<span key={index} className={line.from ? `ph-pm-line ph-pm-${line.from}` : "ph-pm-line"}>
					{line.text}
					{"\n"}
				</span>
			))}
		</pre>
	</div>
);

export const PresetMergeExplorer = ({ locale }) => {
	const text = presetMergeText(locale);
	const [on, setOn] = useState({ temperature: true, instructions: false, order: false });
	const lines = presetMergeLines(on, text);
	return (
		<div className="ph-pm">
			<div className="ph-pm-toggles">
				{Object.keys(text.toggles).map((key) => (
					<label key={key}>
						<input type="checkbox" checked={on[key]} onChange={() => setOn({ ...on, [key]: !on[key] })} />
						{text.toggles[key]}
					</label>
				))}
			</div>
			<div className="ph-pm-grid">
				<PresetMergeCode title={text.request} lines={lines.request} />
				<PresetMergeCode title={text.preset} lines={lines.preset} settings />
				<PresetMergeCode title={text.merged} lines={lines.merged} />
			</div>
			<div className="ph-pm-legend" aria-hidden="true">
				{Object.keys(text.legend).map((key) => (
					<span key={key}>
						<i className={`ph-pm-swatch ph-pm-${key}`} />
						{text.legend[key]}
					</span>
				))}
			</div>
		</div>
	);
};
