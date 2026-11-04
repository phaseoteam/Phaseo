// Interactive explainer for the icons in a model page's provider table. The icons and
// colours mirror apps/web: PROVIDER_STATUS_META (ProviderCard.tsx) and ProviderLiveRouting.tsx.
// Every visible string comes from providerStatusLabels; translated pages pass `locale`.

export const providerStatusIcons = {
	active: { color: "#16a34a", paths: ["m9 12 2 2 4-4"], circle: true },
	lower: { color: "#d97706", paths: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"] },
	disabled: { color: "#dc2626", paths: ["M4.9 4.9 19.1 19.1"], circle: true },
	limited: {
		color: "#ea580c",
		paths: [
			"M10.513 4.856 13.12 2.17a.5.5 0 0 1 .86.46l-1.377 4.317",
			"M15.656 10H20a1 1 0 0 1 .78 1.63l-1.72 1.773",
			"M16.273 16.273 10.88 21.83a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4a1 1 0 0 1-.78-1.63l4.507-4.643",
			"m2 2 20 20",
		],
	},
	recovering: {
		color: "#0ea5e9",
		paths: ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
	},
};

export const ProviderStatusIcon = ({ kind, label }) => {
	const icon = providerStatusIcons[kind];
	return (
		<svg className="ph-ps-icon" viewBox="0 0 24 24" fill="none" stroke={icon.color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
			{icon.circle ? <circle cx="12" cy="12" r="10" /> : null}
			{icon.paths.map((d) => <path key={d} d={d} />)}
		</svg>
	);
};

// Example rows in the default routing order: limited providers sink to the bottom.
export const providerStatusRows = [
	{ key: "active", letter: "A", status: "active", live: null, input: "$0.25", output: "$1.00" },
	{ key: "recovering", letter: "B", status: "active", live: "recovering", input: "$0.30", output: "$1.20" },
	{ key: "lower", letter: "C", status: "lower", live: null, input: "$0.20", output: "$0.90" },
	{ key: "limited", letter: "D", status: "active", live: "limited", input: "$0.18", output: "$0.80" },
	{ key: "both", letter: "E", status: "lower", live: "limited", input: "$0.22", output: "$0.95" },
	{ key: "disabled", letter: "F", status: "disabled", live: null, input: "$0.40", output: "$1.50" },
];

export const providerStatusLabels = {
	caption: "Example provider table. Select a row to see what its icons mean.",
	order: "Rows are in the default routing order, so temporarily limited providers sink to the bottom.",
	provider: "Provider",
	providerName: "Provider {letter}",
	input: "Input $/1M",
	output: "Output $/1M",
	statusIcon: "Status icon",
	liveIcon: "Live routing icon",
	meaning: "What it means",
	routing: "Routing",
	setBy: "Set by",
	byHand: "Phaseo, by hand",
	automatic: "The gateway, automatically",
	bothSources: "Phaseo by hand, and the gateway automatically",
	statuses: { active: "Active", lower: "Lower priority", disabled: "Disabled", limited: "Temporarily limited", recovering: "Recovering" },
	states: {
		active: {
			meaning: "The route is available and healthy.",
			routing: "Routed normally, ranked by price, speed and reliability.",
		},
		recovering: {
			meaning: "A breaker's cooldown has ended. Phaseo is letting a few requests through to check that the provider works again.",
			routing: "Still routable. If a batch of those requests all succeed, routing returns to normal. If half or more fail, the route is limited again with a longer cooldown.",
		},
		lower: { meaning: "Phaseo has made this route a last resort by hand. It stays until Phaseo changes it.", routing: "Used only as a backup: tried after every other healthy provider." },
		limited: {
			meaning: "Requests to this provider failed several times in a row, or at least half of recent requests failed.",
			routing: "Still routable, but other providers are tried first until the cooldown ends.",
		},
		both: {
			meaning: "Both at once: Phaseo had already deprioritised the route, and it is now failing too.",
			routing: "Tried after the other providers.",
		},
		disabled: {
			meaning: "The route is switched off.",
			routing: "Not routed. Live routing icons never appear on disabled routes.",
		},
	},
};

export const providerStatusLocales = {
	de: {
		caption: "Beispiel einer Anbietertabelle. Wähle eine Zeile, um zu sehen, was ihre Symbole bedeuten.",
		order: "Die Zeilen stehen in der Standard-Routing-Reihenfolge, daher rutschen vorübergehend eingeschränkte Anbieter nach unten.",
		provider: "Anbieter",
		providerName: "Anbieter {letter}",
		input: "Input $/1M",
		output: "Output $/1M",
		statusIcon: "Statussymbol",
		liveIcon: "Live-Routing-Symbol",
		meaning: "Bedeutung",
		routing: "Routing",
		setBy: "Festgelegt von",
		byHand: "Phaseo, manuell",
		automatic: "Dem Gateway, automatisch",
		bothSources: "Phaseo manuell und dem Gateway automatisch",
		statuses: { active: "Aktiv", lower: "Niedrigere Priorität", disabled: "Deaktiviert", limited: "Vorübergehend eingeschränkt", recovering: "Erholt sich" },
		states: {
			active: { meaning: "Die Route ist verfügbar und gesund.", routing: "Wird normal geroutet, nach Preis, Geschwindigkeit und Zuverlässigkeit sortiert." },
			recovering: { meaning: "Die Wartezeit eines Breakers ist abgelaufen. Phaseo lässt einige Anfragen durch, um zu prüfen, ob der Anbieter wieder funktioniert.", routing: "Weiterhin routbar. Sind alle Anfragen eines Durchgangs erfolgreich, kehrt das Routing zum Normalzustand zurück. Schlägt die Hälfte oder mehr fehl, wird die Route erneut eingeschränkt, mit längerer Wartezeit." },
			lower: { meaning: "Phaseo hat diese Route manuell zur letzten Reserve gemacht. Das bleibt so, bis Phaseo es ändert.", routing: "Nur als Reserve: Wird nach allen anderen gesunden Anbietern versucht." },
			limited: { meaning: "Anfragen an diesen Anbieter sind mehrmals hintereinander fehlgeschlagen, oder mindestens die Hälfte der letzten Anfragen ist fehlgeschlagen.", routing: "Weiterhin routbar, aber andere Anbieter werden zuerst versucht, bis die Wartezeit abläuft." },
			both: { meaning: "Beides zugleich: Phaseo hatte die Route bereits zurückgestuft, und jetzt schlägt sie zusätzlich fehl.", routing: "Wird nach den anderen Anbietern versucht." },
			disabled: { meaning: "Die Route ist ausgeschaltet.", routing: "Wird nicht geroutet. Live-Routing-Symbole erscheinen nie bei deaktivierten Routen." },
		},
	},
	es: {
		caption: "Ejemplo de tabla de proveedores. Selecciona una fila para ver qué significan sus iconos.",
		order: "Las filas siguen el orden de enrutamiento predeterminado, así que los proveedores limitados temporalmente bajan al final.",
		provider: "Proveedor",
		providerName: "Proveedor {letter}",
		input: "Entrada $/1M",
		output: "Salida $/1M",
		statusIcon: "Icono de estado",
		liveIcon: "Icono de enrutamiento en directo",
		meaning: "Qué significa",
		routing: "Enrutamiento",
		setBy: "Lo establece",
		byHand: "Phaseo, manualmente",
		automatic: "El Gateway, automáticamente",
		bothSources: "Phaseo manualmente y el Gateway automáticamente",
		statuses: { active: "Activo", lower: "Prioridad más baja", disabled: "Deshabilitado", limited: "Limitado temporalmente", recovering: "En recuperación" },
		states: {
			active: { meaning: "La ruta está disponible y en buen estado.", routing: "Se enruta con normalidad, ordenada por precio, velocidad y fiabilidad." },
			recovering: { meaning: "Ha terminado la pausa de un breaker. Phaseo deja pasar algunas solicitudes para comprobar que el proveedor vuelve a funcionar.", routing: "Sigue siendo enrutable. Si todas las de un lote funcionan, el enrutamiento vuelve a la normalidad. Si falla la mitad o más, la ruta vuelve a limitarse con una pausa más larga." },
			lower: { meaning: "Phaseo ha convertido esta ruta en un último recurso manualmente. Se mantiene hasta que Phaseo la cambie.", routing: "Solo como respaldo: se prueba después de todos los demás proveedores en buen estado." },
			limited: { meaning: "Las solicitudes a este proveedor han fallado varias veces seguidas, o al menos la mitad de las solicitudes recientes han fallado.", routing: "Sigue siendo enrutable, pero se prueban primero otros proveedores hasta que termine la pausa." },
			both: { meaning: "Las dos cosas a la vez: Phaseo ya había reducido la prioridad de la ruta y ahora además está fallando.", routing: "Se prueba después de los demás proveedores." },
			disabled: { meaning: "La ruta está desactivada.", routing: "No se enruta. Los iconos de enrutamiento en directo nunca aparecen en rutas deshabilitadas." },
		},
	},
	fr: {
		caption: "Exemple de tableau de fournisseurs. Sélectionnez une ligne pour voir ce que signifient ses icônes.",
		order: "Les lignes suivent l’ordre de routage par défaut : les fournisseurs limités temporairement passent en bas.",
		provider: "Fournisseur",
		providerName: "Fournisseur {letter}",
		input: "Entrée $/1M",
		output: "Sortie $/1M",
		statusIcon: "Icône d’état",
		liveIcon: "Icône de routage en direct",
		meaning: "Signification",
		routing: "Routage",
		setBy: "Défini par",
		byHand: "Phaseo, manuellement",
		automatic: "Le Gateway, automatiquement",
		bothSources: "Phaseo manuellement, et le Gateway automatiquement",
		statuses: { active: "Actif", lower: "Priorité réduite", disabled: "Désactivé", limited: "Limité temporairement", recovering: "Rétablissement en cours" },
		states: {
			active: { meaning: "La route est disponible et saine.", routing: "Routée normalement, classée selon le prix, la vitesse et la fiabilité." },
			recovering: { meaning: "Le délai d’un breaker est écoulé. Phaseo laisse passer quelques requêtes pour vérifier que le fournisseur fonctionne de nouveau.", routing: "Toujours routable. Si toutes les requêtes d’un lot réussissent, le routage redevient normal. Si la moitié ou plus échouent, la route est de nouveau limitée, avec un délai plus long." },
			lower: { meaning: "Phaseo a fait de cette route un dernier recours manuellement. Elle reste ainsi jusqu’à ce que Phaseo la modifie.", routing: "Uniquement en secours : essayée après tous les autres fournisseurs sains." },
			limited: { meaning: "Les requêtes vers ce fournisseur ont échoué plusieurs fois de suite, ou au moins la moitié des requêtes récentes ont échoué.", routing: "Toujours routable, mais les autres fournisseurs sont essayés en premier jusqu’à la fin du délai." },
			both: { meaning: "Les deux à la fois : Phaseo avait déjà réduit la priorité de la route, et elle échoue maintenant aussi.", routing: "Essayée après les autres fournisseurs." },
			disabled: { meaning: "La route est désactivée.", routing: "Pas de routage. Les icônes de routage en direct n’apparaissent jamais sur les routes désactivées." },
		},
	},
	"pt-BR": {
		caption: "Exemplo de tabela de provedores. Selecione uma linha para ver o que os ícones significam.",
		order: "As linhas seguem a ordem de roteamento padrão, então os provedores temporariamente limitados vão para o fim.",
		provider: "Provedor",
		providerName: "Provedor {letter}",
		input: "Entrada $/1M",
		output: "Saída $/1M",
		statusIcon: "Ícone de status",
		liveIcon: "Ícone de roteamento em tempo real",
		meaning: "O que significa",
		routing: "Roteamento",
		setBy: "Definido por",
		byHand: "Phaseo, manualmente",
		automatic: "O Gateway, automaticamente",
		bothSources: "Phaseo manualmente e o Gateway automaticamente",
		statuses: { active: "Ativo", lower: "Prioridade menor", disabled: "Desativado", limited: "Temporariamente limitado", recovering: "Em recuperação" },
		states: {
			active: { meaning: "A rota está disponível e saudável.", routing: "Roteada normalmente, classificada por preço, velocidade e confiabilidade." },
			recovering: { meaning: "A pausa de um breaker terminou. O Phaseo está deixando passar algumas solicitações para verificar se o provedor voltou a funcionar.", routing: "Continua roteável. Se todas as de um lote funcionarem, o roteamento volta ao normal. Se metade ou mais falhar, a rota é limitada de novo, com uma pausa mais longa." },
			lower: { meaning: "O Phaseo tornou esta rota um último recurso manualmente. Isso permanece até o Phaseo mudar.", routing: "Só como reserva: tentada depois de todos os outros provedores saudáveis." },
			limited: { meaning: "As solicitações para este provedor falharam várias vezes seguidas, ou pelo menos metade das solicitações recentes falhou.", routing: "Continua roteável, mas outros provedores são tentados primeiro até a pausa terminar." },
			both: { meaning: "As duas coisas ao mesmo tempo: o Phaseo já tinha rebaixado a rota, e agora ela também está falhando.", routing: "Tentada depois dos outros provedores." },
			disabled: { meaning: "A rota está desligada.", routing: "Não é roteada. Os ícones de roteamento em tempo real nunca aparecem em rotas desativadas." },
		},
	},
	ja: {
		caption: "プロバイダー表の例です。行を選択すると、そのアイコンの意味が表示されます。",
		order: "行は既定のルーティング順に並んでいるため、一時的に制限中のプロバイダーは下に移動します。",
		provider: "プロバイダー",
		providerName: "プロバイダー {letter}",
		input: "入力 $/1M",
		output: "出力 $/1M",
		statusIcon: "ステータスアイコン",
		liveIcon: "ライブルーティングのアイコン",
		meaning: "意味",
		routing: "ルーティング",
		setBy: "設定元",
		byHand: "Phaseo（手動）",
		automatic: "Gateway（自動）",
		bothSources: "Phaseo（手動）と Gateway（自動）",
		statuses: { active: "稼働中", lower: "優先度低", disabled: "無効", limited: "一時的に制限中", recovering: "復旧中" },
		states: {
			active: { meaning: "ルートは利用可能で正常です。", routing: "価格、速度、信頼性に基づいて通常どおりルーティングされます。" },
			recovering: { meaning: "ブレーカーの待機時間が終了しました。Phaseo はプロバイダーが再び動作するかを確認するため、少数のリクエストを通しています。", routing: "引き続きルーティング可能です。1回分のリクエストがすべて成功すると、通常のルーティングに戻ります。半数以上が失敗すると、より長い待機時間で再び制限されます。" },
			lower: { meaning: "Phaseo がこのルートを手動で最終手段に設定しています。Phaseo が変更するまで維持されます。", routing: "バックアップとしてのみ使われます。他のすべての正常なプロバイダーの後に試されます。" },
			limited: { meaning: "このプロバイダーへのリクエストが連続して失敗したか、最近のリクエストの半数以上が失敗しました。", routing: "引き続きルーティング可能ですが、待機時間が終わるまで他のプロバイダーが先に試されます。" },
			both: { meaning: "両方が同時に該当しています。Phaseo がすでに優先度を下げていたルートで、現在エラーも発生しています。", routing: "他のプロバイダーの後に試されます。" },
			disabled: { meaning: "ルートはオフになっています。", routing: "ルーティングされません。無効なルートにライブルーティングのアイコンが表示されることはありません。" },
		},
	},
	"zh-Hans": {
		caption: "提供商表格示例。选择一行即可查看其图标的含义。",
		order: "各行按默认路由顺序排列，因此暂时受限的提供商会排到底部。",
		provider: "提供商",
		providerName: "提供商 {letter}",
		input: "输入 $/1M",
		output: "输出 $/1M",
		statusIcon: "状态图标",
		liveIcon: "实时路由图标",
		meaning: "含义",
		routing: "路由",
		setBy: "设置方",
		byHand: "Phaseo，手动",
		automatic: "Gateway，自动",
		bothSources: "Phaseo 手动设置，Gateway 自动设置",
		statuses: { active: "活跃", lower: "优先级较低", disabled: "已停用", limited: "暂时受限", recovering: "正在恢复" },
		states: {
			active: { meaning: "该路由可用且状态正常。", routing: "正常路由，按价格、速度和可靠性排序。" },
			recovering: { meaning: "熔断器的冷却时间已结束。Phaseo 正在放行少量请求，检查该提供商是否已恢复正常。", routing: "仍可路由。如果一批请求全部成功，路由恢复正常。如果一半或更多失败，该路由会再次受限，冷却时间更长。" },
			lower: { meaning: "Phaseo 已手动将此路由设为最后的备选，在 Phaseo 更改之前会一直保留。", routing: "仅作为备用：在所有其他健康的提供商之后才会尝试。" },
			limited: { meaning: "发往此提供商的请求连续失败多次，或最近至少一半的请求失败。", routing: "仍可路由，但在冷却时间结束前会先尝试其他提供商。" },
			both: { meaning: "两者同时存在：Phaseo 已降低此路由的优先级，现在它又在出错。", routing: "在其他提供商之后才会尝试。" },
			disabled: { meaning: "该路由已关闭。", routing: "不会路由。已停用的路由从不显示实时路由图标。" },
		},
	},
	hi: {
		caption: "प्रदाता तालिका का उदाहरण। किसी पंक्ति को चुनें और देखें कि उसके आइकन का क्या अर्थ है।",
		order: "पंक्तियाँ डिफ़ॉल्ट रूटिंग क्रम में हैं, इसलिए अस्थायी रूप से सीमित प्रदाता नीचे चले जाते हैं।",
		provider: "प्रदाता",
		providerName: "प्रदाता {letter}",
		input: "इनपुट $/1M",
		output: "आउटपुट $/1M",
		statusIcon: "स्टेटस आइकन",
		liveIcon: "लाइव रूटिंग आइकन",
		meaning: "अर्थ",
		routing: "रूटिंग",
		setBy: "किसने सेट किया",
		byHand: "Phaseo, मैन्युअल रूप से",
		automatic: "Gateway, अपने आप",
		bothSources: "Phaseo मैन्युअल रूप से, और Gateway अपने आप",
		statuses: { active: "सक्रिय", lower: "कम प्राथमिकता", disabled: "अक्षम", limited: "अस्थायी रूप से सीमित", recovering: "पुनर्प्राप्त हो रहा है" },
		states: {
			active: { meaning: "रूट उपलब्ध और ठीक है।", routing: "सामान्य रूप से रूट होता है, कीमत, गति और विश्वसनीयता के आधार पर।" },
			recovering: { meaning: "ब्रेकर की प्रतीक्षा अवधि खत्म हो गई है। Phaseo यह जाँचने के लिए कुछ अनुरोध आगे भेज रहा है कि प्रदाता फिर से काम कर रहा है या नहीं।", routing: "अब भी रूट किया जा सकता है। अगर एक समूह के सभी अनुरोध सफल होते हैं, तो रूटिंग सामान्य हो जाती है। अगर आधे या ज़्यादा विफल होते हैं, तो रूट फिर से लंबी प्रतीक्षा अवधि के साथ सीमित हो जाता है।" },
			lower: { meaning: "Phaseo ने इस रूट को मैन्युअल रूप से अंतिम विकल्प बनाया है। यह तब तक बना रहता है जब तक Phaseo इसे नहीं बदलता।", routing: "सिर्फ़ बैकअप के रूप में: बाकी सभी स्वस्थ प्रदाताओं के बाद आज़माया जाता है।" },
			limited: { meaning: "इस प्रदाता को भेजे गए अनुरोध लगातार कई बार विफल हुए, या हाल के कम से कम आधे अनुरोध विफल हुए।", routing: "अब भी रूट किया जा सकता है, लेकिन प्रतीक्षा अवधि खत्म होने तक पहले दूसरे प्रदाता आज़माए जाते हैं।" },
			both: { meaning: "दोनों एक साथ: Phaseo ने इस रूट की प्राथमिकता पहले ही घटा दी थी, और अब यह विफल भी हो रहा है।", routing: "दूसरे प्रदाताओं के बाद आज़माया जाता है।" },
			disabled: { meaning: "रूट बंद है।", routing: "रूट नहीं होता। अक्षम रूट पर लाइव रूटिंग आइकन कभी नहीं दिखते।" },
		},
	},
	ar: {
		caption: "مثال على جدول المزوّدين. اختر صفًا لترى معنى أيقوناته.",
		order: "الصفوف مرتبة بترتيب التوجيه الافتراضي، لذلك ينتقل المزوّدون المقيّدون مؤقتًا إلى الأسفل.",
		provider: "المزوّد",
		providerName: "المزوّد {letter}",
		input: "الإدخال $/1M",
		output: "الإخراج $/1M",
		statusIcon: "أيقونة الحالة",
		liveIcon: "أيقونة التوجيه المباشر",
		meaning: "المعنى",
		routing: "التوجيه",
		setBy: "يحدده",
		byHand: "Phaseo، يدويًا",
		automatic: "الـ Gateway، تلقائيًا",
		bothSources: "Phaseo يدويًا، والـ Gateway تلقائيًا",
		statuses: { active: "نشط", lower: "أولوية أقل", disabled: "معطّل", limited: "مقيّد مؤقتًا", recovering: "قيد الاستعادة" },
		states: {
			active: { meaning: "المسار متاح وسليم.", routing: "يُوجَّه بشكل طبيعي، حسب السعر والسرعة والموثوقية." },
			recovering: { meaning: "انتهت فترة انتظار القاطع. يسمح Phaseo بمرور بعض الطلبات للتحقق من أن المزوّد يعمل مجددًا.", routing: "لا يزال قابلًا للتوجيه. إذا نجحت جميع طلبات الدفعة، يعود التوجيه إلى وضعه الطبيعي. وإذا فشل النصف أو أكثر، يُقيَّد المسار مجددًا بفترة انتظار أطول." },
			lower: { meaning: "جعل Phaseo هذا المسار ملاذًا أخيرًا يدويًا، ويبقى كذلك حتى يغيّره Phaseo.", routing: "كاحتياط فقط: يُجرَّب بعد جميع المزوّدين السليمين الآخرين." },
			limited: { meaning: "فشلت الطلبات إلى هذا المزوّد عدة مرات متتالية، أو فشل نصف الطلبات الأخيرة على الأقل.", routing: "لا يزال قابلًا للتوجيه، لكن تُجرَّب المزوّدات الأخرى أولًا حتى تنتهي فترة الانتظار." },
			both: { meaning: "الأمران معًا: كان Phaseo قد خفّض أولوية المسار، وهو الآن يفشل أيضًا.", routing: "يُجرَّب بعد المزوّدين الآخرين." },
			disabled: { meaning: "المسار متوقف.", routing: "لا يُوجَّه. لا تظهر أيقونات التوجيه المباشر أبدًا على المسارات المعطّلة." },
		},
	},
};

export const providerStatusText = (locale) => {
	const localized = providerStatusLocales[locale] ?? {};
	return {
		...providerStatusLabels,
		...localized,
		statuses: { ...providerStatusLabels.statuses, ...localized.statuses },
		states: { ...providerStatusLabels.states, ...localized.states },
	};
};

export const ProviderStatusExplorer = ({ locale }) => {
	const text = providerStatusText(locale);
	const [selected, setSelected] = useState("limited");
	const row = providerStatusRows.find((candidate) => candidate.key === selected);
	const state = text.states[selected];
	const setBy = row.live && row.status !== "active" ? text.bothSources : row.live ? text.automatic : text.byHand;
	const name = (letter) => text.providerName.replace("{letter}", letter);
	const icons = (candidate) => (
		<>
			<ProviderStatusIcon kind={candidate.status} label={`${text.statusIcon}: ${text.statuses[candidate.status]}`} />
			{candidate.live ? <ProviderStatusIcon kind={candidate.live} label={`${text.liveIcon}: ${text.statuses[candidate.live]}`} /> : null}
		</>
	);
	return (
		<div className="ph-ps not-prose">
			<p className="ph-ps-caption">{text.caption}</p>
			<div className="ph-ps-layout">
				<div className="ph-ps-table" role="listbox" aria-label={text.caption}>
					<div className="ph-ps-head">
						<span>{text.provider}</span>
						<span className="ph-ps-num">{text.input}</span>
						<span className="ph-ps-num">{text.output}</span>
					</div>
					{providerStatusRows.map((candidate) => (
						<button
							key={candidate.key}
							type="button"
							role="option"
							aria-selected={candidate.key === selected}
							className={`ph-ps-row${candidate.key === selected ? " ph-ps-on" : ""}`}
							onClick={() => setSelected(candidate.key)}
						>
							<span className="ph-ps-name">
								<i className={`ph-ps-logo ph-ps-logo-${candidate.letter}`}>{candidate.letter}</i>
								<strong>{name(candidate.letter)}</strong>
								{icons(candidate)}
							</span>
							<span className="ph-ps-num">{candidate.input}</span>
							<span className="ph-ps-num">{candidate.output}</span>
						</button>
					))}
					<p className="ph-ps-order">{text.order}</p>
				</div>
				<div className="ph-ps-card" aria-live="polite">
					<div className="ph-ps-card-title">
						{icons(row)}
						<strong>{[text.statuses[row.status], row.live ? text.statuses[row.live] : null].filter(Boolean).join(" · ")}</strong>
					</div>
					<dl>
						<dt>{text.meaning}</dt>
						<dd>{state.meaning}</dd>
						<dt>{text.routing}</dt>
						<dd>{state.routing}</dd>
						<dt>{text.setBy}</dt>
						<dd>{setBy}</dd>
					</dl>
				</div>
			</div>
		</div>
	);
};
