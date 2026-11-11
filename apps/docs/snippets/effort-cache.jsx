// Interactive explainer for changing Claude's reasoning effort mid-conversation.
// The rules mirror apps/api/src/core/claudePerMessageEffort.ts (planClaudePerMessageEffort):
// with the effort entries sent back, the top-level effort stays at the conversation's first
// level and each change becomes a marker after the new user message; without them, the
// change goes to the top level. Cache behaviour was measured on the Claude API on
// 2026-11-11: a top-level change re-processes everything from Claude's first reply onward.
// Every visible string comes from effortCacheLabels; translated pages pass `locale`.

export const effortCacheLevels = ["low", "medium", "high"];

export const effortCacheLabels = {
	caption: "Pick the effort for each request, then select a request to see what Phaseo sends Claude.",
	request: "Request {n}",
	effort: "Effort for request {n}",
	keep: "Send reasoning back unchanged",
	sends: "What Phaseo sends Claude for request {n}",
	topLevel: "Top-level effort",
	user: "Your message {n}",
	assistant: "Claude's reply {n}",
	marker: "Effort marker",
	status: { cached: "Read from cache", again: "Processed again", fresh: "New" },
	verdict: {
		first: "First request: Claude writes the conversation to its cache.",
		marker: "The effort changes to {effort} with a marker after your new message. Everything before it is read from cache.",
		same: "Same effort as the previous request: everything before your new message is read from cache.",
		topLevel: "Without the effort entries, the change goes to the top level. Claude reads only the part before its first reply from cache and processes the rest again.",
	},
	note: "Illustrative: each block stands for one message, not its size. In a long conversation, almost everything sits after Claude's first reply.",
};

export const effortCacheLocales = {
	de: {
		caption: "Wähle den Aufwand für jede Anfrage und dann eine Anfrage, um zu sehen, was Phaseo an Claude sendet.",
		request: "Anfrage {n}",
		effort: "Aufwand für Anfrage {n}",
		keep: "Reasoning unverändert zurücksenden",
		sends: "Was Phaseo bei Anfrage {n} an Claude sendet",
		topLevel: "Aufwand auf oberster Ebene",
		user: "Deine Nachricht {n}",
		assistant: "Claudes Antwort {n}",
		marker: "Aufwandsmarkierung",
		status: {
			cached: "Aus dem Cache gelesen",
			again: "Erneut verarbeitet",
			fresh: "Neu",
		},
		verdict: {
			first: "Erste Anfrage: Claude schreibt die Unterhaltung in seinen Cache.",
			marker: "Der Aufwand wechselt mit einer Markierung nach deiner neuen Nachricht zu {effort}. Alles davor wird aus dem Cache gelesen.",
			same: "Derselbe Aufwand wie bei der vorigen Anfrage: Alles vor deiner neuen Nachricht wird aus dem Cache gelesen.",
			topLevel: "Ohne die Aufwandseinträge geht die Änderung an die oberste Ebene. Claude liest nur den Teil vor seiner ersten Antwort aus dem Cache und verarbeitet den Rest erneut.",
		},
		note: "Zur Veranschaulichung: Jeder Block steht für eine Nachricht, nicht für ihre Größe. In einer langen Unterhaltung liegt fast alles nach Claudes erster Antwort.",
	},
	es: {
		caption: "Elige el esfuerzo de cada solicitud y luego selecciona una solicitud para ver lo que Phaseo envía a Claude.",
		request: "Solicitud {n}",
		effort: "Esfuerzo de la solicitud {n}",
		keep: "Devolver el razonamiento sin cambios",
		sends: "Lo que Phaseo envía a Claude en la solicitud {n}",
		topLevel: "Esfuerzo de nivel superior",
		user: "Tu mensaje {n}",
		assistant: "Respuesta {n} de Claude",
		marker: "Marcador de esfuerzo",
		status: {
			cached: "Leído de la caché",
			again: "Procesado de nuevo",
			fresh: "Nuevo",
		},
		verdict: {
			first: "Primera solicitud: Claude escribe la conversación en su caché.",
			marker: "El esfuerzo cambia a {effort} con un marcador después de tu nuevo mensaje. Todo lo anterior se lee de la caché.",
			same: "Mismo esfuerzo que en la solicitud anterior: todo lo que está antes de tu nuevo mensaje se lee de la caché.",
			topLevel: "Sin las entradas de esfuerzo, el cambio va al nivel superior. Claude solo lee de la caché la parte anterior a su primera respuesta y vuelve a procesar el resto.",
		},
		note: "Ilustrativo: cada bloque representa un mensaje, no su tamaño. En una conversación larga, casi todo está después de la primera respuesta de Claude.",
	},
	fr: {
		caption: "Choisissez l’effort de chaque requête, puis sélectionnez une requête pour voir ce que Phaseo envoie à Claude.",
		request: "Requête {n}",
		effort: "Effort de la requête {n}",
		keep: "Renvoyer le raisonnement inchangé",
		sends: "Ce que Phaseo envoie à Claude pour la requête {n}",
		topLevel: "Effort de premier niveau",
		user: "Votre message {n}",
		assistant: "Réponse {n} de Claude",
		marker: "Marqueur d’effort",
		status: {
			cached: "Lu depuis le cache",
			again: "Retraité",
			fresh: "Nouveau",
		},
		verdict: {
			first: "Première requête : Claude écrit la conversation dans son cache.",
			marker: "L’effort passe à {effort} avec un marqueur après votre nouveau message. Tout ce qui précède est lu depuis le cache.",
			same: "Même effort que la requête précédente : tout ce qui précède votre nouveau message est lu depuis le cache.",
			topLevel: "Sans les entrées d’effort, le changement passe au premier niveau. Claude ne lit depuis le cache que la partie qui précède sa première réponse et retraite le reste.",
		},
		note: "Illustratif : chaque bloc représente un message, pas sa taille. Dans une longue conversation, presque tout se trouve après la première réponse de Claude.",
	},
	"pt-BR": {
		caption: "Escolha o esforço de cada solicitação e depois selecione uma solicitação para ver o que o Phaseo envia ao Claude.",
		request: "Solicitação {n}",
		effort: "Esforço da solicitação {n}",
		keep: "Enviar o raciocínio de volta sem alterações",
		sends: "O que o Phaseo envia ao Claude na solicitação {n}",
		topLevel: "Esforço de nível superior",
		user: "Sua mensagem {n}",
		assistant: "Resposta {n} do Claude",
		marker: "Marcador de esforço",
		status: {
			cached: "Lido do cache",
			again: "Processado de novo",
			fresh: "Novo",
		},
		verdict: {
			first: "Primeira solicitação: o Claude grava a conversa no cache dele.",
			marker: "O esforço muda para {effort} com um marcador depois da sua nova mensagem. Tudo o que vem antes é lido do cache.",
			same: "Mesmo esforço da solicitação anterior: tudo o que vem antes da sua nova mensagem é lido do cache.",
			topLevel: "Sem as entradas de esforço, a mudança vai para o nível superior. O Claude lê do cache apenas a parte anterior à primeira resposta dele e processa o resto de novo.",
		},
		note: "Ilustrativo: cada bloco representa uma mensagem, não o tamanho dela. Em uma conversa longa, quase tudo fica depois da primeira resposta do Claude.",
	},
	ja: {
		caption: "各リクエストの度合いを選んでから、リクエストを選択すると Phaseo が Claude に送る内容を確認できます。",
		request: "リクエスト {n}",
		effort: "リクエスト {n} の度合い",
		keep: "推論を変更せずに送り返す",
		sends: "リクエスト {n} で Phaseo が Claude に送る内容",
		topLevel: "トップレベルの度合い",
		user: "あなたのメッセージ {n}",
		assistant: "Claude の返信 {n}",
		marker: "度合いマーカー",
		status: {
			cached: "キャッシュから読み取り",
			again: "もう一度処理",
			fresh: "新規",
		},
		verdict: {
			first: "最初のリクエスト：Claude は会話をキャッシュに書き込みます。",
			marker: "新しいメッセージの後のマーカーで、度合いが {effort} に変わります。それより前の部分はすべてキャッシュから読み取られます。",
			same: "前のリクエストと同じ度合い：新しいメッセージより前の部分はすべてキャッシュから読み取られます。",
			topLevel: "度合いエントリーがないと、変更はトップレベルに送られます。Claude は最初の返信より前の部分だけをキャッシュから読み取り、残りをもう一度処理します。",
		},
		note: "説明用の例です。各ブロックは 1 つのメッセージを表し、そのサイズは表していません。長い会話では、ほぼすべてが Claude の最初の返信より後にあります。",
	},
	"zh-Hans": {
		caption: "为每个请求选择强度，然后选择一个请求，查看 Phaseo 发送给 Claude 的内容。",
		request: "请求 {n}",
		effort: "请求 {n} 的强度",
		keep: "原样发回推理内容",
		sends: "Phaseo 为请求 {n} 发送给 Claude 的内容",
		topLevel: "顶层强度",
		user: "你的消息 {n}",
		assistant: "Claude 的回复 {n}",
		marker: "强度标记",
		status: {
			cached: "从缓存读取",
			again: "重新处理",
			fresh: "新内容",
		},
		verdict: {
			first: "第一个请求：Claude 将对话写入其缓存。",
			marker: "强度通过你的新消息之后的一个标记改为 {effort}。标记之前的所有内容都从缓存读取。",
			same: "与上一个请求的强度相同：你的新消息之前的所有内容都从缓存读取。",
			topLevel: "没有强度条目时，更改会作为顶层强度发送。Claude 只从缓存读取其第一条回复之前的部分，并重新处理其余内容。",
		},
		note: "仅作示意：每个方块代表一条消息，而不代表其大小。在较长的对话中，几乎所有内容都位于 Claude 的第一条回复之后。",
	},
	hi: {
		caption: "हर अनुरोध के लिए प्रयास चुनें, फिर कोई अनुरोध चुनकर देखें कि Phaseo Claude को क्या भेजता है।",
		request: "अनुरोध {n}",
		effort: "अनुरोध {n} के लिए प्रयास",
		keep: "रीज़निंग बिना बदले वापस भेजें",
		sends: "अनुरोध {n} के लिए Phaseo Claude को क्या भेजता है",
		topLevel: "टॉप-लेवल प्रयास",
		user: "आपका संदेश {n}",
		assistant: "Claude का जवाब {n}",
		marker: "प्रयास मार्कर",
		status: {
			cached: "कैश से पढ़ा गया",
			again: "दोबारा प्रोसेस किया गया",
			fresh: "नया",
		},
		verdict: {
			first: "पहला अनुरोध: Claude बातचीत को अपने कैश में लिखता है।",
			marker: "आपके नए संदेश के बाद एक मार्कर से प्रयास {effort} में बदल जाता है। उससे पहले का सब कुछ कैश से पढ़ा जाता है।",
			same: "पिछले अनुरोध जैसा ही प्रयास: आपके नए संदेश से पहले का सब कुछ कैश से पढ़ा जाता है।",
			topLevel: "प्रयास प्रविष्टियों के बिना, बदलाव टॉप-लेवल पर जाता है। Claude कैश से सिर्फ़ अपने पहले जवाब से पहले का हिस्सा पढ़ता है और बाकी को दोबारा प्रोसेस करता है।",
		},
		note: "उदाहरण के लिए: हर ब्लॉक एक संदेश को दर्शाता है, उसके आकार को नहीं। लंबी बातचीत में लगभग सब कुछ Claude के पहले जवाब के बाद होता है।",
	},
	ar: {
		caption: "اختر الجهد لكل طلب، ثم اختر طلبًا لترى ما يرسله Phaseo إلى Claude.",
		request: "الطلب {n}",
		effort: "الجهد للطلب {n}",
		keep: "أعد إرسال الاستدلال دون تغيير",
		sends: "ما يرسله Phaseo إلى Claude في الطلب {n}",
		topLevel: "الجهد في المستوى الأعلى",
		user: "رسالتك {n}",
		assistant: "رد Claude {n}",
		marker: "علامة الجهد",
		status: {
			cached: "مقروء من الذاكرة المؤقتة",
			again: "معالَج من جديد",
			fresh: "جديد",
		},
		verdict: {
			first: "الطلب الأول: يكتب Claude المحادثة في ذاكرته المؤقتة.",
			marker: "يتغير الجهد إلى {effort} بعلامة بعد رسالتك الجديدة. يُقرأ كل ما قبلها من الذاكرة المؤقتة.",
			same: "الجهد نفسه كما في الطلب السابق: يُقرأ كل ما قبل رسالتك الجديدة من الذاكرة المؤقتة.",
			topLevel: "من دون إدخالات الجهد، يذهب التغيير إلى المستوى الأعلى. لا يقرأ Claude من الذاكرة المؤقتة إلا الجزء الذي يسبق رده الأول، ويعالج الباقي من جديد.",
		},
		note: "للتوضيح فقط: تمثّل كل كتلة رسالة واحدة، لا حجمها. في المحادثة الطويلة، يقع كل شيء تقريبًا بعد رد Claude الأول.",
	},
};

export const effortCacheText = (locale) => {
	const localized = effortCacheLocales[locale] ?? {};
	return {
		...effortCacheLabels,
		...localized,
		status: { ...effortCacheLabels.status, ...localized.status },
		verdict: { ...effortCacheLabels.verdict, ...localized.verdict },
	};
};

// The messages Phaseo sends Claude for request `index` (0-based), each with its cache status.
export const effortCachePlan = (efforts, index, keep) => {
	const items = [];
	let inForce = efforts[0];
	for (let turn = 0; turn <= index; turn++) {
		items.push({ kind: "user", n: turn + 1, turn });
		if (keep && turn > 0 && efforts[turn] !== inForce) {
			items.push({ kind: "marker", effort: efforts[turn], turn });
			inForce = efforts[turn];
		}
		if (turn < index) items.push({ kind: "assistant", n: turn + 1, turn });
	}
	const changed = index > 0 && efforts[index] !== efforts[index - 1];
	const topLevel = keep ? efforts[0] : efforts[index];
	const restarted = !keep && changed;
	for (const item of items) {
		if (index === 0 || item.turn === index) item.status = "fresh";
		else if (restarted && !(item.kind === "user" && item.turn === 0)) item.status = "again";
		else item.status = "cached";
	}
	const verdict = index === 0 ? "first" : restarted ? "topLevel" : keep && items.some((item) => item.kind === "marker" && item.turn === index) ? "marker" : "same";
	return { items, topLevel, verdict };
};

export const EffortCacheExplorer = ({ locale }) => {
	const text = effortCacheText(locale);
	const [efforts, setEfforts] = useState(["high", "high", "low", "low", "high"]);
	const [keep, setKeep] = useState(true);
	const [selected, setSelected] = useState(2);
	const plan = effortCachePlan(efforts, selected, keep);
	const fill = (template, values) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, value), template);
	const setEffort = (index, value) => setEfforts(efforts.map((current, i) => (i === index ? value : current)));
	const label = (item) => item.kind === "user" ? fill(text.user, { n: item.n }) : item.kind === "assistant" ? fill(text.assistant, { n: item.n }) : text.marker;
	return (
		<div className="ph-ec not-prose">
			<p className="ph-ec-caption">{text.caption}</p>
			<div className="ph-ec-turns" role="tablist">
				{efforts.map((effort, index) => (
					<div key={index} className={`ph-ec-turn${index === selected ? " ph-ec-on" : ""}`}>
						<button type="button" role="tab" aria-selected={index === selected} onClick={() => setSelected(index)}>
							{fill(text.request, { n: index + 1 })}
						</button>
						<select aria-label={fill(text.effort, { n: index + 1 })} value={effort} onChange={(event) => setEffort(index, event.target.value)}>
							{effortCacheLevels.map((level) => <option key={level} value={level}>{level}</option>)}
						</select>
					</div>
				))}
			</div>
			<label className="ph-ec-keep">
				<input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />
				{text.keep}
			</label>
			<div className="ph-ec-panel" aria-live="polite">
				<div className="ph-ec-head">
					<span>{fill(text.sends, { n: selected + 1 })}</span>
					<span>{text.topLevel}: <code>"{plan.topLevel}"</code></span>
				</div>
				<ol className="ph-ec-items">
					{plan.items.map((item, index) => (
						<li key={index} className={`ph-ec-item ph-ec-${item.kind} ph-ec-${item.status}`}>
							<span className="ph-ec-label">
								{label(item)}
								{item.kind === "marker" ? <code>{`{"role":"system","content":[],"output_config":{"effort":"${item.effort}"}}`}</code> : null}
							</span>
							<span className="ph-ec-status">{text.status[item.status]}</span>
						</li>
					))}
				</ol>
				<p className={`ph-ec-verdict ph-ec-verdict-${plan.verdict}`}>{fill(text.verdict[plan.verdict], { effort: efforts[selected] })}</p>
			</div>
			<p className="ph-ec-note">{text.note}</p>
		</div>
	);
};
