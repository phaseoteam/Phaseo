import type { LearnCourse } from "../../types";

export const routingCourse: LearnCourse = {
	slug: "routing-and-presets",
	title: "Controla el enrutamiento y las alternativas",
	summary:
		"Elige qué proveedores atienden tus solicitudes, añade modelos alternativos y guarda ajustes compartidos en un preajuste.",
	level: "developer",
	format: "Cualquier lenguaje",
	prerequisites: ["Haz tu primera solicitud"],
	lessons: [
		{
			slug: "route-across-providers",
			title: "Enruta entre proveedores",
			summary: "Ordena, limita o fija proveedores, e indica modelos alternativos para cuando fallen.",
			minutes: 10,
			body: `La mayoría de los modelos los sirven varios proveedores. En cada solicitud, Phaseo se queda con los proveedores que permiten tus reglas, los ordena y llama al mejor. Si ese proveedor falla, prueba con el siguiente. El orden predeterminado, \`balanced\`, tiene en cuenta el coste por respuesta correcta.

Ajusta este comportamiento con el objeto \`provider\` (también se acepta \`routing\` como alias):

\`\`\`json
{
  "model": "openai/gpt-5.6-luna",
  "input": "Summarize this changelog.",
  "provider": {
    "order": ["openai", "azure"],
    "sort": "latency",
    "require_zero_data_retention": true
  }
}
\`\`\`

- \`order\` fija un orden preferido; \`only\` e \`ignore\` permiten o bloquean proveedores.
- \`sort\` ordena por \`price\`, \`latency\` o \`throughput\`. Los sufijos de modelo \`:cheap\`, \`:fast\` y \`:nitro\` hacen lo mismo y tienen prioridad sobre \`sort\`.
- \`max_price\` fija precios máximos; \`required_execution_region\`, \`required_data_region\` y \`require_zero_data_retention\` limitan dónde y cómo se tratan los datos.

Para fijar un proveedor sin alternativa entre proveedores, ponlo delante del ID de modelo: \`baseten:thinking-machines/inkling-small\`. Para enrutar regionalmente toda la solicitud, envía las solicitudes de texto a \`eu.api.phaseo.app\` o a \`us.api.phaseo.app\`.

Para pasar a otros modelos, indícalos en \`models\`. Phaseo prueba primero \`model\` y después cada entrada en orden, pero solo cuando el modelo anterior termina en \`429\`, \`500\`, \`502\`, \`503\` o \`504\`. Errores como \`400\`, \`401\` o \`402\` se devuelven de inmediato. Cada intento se factura como una solicitud propia, y el campo \`model\` de la respuesta indica el modelo que respondió. Un stream solo pasa a una alternativa antes de su primer byte.`,
			quiz: {
				question: "Envías `\"model\": \"openai/gpt-6-astra\"` con `\"models\": [\"anthropic/claude-sonnet-5.5\"]`. El primer modelo devuelve `400 validation_error`. ¿Qué pasa?",
				options: [
					"Phaseo devuelve el 400 de inmediato y no prueba la alternativa",
					"Phaseo reintenta la solicitud con `anthropic/claude-sonnet-5.5`",
					"Phaseo reintenta el mismo modelo con otro proveedor y después la alternativa",
				],
				answer: 0,
				explanation:
					"Los modelos alternativos solo se prueban después de un 429, 500, 502, 503 o 504. Un 400 es un problema de la propia solicitud, así que se devuelve de inmediato; otro modelo también la rechazaría.",
			},
			scenario: {
				prompt:
					"Tu equipo legal dice que los prompts de los clientes solo pueden ir a proveedores con retención de datos cero, y que la aplicación nunca debe usar un proveedor concreto. No quieres fijar un único proveedor. ¿Qué envías?",
				answer:
					"Mantén el ID de modelo sin prefijo para que Phaseo pueda seguir pasando de un proveedor a otro, y añade `\"provider\": { \"require_zero_data_retention\": true, \"ignore\": [\"<provider-id>\"] }`. Fijar con `provider:model` desactivaría la alternativa entre proveedores, que no es lo que quieres.",
			},
			takeaway:
				"Usa `provider` para ordenar y limitar proveedores, un prefijo `provider:` para fijar uno y `models` para pasar a otros modelos cuando haya errores reintentables.",
			links: [
				{ label: "Enrutamiento y alternativas", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
				{ label: "Parámetros de proveedor", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "ID de modelo calificados por proveedor", href: "https://phaseo.app/docs/v1/guides/provider-qualified-models" },
				{ label: "Enrutamiento regional", href: "https://phaseo.app/docs/v1/guides/regional-routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "use-a-preset",
			title: "Usa un preajuste",
			summary: "Guarda un modelo, un prompt y reglas de enrutamiento con un nombre y llámalo desde cualquier aplicación.",
			minutes: 7,
			body: `Un preajuste guarda el modelo, el prompt del sistema, los parámetros y las reglas de proveedor de una tarea con un nombre como \`@support-triage\`. Quien llama envía ese nombre como \`model\` y solo la entrada. Phaseo completa el resto antes de elegir un proveedor. Crea preajustes en **Ajustes -> Preajustes**, o con \`POST /v1/presets\` y una clave de administración.

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "@support-triage",
    "input": "Customer says the invoice total is wrong."
  }'
\`\`\`

No hay un campo \`preset\` aparte. Indica una versión con \`@support-triage@v3\`, o sigue una etiqueta con \`@support-triage@production\`, para poder volver atrás moviendo la etiqueta.

Cuando la solicitud y el preajuste definen lo mismo, estas reglas deciden:

- **Los parámetros rellenan huecos.** Los valores predeterminados de un preajuste solo se aplican a los campos que la solicitud no incluye. Un valor de la solicitud siempre gana.
- **Los prompts del sistema se acumulan.** Primero va el prompt del preajuste y después el de la solicitud.
- **Los ajustes de proveedor de la solicitud ganan.** \`provider.order\` o \`provider.max_price\` en la solicitud sustituyen el valor del preajuste para ese campo.
- **Las listas de permitidos restringen, nunca amplían.** Un modelo que no está entre los modelos permitidos del preajuste falla con \`validation_error\`; no se redirige.`,
			quiz: {
				question: "Tu preajuste fija `temperature` en 0.2. Una solicitud envía `\"model\": \"@support-triage\"` con `\"temperature\": 0.8`. ¿Qué valor se usa?",
				options: [
					"0.2, porque el preajuste bloquea sus parámetros",
					"0.8, porque un valor de la solicitud siempre gana",
					"0.5, porque Phaseo calcula la media de los dos valores",
				],
				answer: 1,
				explanation:
					"Los parámetros predeterminados de un preajuste solo rellenan los campos que la solicitud no incluye. Cuando la solicitud define un valor, gana la solicitud.",
			},
			scenario: {
				prompt:
					"Tres servicios llaman al mismo modelo de soporte con prompts y reglas de proveedor copiados y pegados. Un cambio en el prompt llegó a un servicio pero no a los demás, y ahora las respuestas son distintas. ¿Cómo evitas que vuelva a pasar?",
				answer:
					"Pasa el modelo, el prompt del sistema y las reglas de proveedor compartidos a un único preajuste y haz que todos los servicios envíen `\"model\": \"@support-triage@production\"`. Publica los cambios como versiones nuevas y mueve la etiqueta `production` para desplegarlos, o vuelve a moverla para volver atrás.",
			},
			takeaway:
				"Guarda los ajustes compartidos en un preajuste, llámalo por su nombre en `model` y deja que los valores de la solicitud sustituyan los del preajuste cuando lo necesites.",
			links: [
				{ label: "Preajustes", href: "https://phaseo.app/docs/v1/guides/presets" },
				{ label: "Plantillas de prompt", href: "https://phaseo.app/docs/v1/guides/prompt-templates" },
				{ label: "Enrutamiento y alternativas", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
			],
			updated: "2026-11-17",
		},
	],
};
