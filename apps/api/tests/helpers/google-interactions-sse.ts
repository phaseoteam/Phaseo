// Test helper: the server-sent events Google's Interactions API streams for a finished
// interaction, in the shapes its streaming guide documents (step.start, step.delta,
// step.stop, interaction.completed). Function-call arguments stream as arguments_delta
// after a start event with empty arguments; a signature is the last delta of its step.

type InteractionStep = Record<string, any>;

function event(data: Record<string, unknown>): string {
	return `event: ${String(data.event_type)}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function interactionSseEvents(interaction: Record<string, any>): string[] {
	const events: string[] = [
		event({ event_type: "interaction.created", interaction: { id: interaction.id, status: "in_progress", object: "interaction" } }),
	];
	const steps: InteractionStep[] = Array.isArray(interaction.steps) ? interaction.steps : [];
	steps.forEach((step, index) => {
		if (step.type === "thought") {
			events.push(event({ event_type: "step.start", index, step: { type: "thought" } }));
			for (const summary of Array.isArray(step.summary) ? step.summary : []) {
				events.push(event({ event_type: "step.delta", index, delta: { type: "thought_summary", content: summary } }));
			}
			if (step.signature) events.push(event({ event_type: "step.delta", index, delta: { type: "thought_signature", signature: step.signature } }));
		} else if (step.type === "model_output") {
			events.push(event({ event_type: "step.start", index, step: { type: "model_output" } }));
			for (const block of Array.isArray(step.content) ? step.content : []) {
				events.push(event({ event_type: "step.delta", index, delta: block }));
			}
		} else if (step.type === "function_call") {
			events.push(event({ event_type: "step.start", index, step: { type: "function_call", id: step.id, name: step.name, arguments: {} } }));
			events.push(event({ event_type: "step.delta", index, delta: { type: "arguments_delta", arguments: JSON.stringify(step.arguments ?? {}) } }));
			if (step.signature) events.push(event({ event_type: "step.delta", index, delta: { type: "thought_signature", signature: step.signature } }));
		}
		events.push(event({ event_type: "step.stop", index }));
	});
	const { steps: _steps, ...rest } = interaction;
	events.push(event({ event_type: "interaction.completed", interaction: rest }));
	events.push("event: done\ndata: [DONE]\n\n");
	return events;
}

export function interactionSseResponse(interaction: Record<string, any>): Response {
	return new Response(interactionSseEvents(interaction).join(""), {
		headers: { "Content-Type": "text/event-stream" },
	});
}
