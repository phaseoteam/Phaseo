import { useState } from "react";
import type { AgentQuestion } from "../../shared/workspace";

export function QuestionForm({ questions, onAnswer }: { questions: AgentQuestion[]; onAnswer: (answers: Record<string, string[]>) => Promise<boolean> }) {
	const [selected, setSelected] = useState<Record<string, string[]>>({});
	const [custom, setCustom] = useState<Record<string, boolean>>({});
	const [text, setText] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const answers = Object.fromEntries(questions.map(question => [question.id, [...(selected[question.id] ?? []), ...(!question.options?.length || custom[question.id] ? [text[question.id] ?? ""] : [])]]));
	return <form className="task-question" onSubmit={event => { event.preventDefault(); setBusy(true); void onAnswer(answers).finally(() => setBusy(false)); }}>
		{questions.map(question => <fieldset key={question.id}><legend>{question.header}</legend><p>{question.question}</p>{question.options?.map(option => <label className="question-option" key={option.label}><input type={question.multiSelect ? "checkbox" : "radio"} name={question.id} checked={selected[question.id]?.includes(option.label) ?? false} onChange={event => { const checked = event.target.checked; setSelected(value => ({ ...value, [question.id]: question.multiSelect ? checked ? [...(value[question.id] ?? []), option.label] : (value[question.id] ?? []).filter(label => label !== option.label) : [option.label] })); if (!question.multiSelect) setCustom(value => ({ ...value, [question.id]: false })); }} /><span>{option.label}<small>{option.description}</small></span></label>)}
			{question.isOther && question.options?.length ? <label className="question-option"><input type={question.multiSelect ? "checkbox" : "radio"} name={question.id} checked={custom[question.id] ?? false} onChange={event => { setCustom(value => ({ ...value, [question.id]: event.target.checked })); if (!question.multiSelect) setSelected(value => ({ ...value, [question.id]: [] })); }} />Write an answer</label> : null}
			{!question.options?.length || custom[question.id] ? <input aria-label={question.question} type={question.isSecret ? "password" : "text"} value={text[question.id] ?? ""} onChange={event => setText(value => ({ ...value, [question.id]: event.target.value }))} required autoComplete="off" /> : null}
		</fieldset>)}
		<button type="submit" className="task-primary" disabled={busy || Object.values(answers).some(answer => !answer.length || answer.some(value => !value.trim()))}>Send answers</button>
	</form>;
}
