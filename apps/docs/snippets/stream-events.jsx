// Interactive explainer for streaming: plays the SSE events each text endpoint sends.
// Event names follow the gateway's golden streams in
// apps/api/src/executors/_shared/text-generate/openai-compat/__tests__/__snapshots__/stream-golden
// and the mid-stream failure cases in stream-midstream-errors.test.ts.
// Every visible string comes from streamEventsLabels; translated pages pass `locale`.

export const streamEventsLabels = {
	endpoints: { responses: "Responses", chat: "Chat Completions", messages: "Messages" },
	outcomes: { ok: "Completes", failed: "Fails partway" },
	play: "Play",
	replay: "Replay",
	step: "Step",
	events: "Events received",
	output: "What your UI shows",
	waiting: "Press Play to start the stream.",
	kinds: { open: "Opens the stream", delta: "Text delta", close: "Successful end", error: "Failure end" },
	verdict: {
		streaming: "Streaming. Render text as it arrives, but don't mark it complete yet.",
		ok: "Complete. The successful end event arrived, so the answer is whole.",
		failed: "Interrupted. The stream ended with a failure event: keep the partial text, mark it interrupted, offer a retry.",
	},
	// The demo answer, one entry per text delta. A failed stream stops after the first three.
	sample: ["Streams ", "arrive ", "a few ", "tokens ", "at a time."],
};

// Endpoint names are API names, so they stay in English in every locale.
export const streamEventsLocales = {
	es: {
		outcomes: { ok: "Termina bien", failed: "Falla a mitad" },
		play: "Reproducir",
		replay: "Repetir",
		step: "Paso",
		events: "Eventos recibidos",
		output: "Lo que muestra tu interfaz",
		waiting: "Pulsa Reproducir para iniciar el stream.",
		kinds: { open: "Abre el stream", delta: "Delta de texto", close: "Final correcto", error: "Final con fallo" },
		verdict: {
			streaming: "Transmitiendo. Muestra el texto a medida que llega, pero no lo marques todavía como completo.",
			ok: "Completo. Llegó el evento de final correcto, así que la respuesta está entera.",
			failed: "Interrumpido. El stream terminó con un evento de fallo: conserva el texto parcial, márcalo como interrumpido y ofrece reintentar.",
		},
		sample: ["Los streams ", "llegan ", "con unos pocos ", "tokens ", "cada vez."],
	},
	fr: {
		outcomes: { ok: "Se termine", failed: "Échoue en cours" },
		play: "Lecture",
		replay: "Rejouer",
		step: "Étape",
		events: "Événements reçus",
		output: "Ce qu’affiche votre interface",
		waiting: "Appuyez sur Lecture pour démarrer le flux.",
		kinds: { open: "Ouvre le flux", delta: "Delta de texte", close: "Fin réussie", error: "Fin en échec" },
		verdict: {
			streaming: "Streaming en cours. Affichez le texte au fur et à mesure, mais ne le marquez pas encore comme terminé.",
			ok: "Terminé. L’événement de fin réussie est arrivé : la réponse est complète.",
			failed: "Interrompu. Le flux s’est terminé par un événement d’échec : conservez le texte partiel, marquez-le comme interrompu et proposez de réessayer.",
		},
		sample: ["Les flux ", "arrivent ", "quelques ", "tokens ", "à la fois."],
	},
	de: {
		outcomes: { ok: "Wird abgeschlossen", failed: "Bricht mittendrin ab" },
		play: "Abspielen",
		replay: "Erneut abspielen",
		step: "Schritt",
		events: "Empfangene Events",
		output: "Was deine UI anzeigt",
		waiting: "Drücke Abspielen, um den Stream zu starten.",
		kinds: { open: "Öffnet den Stream", delta: "Text-Delta", close: "Erfolgreiches Ende", error: "Ende mit Fehler" },
		verdict: {
			streaming: "Streaming läuft. Zeige den Text an, sobald er ankommt, aber markiere ihn noch nicht als vollständig.",
			ok: "Vollständig. Das Event für ein erfolgreiches Ende ist angekommen, die Antwort ist also komplett.",
			failed: "Unterbrochen. Der Stream endete mit einem Fehler-Event: Behalte den Teiltext, markiere ihn als unterbrochen und biete einen neuen Versuch an.",
		},
		sample: ["Streams ", "liefern ", "jeweils ", "ein paar ", "Tokens."],
	},
	"pt-BR": {
		outcomes: { ok: "Conclui", failed: "Falha no meio" },
		play: "Reproduzir",
		replay: "Repetir",
		step: "Avançar",
		events: "Eventos recebidos",
		output: "O que sua interface mostra",
		waiting: "Pressione Reproduzir para iniciar o stream.",
		kinds: { open: "Abre o stream", delta: "Delta de texto", close: "Fim com sucesso", error: "Fim com falha" },
		verdict: {
			streaming: "Transmitindo. Exiba o texto conforme ele chega, mas ainda não o marque como completo.",
			ok: "Completo. O evento de fim com sucesso chegou, então a resposta está inteira.",
			failed: "Interrompido. O stream terminou com um evento de falha: mantenha o texto parcial, marque-o como interrompido e ofereça uma nova tentativa.",
		},
		sample: ["Streams ", "chegam ", "com alguns ", "tokens ", "por vez."],
	},
	ja: {
		outcomes: { ok: "正常に完了", failed: "途中で失敗" },
		play: "再生",
		replay: "もう一度再生",
		step: "1 ステップ",
		events: "受信したイベント",
		output: "UI に表示される内容",
		waiting: "「再生」を押すとストリームが始まります。",
		kinds: { open: "ストリームを開始", delta: "テキストの差分", close: "正常終了", error: "失敗で終了" },
		verdict: {
			streaming: "ストリーミング中です。届いたテキストは順に表示してください。ただし、まだ完了扱いにはしないでください。",
			ok: "完了しました。正常終了のイベントが届いたので、回答は欠けていません。",
			failed: "中断されました。ストリームは失敗イベントで終了しました。途中までのテキストは残し、中断済みと表示して、再試行できるようにしてください。",
		},
		sample: ["ストリームでは", "トークンが", "数個ずつ", "まとめて", "届きます。"],
	},
	"zh-Hans": {
		outcomes: { ok: "正常完成", failed: "中途失败" },
		play: "播放",
		replay: "重播",
		step: "单步",
		events: "收到的事件",
		output: "你的界面显示的内容",
		waiting: "点击播放，开始流式传输。",
		kinds: { open: "打开流", delta: "文本增量", close: "成功结束", error: "失败结束" },
		verdict: {
			streaming: "流式传输中。文本到达时就显示出来，但先不要标记为完成。",
			ok: "已完成。成功结束事件已到达，因此回答是完整的。",
			failed: "已中断。流以失败事件结束：保留已收到的部分文本，标记为已中断，并提供重试。",
		},
		sample: ["流式响应", "每次", "只会送来", "几个 ", "token。"],
	},
	hi: {
		outcomes: { ok: "पूरा होता है", failed: "बीच में विफल" },
		play: "चलाएँ",
		replay: "फिर से चलाएँ",
		step: "एक कदम",
		events: "प्राप्त इवेंट",
		output: "आपका UI क्या दिखाता है",
		waiting: "स्ट्रीम शुरू करने के लिए चलाएँ दबाएँ।",
		kinds: { open: "स्ट्रीम खोलता है", delta: "टेक्स्ट डेल्टा", close: "सफल अंत", error: "विफल अंत" },
		verdict: {
			streaming: "स्ट्रीमिंग जारी है। टेक्स्ट आते ही दिखाएँ, लेकिन अभी उसे पूरा चिह्नित न करें।",
			ok: "पूरा हुआ। सफल अंत वाला इवेंट आ गया, इसलिए प्रतिक्रिया पूरी है।",
			failed: "बाधित। स्ट्रीम विफलता वाले इवेंट के साथ समाप्त हुई: आंशिक टेक्स्ट रखें, उसे बाधित चिह्नित करें और दोबारा प्रयास का विकल्प दें।",
		},
		sample: ["स्ट्रीम में ", "टोकन ", "एक बार में ", "थोड़े-थोड़े ", "आते हैं।"],
	},
	ar: {
		outcomes: { ok: "يكتمل", failed: "يفشل في المنتصف" },
		play: "تشغيل",
		replay: "إعادة التشغيل",
		step: "خطوة",
		events: "الأحداث المستلمة",
		output: "ما تعرضه واجهتك",
		waiting: "اضغط تشغيل لبدء البث.",
		kinds: { open: "يفتح البث", delta: "جزء نصي", close: "نهاية ناجحة", error: "نهاية بالفشل" },
		verdict: {
			streaming: "البث جارٍ. اعرض النص فور وصوله، لكن لا تعلّمه مكتملًا بعد.",
			ok: "مكتمل. وصل حدث النهاية الناجحة، لذا فالإجابة كاملة.",
			failed: "متوقف. انتهى البث بحدث فشل: احتفظ بالنص الجزئي، وعلّمه بأنه متوقف، واعرض إعادة المحاولة.",
		},
		sample: ["يصل ", "البث ", "على دفعات ", "من بضعة رموز ", "في كل مرة."],
	},
};

export const streamEventsScripts = {
	responses: {
		open: ["response.created", "response.output_item.added", "response.content_part.added"],
		delta: "response.output_text.delta",
		close: ["response.output_text.done", "response.content_part.done", "response.output_item.done", "response.completed"],
		error: ["response.failed"],
	},
	chat: {
		open: ['choices[0].delta.role = "assistant"'],
		delta: "choices[0].delta.content",
		close: ['choices[0].finish_reason = "stop"', "[DONE]"],
		error: ['{ "error": { "type": "server_error" } }'],
	},
	messages: {
		open: ["message_start", "content_block_start"],
		delta: "content_block_delta",
		close: ["content_block_stop", "message_delta", "message_stop"],
		error: ['error { "type": "api_error" }'],
	},
};

export const streamEventsSequence = (endpoint, outcome, sample = streamEventsLabels.sample) => {
	const script = streamEventsScripts[endpoint];
	const parts = outcome === "failed" ? sample.slice(0, 3) : sample;
	return [
		...script.open.map((name) => ({ name, kind: "open" })),
		...parts.map((text) => ({ name: script.delta, kind: "delta", text })),
		...(outcome === "failed" ? script.error : script.close).map((name) => ({
			name,
			kind: outcome === "failed" ? "error" : "close",
		})),
	];
};

export const streamEventsText = (locale) => {
	const localized = streamEventsLocales[locale] ?? {};
	return {
		...streamEventsLabels,
		...localized,
		endpoints: { ...streamEventsLabels.endpoints, ...localized.endpoints },
		outcomes: { ...streamEventsLabels.outcomes, ...localized.outcomes },
		kinds: { ...streamEventsLabels.kinds, ...localized.kinds },
		verdict: { ...streamEventsLabels.verdict, ...localized.verdict },
	};
};

export const StreamEventsExplorer = ({ locale }) => {
	const text = streamEventsText(locale);
	const [endpoint, setEndpoint] = useState("responses");
	const [outcome, setOutcome] = useState("ok");
	const [shown, setShown] = useState(0);
	const [playing, setPlaying] = useState(false);
	const sequence = streamEventsSequence(endpoint, outcome, text.sample);
	const done = shown >= sequence.length;

	useEffect(() => {
		if (!playing) return undefined;
		if (shown >= sequence.length) {
			setPlaying(false);
			return undefined;
		}
		const timer = setTimeout(() => setShown((n) => n + 1), sequence[shown]?.kind === "delta" ? 260 : 420);
		return () => clearTimeout(timer);
	}, [playing, shown, sequence.length]);

	const reset = (nextEndpoint, nextOutcome) => {
		setEndpoint(nextEndpoint);
		setOutcome(nextOutcome);
		setShown(0);
		setPlaying(false);
	};
	const visible = sequence.slice(0, shown);
	const output = visible.filter((e) => e.kind === "delta").map((e) => e.text).join("");
	const last = visible[visible.length - 1];
	const verdict = !last ? null : done && last.kind === "close" ? "ok" : last.kind === "error" ? "failed" : "streaming";

	return (
		<div className="ph-se">
			<div className="ph-se-bar">
				<div className="ph-se-tabs" role="tablist">
					{Object.keys(streamEventsScripts).map((key) => (
						<button key={key} type="button" role="tab" aria-selected={endpoint === key} className={endpoint === key ? "ph-se-on" : ""} onClick={() => reset(key, outcome)}>
							{text.endpoints[key]}
						</button>
					))}
				</div>
				<div className="ph-se-tabs" role="tablist">
					{["ok", "failed"].map((key) => (
						<button key={key} type="button" role="tab" aria-selected={outcome === key} className={outcome === key ? "ph-se-on" : ""} onClick={() => reset(endpoint, key)}>
							{text.outcomes[key]}
						</button>
					))}
				</div>
			</div>
			<div className="ph-se-grid">
				<div className="ph-se-panel">
					<div className="ph-se-head">
						<span>{text.events}</span>
						<span className="ph-se-actions">
							<button type="button" disabled={done} onClick={() => setShown((n) => Math.min(n + 1, sequence.length))}>
								{text.step}
							</button>
							<button
								type="button"
								className="ph-se-primary"
								onClick={() => {
									if (done) setShown(0);
									setPlaying(true);
								}}
							>
								{done ? text.replay : text.play}
							</button>
						</span>
					</div>
					<ol className="ph-se-events">
						{visible.length === 0 ? <li className="ph-se-empty">{text.waiting}</li> : null}
						{visible.map((event, index) => (
							<li key={`${event.name}-${index}`} className={`ph-se-${event.kind}`}>
								<i aria-hidden="true" />
								<code>{event.name}</code>
								{event.text ? <span className="ph-se-delta">"{event.text}"</span> : <span className="ph-se-kind">{text.kinds[event.kind]}</span>}
							</li>
						))}
					</ol>
				</div>
				<div className="ph-se-panel">
					<div className="ph-se-head">
						<span>{text.output}</span>
					</div>
					<div className={`ph-se-output${verdict === "failed" ? " ph-se-output-failed" : ""}`}>
						{output}
						{verdict === "streaming" ? <span className="ph-se-caret" aria-hidden="true" /> : null}
					</div>
					{verdict ? <p className={`ph-se-verdict ph-se-verdict-${verdict}`}>{text.verdict[verdict]}</p> : null}
				</div>
			</div>
		</div>
	);
};
