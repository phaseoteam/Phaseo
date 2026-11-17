import type { LearnCourse } from "../../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "Haz tu primera solicitud",
	summary:
		"Envía una solicitud a la API de Phaseo, lee lo que devuelve, gestiona los errores y recibe la respuesta en streaming.",
	level: "developer",
	format: "Cualquier lenguaje",
	prerequisites: ["¿Qué es Phaseo?", "Saber hacer una solicitud HTTP en cualquier lenguaje"],
	lessons: [
		{
			slug: "make-a-request",
			title: "Haz una solicitud",
			summary: "Envía tu clave de API, un ID de modelo y tu entrada a un endpoint compatible con OpenAI.",
			minutes: 7,
			body: `Todas las solicitudes van a \`https://api.phaseo.app/v1\` y llevan tu clave de API como token de portador: \`Authorization: Bearer phaseo_v1_sk_...\`. Crea la clave en **Ajustes -> Claves de API**. Solo se muestra una vez, así que guárdala en una variable de entorno como \`PHASEO_API_KEY\` y úsala solo en código del servidor.

\`POST /v1/responses\` es el endpoint recomendado para el trabajo nuevo con texto. Envías un \`model\` y un \`input\`:

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

¿Ya usas el SDK oficial de OpenAI? Cambia tres cosas: la clave de API, la URL base y el ID de modelo.

\`\`\`ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});

const response = await client.responses.create({
  model: "openai/gpt-6-astra",
  input: "Write one sentence about reliable model routing.",
});

console.log(response.output_text);
\`\`\`

El código que llama a Chat Completions funciona con el mismo cliente: envía \`messages\` a \`client.chat.completions.create\`.

Los ID de modelo siempre llevan el prefijo del proveedor, como \`openai/\`, \`anthropic/\` o \`google/\`. Para cambiar de modelo, cambia solo la cadena \`model\`; el resto de la solicitud no cambia. Consulta los ID válidos con \`GET /v1/models\` en lugar de adivinarlos. \`phaseo/free\` elige un modelo gratuito disponible y funciona sin créditos, así que es útil para una primera prueba.`,
			quiz: {
				question: "Diriges el SDK oficial de OpenAI a Phaseo. ¿Qué cambios necesitas?",
				options: [
					"La clave de API, la URL base y el ID de modelo",
					"Solo la URL base; el SDK sigue usando tu clave de OpenAI",
					"Un campo de solicitud exclusivo de Phaseo que indique el proveedor, además de la URL base",
				],
				answer: 0,
				explanation:
					"La documentación indica exactamente tres cambios: tu clave de API de Phaseo, la URL base https://api.phaseo.app/v1 y un ID de modelo de Phaseo con el prefijo de su proveedor. Tu clave de OpenAI no funciona en Phaseo, y el proveedor forma parte del ID de modelo, no es un campo aparte.",
			},
			scenario: {
				prompt:
					"Tu aplicación envía `\"model\": \"gpt-6-astra\"` y la solicitud falla con un 400. Un compañero dice que el modelo debe de estar caído. ¿Qué compruebas primero?",
				answer:
					"El ID de modelo. Los ID de modelo de Phaseo incluyen el prefijo del proveedor, así que debería ser `openai/gpt-6-astra`. Un 400 apunta al cuerpo de la solicitud o al ID de modelo, no a una caída. Llama a `GET /v1/models` para confirmar el ID exacto.",
			},
			takeaway:
				"Solo necesitas una URL base, una clave de portador y un ID de modelo con el prefijo del proveedor; cambiar de modelo es cambiar una cadena.",
			links: [
				{ label: "Inicio rápido", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "SDK de OpenAI", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "Crear una chat completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "Lee la respuesta",
			summary: "Encuentra la respuesta, por qué se detuvo, quién la sirvió y cuánto costó.",
			minutes: 6,
			body: `Una respuesta de Chat Completions tiene este aspecto (valores de ejemplo):

\`\`\`json
{
  "id": "G-...",
  "object": "chat.completion",
  "model": "openai/gpt-6-astra",
  "provider": "openai",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "ok" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 1,
    "total_tokens": 13,
    "cost": 0.000021
  }
}
\`\`\`

- **\`choices[].message.content\`** contiene el texto de la respuesta.
- **\`finish_reason\`** indica por qué se detuvo el modelo: \`stop\` (terminó), \`length\` (alcanzó el límite de tokens), \`tool_calls\` (quiere llamar a una herramienta) o \`content_filter\`.
- **\`model\`** indica el modelo que respondió. Si un modelo alternativo atendió la solicitud, aquí aparece la alternativa, no el modelo que pediste.
- **\`provider\`** indica el proveedor que la atendió.
- **\`id\`** es el ID de solicitud de Phaseo. Regístralo: la solicitud aparece en **Ajustes -> Uso -> Registros**, y el equipo de soporte te lo pedirá.

\`usage\` cuenta los tokens y añade \`cost\`: lo que te cuesta la solicitud en dólares estadounidenses, la cantidad que se descuenta de tus créditos. En una solicitud BYOK, \`cost_details.upstream_inference_cost\` muestra lo que se factura a tu propia clave del proveedor; con créditos de Phaseo es \`null\`.

En \`/v1/responses\` la forma es distinta: el texto está en \`output[].content[]\`, donde \`type\` es \`output_text\`, y \`usage\` usa \`input_tokens\` y \`output_tokens\`.`,
			quiz: {
				question: "Una respuesta de Chat Completions llega con `finish_reason: \"length\"`. ¿Qué ha pasado?",
				options: [
					"El proveedor falló a mitad y Phaseo devolvió lo que tenía",
					"El modelo alcanzó el límite de tokens, así que la respuesta puede estar cortada",
					"El modelo terminó con normalidad y la respuesta está completa",
				],
				answer: 1,
				explanation:
					"`length` significa que el modelo se detuvo porque alcanzó el límite de tokens. Un final normal es `stop`. Un proveedor que falla a mitad devuelve un error, no una respuesta parcial con un motivo de finalización.",
			},
			scenario: {
				prompt:
					"El equipo de finanzas pregunta cuánto costó la solicitud `G-01J...` de ayer y qué proveedor la ejecutó. ¿Dónde lo miras?",
				answer:
					"En la propia respuesta, `usage.cost` da el cargo en dólares estadounidenses y `provider` indica quién la atendió. Si no registraste el cuerpo, abre la solicitud por su ID en **Ajustes -> Uso -> Registros**.",
			},
			takeaway:
				"Lee la respuesta en `choices`, comprueba `finish_reason` y registra `id`, `model`, `provider` y `usage.cost` en cada llamada.",
			links: [
				{ label: "Crear una chat completion", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "Crear una respuesta", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "Inicio rápido: lee la respuesta", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "Cuando falla una solicitud",
			summary: "Decide según el código de error y el estado, y reintenta solo los errores que pueden funcionar más tarde.",
			minutes: 8,
			body: `Todos los errores de Phaseo tienen el mismo cuerpo JSON en todos los endpoints. El objeto \`error\` tiene la forma que ya leen los SDK compatibles con OpenAI:

\`\`\`json
{
  "error": {
    "code": "insufficient_funds",
    "message": "...",
    "type": "insufficient_quota",
    "param": null
  },
  "generation_id": "G-...",
  "status_code": 402
}
\`\`\`

Decide según \`error.code\` y el estado HTTP, nunca según el texto del mensaje. Registra siempre \`generation_id\`.

| Estado | Código habitual | Qué hacer |
| --- | --- | --- |
| \`400\` | \`validation_error\`, \`model_required\` | Corrige la solicitud. \`error.param\` indica el campo. |
| \`401\` | \`unauthorised\` | Comprueba la clave y la cabecera \`Authorization\`. |
| \`402\` | \`insufficient_funds\` | Añade créditos o usa \`phaseo/free\`. |
| \`403\` | \`guardrail_blocked\` | Cambia la solicitud o el guardrail. |
| \`404\` | \`not_found\` | Comprueba la ruta y el ID. |
| \`410\` | \`model_retired\` | Cambia a \`replacement_model\`. |
| \`429\` | \`rate_limit_exceeded\`, \`key_limit_exceeded\` | Espera lo que indique \`Retry-After\` y reintenta. |
| \`5xx\` | \`upstream_error\`, \`gateway_error\` | Reintenta con espera exponencial. |

No reintentes sin cambios los errores \`4xx\` distintos de \`429\`: volverán a fallar. Con \`429\`, espera lo que indique \`Retry-After\` (segundos o una fecha HTTP), o usa espera exponencial con jitter. Un \`key_limit_exceeded\` sin \`Retry-After\` no se restablece solo, así que no lo reintentes. Reintenta los \`5xx\` solo cuando repetir la llamada sea seguro, y fija un número máximo de intentos y un plazo total.`,
			quiz: {
				question: "Tu solicitud devuelve `401` con el código `unauthorised`. ¿Qué debe hacer tu código?",
				options: [
					"Detenerse y comprobar la clave de API y la cabecera `Authorization: Bearer`",
					"Reintentar con espera exponencial hasta que funcione",
					"Esperar a la cabecera `Retry-After` y volver a enviar la misma solicitud",
				],
				answer: 0,
				explanation:
					"Un 401 significa que la clave falta o no es válida. Reintentar la misma solicitud no lo arregla. La espera exponencial es para los 429 y 5xx, y `Retry-After` llega con los 429.",
			},
			scenario: {
				prompt:
					"Un script por lotes envía 500 solicitudes en un bucle. A mitad, las respuestas empiezan a llegar como `429` con una cabecera `Retry-After: 20`. ¿Qué cambias?",
				answer:
					"Haz que el script respete `Retry-After`: espera unos 20 segundos antes de reintentar, y usa espera exponencial con jitter cuando falte la cabecera. Comprueba también `error.code`: `rate_limit_exceeded` se restablecerá, pero un `key_limit_exceeded` sin `Retry-After` no, así que no tiene sentido reintentarlo.",
			},
			takeaway:
				"Decide según `error.code` y el estado, corrige los errores 4xx y reintenta con espera exponencial solo los 429 y los 5xx seguros.",
			links: [
				{ label: "Errores y depuración", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Límites de solicitudes", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "Inicio rápido: soluciona problemas", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "Usa streaming",
			summary: "Muestra la respuesta a medida que se escribe y distingue un stream terminado de uno interrumpido.",
			minutes: 9,
			body: `Pon \`"stream": true\` y Phaseo envía la salida como eventos enviados por el servidor (SSE) mientras el modelo la escribe:

\`\`\`bash
curl --no-buffer https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Say hello in one sentence.",
    "stream": true
  }'
\`\`\`

Comprueba primero el estado HTTP. Una solicitud que falla antes de que empiece el stream recibe el error JSON normal, no un stream. Después lee los eventos. Cada endpoint tiene su propio formato:

| Endpoint | El texto llega en | Final correcto | Final con error |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` o \`error\` |
| Chat Completions | \`choices[].delta\` | un \`finish_reason\` y después \`[DONE]\` | un frame \`error\` sin \`finish_reason\` |

En Chat Completions, antes de \`[DONE]\` llega un último fragmento con \`choices\` vacío que lleva \`usage\`, incluido el \`cost\` de todo el stream. Solo Chat Completions envía \`[DONE]\`. Un fragmento de red puede contener medio evento o varios, así que acumula los datos hasta tener un evento completo antes de analizarlo, o usa un helper de streaming de un SDK.

Un stream solo ha terminado cuando llega su evento de final correcto. Que la conexión se cierre no significa por sí solo que la respuesta esté completa. Si falla a mitad, conserva el texto parcial marcado como interrumpido y ofrece reintentar; Phaseo no cobra la salida parcial de un stream que falla.

Para cancelar, pasa un \`AbortSignal\` (o el equivalente de tu cliente HTTP) y cancela cuando el usuario se detenga. Cancelar no garantiza que el proveedor se detenga de inmediato ni que la salida ya generada sea gratuita.`,
			quiz: {
				question: "Tu stream de Chat Completions ha enviado texto y después la conexión se cierra. Nunca viste un `finish_reason` ni `[DONE]`. ¿Qué haces?",
				options: [
					"Tratarla como completa, porque la conexión se cerró limpiamente",
					"Añadir al texto parcial la respuesta del siguiente reintento",
					"Tratar la respuesta como interrumpida y ofrecer reintentar",
				],
				answer: 2,
				explanation:
					"Un stream solo ha terminado cuando llega su evento de final correcto. Sin un `finish_reason` y `[DONE]`, la respuesta está incompleta. Un reintento puede producir un texto distinto, así que muéstralo por separado en lugar de añadirlo al anterior.",
			},
			scenario: {
				prompt:
					"Los usuarios pueden pulsar **Detener** en la interfaz de tu chat. Tu responsable de producto cree que las respuestas detenidas no cuestan nada. ¿Tiene razón?",
				answer:
					"No. Cancela la solicitud con un `AbortSignal` para que tu aplicación deje de leer, pero la documentación indica que cancelar no garantiza que el proveedor se detenga de inmediato ni que la salida ya generada sea gratuita. Cuenta con que las respuestas detenidas se cobren por el trabajo ya hecho.",
			},
			takeaway:
				"Espera al evento de final correcto del endpoint, trata cualquier otra cosa como interrumpida y no des por hecho que un stream cancelado es gratis.",
			links: [
				{ label: "Streaming", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "Errores durante un stream", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Crear una respuesta", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
