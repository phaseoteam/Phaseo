// Interactive explainer for request-level model fallbacks (`model` + `models`).
// The rules mirror the documented triggers in v1/guides/routing-and-fallbacks.mdx:
// 429, 500, 502, 503, 504 and "no provider serves this model" move to the next model;
// other client errors return immediately.
// Every visible string comes from fallbackChainLabels; translated pages pass `locale`.

export const fallbackChainOutcomes = {
	ok: { status: "200", next: false, success: true },
	bad: { status: "400", next: false },
	payment: { status: "402", next: false },
	limited: { status: "429", next: true },
	unavailable: { status: "503", next: true },
	retired: { status: "410", next: true },
};

export const fallbackChainLabels = {
	models: ["openai/gpt-6-astra", "anthropic/claude-sonnet-5.5", "google/gemini-4-argon"],
	roles: ["model", "models[0]", "models[1]"],
	outcome: "If this model returns",
	outcomes: {
		ok: "200 Success",
		bad: "400 Bad request",
		payment: "402 Insufficient credit",
		limited: "429 Rate limited",
		unavailable: "503 Unavailable",
		retired: "No provider serves it",
	},
	states: { tried: "Tried", skipped: "Not tried" },
	moveOn: "Retryable, try the next model",
	stop: "Not retryable, return it",
	served: "Served",
	result: {
		ok: "You get a 200 from {model}. {attempts} in your request logs.",
		error: "You get the {status} from {model}. {attempts} in your request logs.",
		exhausted: "Every model failed, so you get the last error ({status}). {attempts} in your request logs.",
		one: "1 attempt",
		many: "{n} attempts",
	},
};

// `models` and `roles` are model IDs and field names, so they stay in English in every locale.
export const fallbackChainLocales = {
	es: {
		outcome: "Si este modelo devuelve",
		outcomes: {
			ok: "200 Correcto",
			bad: "400 Solicitud incorrecta",
			payment: "402 Crédito insuficiente",
			limited: "429 Límite de frecuencia",
			unavailable: "503 No disponible",
			retired: "Ningún proveedor lo sirve",
		},
		states: { tried: "Probado", skipped: "No probado" },
		moveOn: "Reintentable: se prueba el siguiente modelo",
		stop: "No reintentable: se devuelve",
		served: "Respondió",
		result: {
			ok: "Recibes un 200 de {model}. {attempts} en tus registros de solicitudes.",
			error: "Recibes el {status} de {model}. {attempts} en tus registros de solicitudes.",
			exhausted: "Todos los modelos fallaron, así que recibes el último error ({status}). {attempts} en tus registros de solicitudes.",
			one: "1 intento",
			many: "{n} intentos",
		},
	},
	fr: {
		outcome: "Si ce modèle renvoie",
		outcomes: {
			ok: "200 Succès",
			bad: "400 Requête invalide",
			payment: "402 Crédit insuffisant",
			limited: "429 Limite de débit atteinte",
			unavailable: "503 Indisponible",
			retired: "Aucun fournisseur ne le sert",
		},
		states: { tried: "Essayé", skipped: "Non essayé" },
		moveOn: "Réessayable : on passe au modèle suivant",
		stop: "Non réessayable : renvoyé tel quel",
		served: "Servi",
		result: {
			ok: "Vous recevez un 200 de {model}. {attempts} dans vos journaux de requêtes.",
			error: "Vous recevez le {status} de {model}. {attempts} dans vos journaux de requêtes.",
			exhausted: "Tous les modèles ont échoué, vous recevez donc la dernière erreur ({status}). {attempts} dans vos journaux de requêtes.",
			one: "1 tentative",
			many: "{n} tentatives",
		},
	},
	de: {
		outcome: "Wenn dieses Modell zurückgibt",
		outcomes: {
			ok: "200 Erfolg",
			bad: "400 Ungültige Anfrage",
			payment: "402 Zu wenig Guthaben",
			limited: "429 Ratenlimit erreicht",
			unavailable: "503 Nicht verfügbar",
			retired: "Kein Anbieter stellt es bereit",
		},
		states: { tried: "Versucht", skipped: "Nicht versucht" },
		moveOn: "Wiederholbar, nächstes Modell wird versucht",
		stop: "Nicht wiederholbar, wird zurückgegeben",
		served: "Beantwortet",
		result: {
			ok: "Du bekommst eine 200 von {model}. {attempts} in deinen Anfrage-Logs.",
			error: "Du bekommst die {status} von {model}. {attempts} in deinen Anfrage-Logs.",
			exhausted: "Alle Modelle sind fehlgeschlagen, also bekommst du den letzten Fehler ({status}). {attempts} in deinen Anfrage-Logs.",
			one: "1 Versuch",
			many: "{n} Versuche",
		},
	},
	"pt-BR": {
		outcome: "Se este modelo retornar",
		outcomes: {
			ok: "200 Sucesso",
			bad: "400 Solicitação inválida",
			payment: "402 Crédito insuficiente",
			limited: "429 Limite de taxa atingido",
			unavailable: "503 Indisponível",
			retired: "Nenhum provedor o atende",
		},
		states: { tried: "Tentado", skipped: "Não tentado" },
		moveOn: "Pode ser repetido, tenta o próximo modelo",
		stop: "Não pode ser repetido, é retornado",
		served: "Atendido",
		result: {
			ok: "Você recebe um 200 de {model}. {attempts} nos seus logs de solicitações.",
			error: "Você recebe o {status} de {model}. {attempts} nos seus logs de solicitações.",
			exhausted: "Todos os modelos falharam, então você recebe o último erro ({status}). {attempts} nos seus logs de solicitações.",
			one: "1 tentativa",
			many: "{n} tentativas",
		},
	},
	ja: {
		outcome: "このモデルが返すレスポンス",
		outcomes: {
			ok: "200 成功",
			bad: "400 不正なリクエスト",
			payment: "402 クレジット不足",
			limited: "429 レート制限",
			unavailable: "503 利用不可",
			retired: "提供するプロバイダーがない",
		},
		states: { tried: "試行済み", skipped: "未試行" },
		moveOn: "再試行可能。次のモデルを試します",
		stop: "再試行不可。そのまま返します",
		served: "応答済み",
		result: {
			ok: "{model} から 200 が返ります。リクエストログには {attempts}が記録されます。",
			error: "{model} から {status} が返ります。リクエストログには {attempts}が記録されます。",
			exhausted: "すべてのモデルが失敗したため、最後のエラー ({status}) が返ります。リクエストログには {attempts}が記録されます。",
			one: "1 回の試行",
			many: "{n} 回の試行",
		},
	},
	"zh-Hans": {
		outcome: "如果此模型返回",
		outcomes: {
			ok: "200 成功",
			bad: "400 请求错误",
			payment: "402 额度不足",
			limited: "429 触发速率限制",
			unavailable: "503 不可用",
			retired: "没有提供商提供该模型",
		},
		states: { tried: "已尝试", skipped: "未尝试" },
		moveOn: "可重试，尝试下一个模型",
		stop: "不可重试，直接返回",
		served: "已响应",
		result: {
			ok: "你会收到 {model} 返回的 200。请求日志中有 {attempts}。",
			error: "你会收到 {model} 返回的 {status}。请求日志中有 {attempts}。",
			exhausted: "所有模型都失败了，因此你会收到最后一个错误（{status}）。请求日志中有 {attempts}。",
			one: "1 次尝试",
			many: "{n} 次尝试",
		},
	},
	hi: {
		outcome: "अगर यह मॉडल लौटाता है",
		outcomes: {
			ok: "200 सफल",
			bad: "400 गलत अनुरोध",
			payment: "402 अपर्याप्त क्रेडिट",
			limited: "429 रेट लिमिट",
			unavailable: "503 उपलब्ध नहीं",
			retired: "कोई प्रदाता इसे नहीं देता",
		},
		states: { tried: "आज़माया गया", skipped: "नहीं आज़माया गया" },
		moveOn: "दोबारा आज़माया जा सकता है, अगला मॉडल आज़माया जाता है",
		stop: "दोबारा नहीं आज़माया जा सकता, यही लौटाया जाता है",
		served: "जवाब दिया",
		result: {
			ok: "आपको {model} से 200 मिलता है। आपके अनुरोध लॉग में {attempts}।",
			error: "आपको {model} से {status} मिलता है। आपके अनुरोध लॉग में {attempts}।",
			exhausted: "हर मॉडल विफल रहा, इसलिए आपको आखिरी त्रुटि ({status}) मिलती है। आपके अनुरोध लॉग में {attempts}।",
			one: "1 प्रयास",
			many: "{n} प्रयास",
		},
	},
	ar: {
		outcome: "إذا أعاد هذا النموذج",
		outcomes: {
			ok: "200 نجاح",
			bad: "400 طلب غير صالح",
			payment: "402 رصيد غير كافٍ",
			limited: "429 تجاوز حد المعدل",
			unavailable: "503 غير متاح",
			retired: "لا يقدّمه أي مزوّد",
		},
		states: { tried: "جُرّب", skipped: "لم يُجرَّب" },
		moveOn: "قابل لإعادة المحاولة، يُجرَّب النموذج التالي",
		stop: "غير قابل لإعادة المحاولة، يُعاد كما هو",
		served: "تمت الخدمة",
		result: {
			ok: "تحصل على 200 من {model}. عدد المحاولات في سجلات طلباتك: {attempts}.",
			error: "تحصل على {status} من {model}. عدد المحاولات في سجلات طلباتك: {attempts}.",
			exhausted: "فشلت جميع النماذج، لذا تحصل على آخر خطأ ({status}). عدد المحاولات في سجلات طلباتك: {attempts}.",
			one: "1",
			many: "{n}",
		},
	},
};

export const fallbackChainText = (locale) => {
	const localized = fallbackChainLocales[locale] ?? {};
	return {
		...fallbackChainLabels,
		...localized,
		outcomes: { ...fallbackChainLabels.outcomes, ...localized.outcomes },
		states: { ...fallbackChainLabels.states, ...localized.states },
		result: { ...fallbackChainLabels.result, ...localized.result },
	};
};

export const fallbackChainRun = (choices) => {
	const steps = [];
	for (const choice of choices) {
		const outcome = fallbackChainOutcomes[choice];
		steps.push({ choice, outcome });
		if (!outcome.next) break;
	}
	return steps;
};

export const FallbackChainExplorer = ({ locale }) => {
	const text = fallbackChainText(locale);
	const [choices, setChoices] = useState(["unavailable", "ok", "ok"]);
	const steps = fallbackChainRun(choices);
	const last = steps[steps.length - 1];
	const lastModel = text.models[steps.length - 1];
	const attempts = steps.length === 1 ? text.result.one : text.result.many.replace("{n}", String(steps.length));
	const fill = (template) =>
		template.replace("{model}", lastModel).replace("{status}", last.outcome.status).replace("{attempts}", attempts);
	const result = last.outcome.success ? fill(text.result.ok) : last.outcome.next ? fill(text.result.exhausted) : fill(text.result.error);

	return (
		<div className="ph-fc">
			<div className="ph-fc-chain">
				{text.models.map((model, index) => {
					const step = steps[index];
					const state = !step ? "skipped" : step.outcome.success ? "served" : "tried";
					return (
						<div key={model} className={`ph-fc-step ph-fc-${state}`}>
							<div className="ph-fc-role">
								<code>{text.roles[index]}</code>
								<span>{state === "served" ? text.served : text.states[state]}</span>
							</div>
							<strong className="ph-fc-model">{model}</strong>
							<label className="ph-fc-select">
								<span>{text.outcome}</span>
								<select
									value={choices[index]}
									disabled={!step}
									onChange={(event) => {
										const next = [...choices];
										next[index] = event.target.value;
										setChoices(next);
									}}
								>
									{Object.keys(fallbackChainOutcomes).map((key) => (
										<option key={key} value={key}>
											{text.outcomes[key]}
										</option>
									))}
								</select>
							</label>
							{step && !step.outcome.success ? (
								<div className={step.outcome.next ? "ph-fc-note ph-fc-next" : "ph-fc-note ph-fc-stop"}>
									{step.outcome.next ? text.moveOn : text.stop}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
			<p className={`ph-fc-result${last.outcome.success ? " ph-fc-result-ok" : ""}`}>{result}</p>
		</div>
	);
};
