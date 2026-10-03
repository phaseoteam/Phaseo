import { useState } from "react";
import type { AgentQuestion } from "../../shared/workspace";

function own<T>(values: Record<string, T>, key: string, fallback: T): T { return Object.hasOwn(values, key) ? values[key] : fallback; }

export function QuestionForm({ questions, onAnswer }: { questions: AgentQuestion[]; onAnswer: (answers: Record<string, string[]>) => Promise<boolean> }) {
	const [selected, setSelected] = useState<Record<string, string[]>>({});
	const [custom, setCustom] = useState<Record<string, boolean>>({});
	const [text, setText] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const answers = Object.fromEntries(questions.map(question => [question.id, [...(own(selected, question.id, [])), ...(!question.options?.length || own(custom, question.id, false) ? [own(text, question.id, "")] : [])]]));
	return <form className="task-question" onSubmit={event => { event.preventDefault(); setBusy(true); void onAnswer(answers).finally(() => setBusy(false)); }}>
		{questions.map(question => <fieldset key={question.id}><legend>{question.header}</legend><p>{question.question}</p>{question.options?.map(option => <label className="question-option" key={option.label}><input type={question.multiSelect ? "checkbox" : "radio"} name={question.id} checked={own(selected, question.id, []).includes(option.label)} onChange={event => { const checked = event.target.checked; setSelected(value => ({ ...value, [question.id]: question.multiSelect ? checked ? [...(own(value, question.id, [])), option.label] : (own(value, question.id, [])).filter(label => label !== option.label) : [option.label] })); if (!question.multiSelect) setCustom(value => ({ ...value, [question.id]: false })); }} /><span>{option.label}<small>{option.description}</small>{option.preview && <code className="question-preview">{option.preview}</code>}</span></label>)}
			{question.isOther && question.options?.length ? <label className="question-option"><input type={question.multiSelect ? "checkbox" : "radio"} name={question.id} checked={own(custom, question.id, false) ?? false} onChange={event => { setCustom(value => ({ ...value, [question.id]: event.target.checked })); if (!question.multiSelect) setSelected(value => ({ ...value, [question.id]: [] })); }} />Write an answer</label> : null}
			{!question.options?.length || own(custom, question.id, false) ? <input aria-label={question.question} type={question.isSecret ? "password" : "text"} value={own(text, question.id, "")} onChange={event => setText(value => ({ ...value, [question.id]: event.target.value }))} required autoComplete="off" /> : null}
		</fieldset>)}
		<button type="submit" className="task-primary" disabled={busy || Object.values(answers).some(answer => !answer.length || answer.some(value => !value.trim()))}>Send answers</button>
	</form>;
}
