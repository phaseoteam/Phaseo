import type { LearnCourse } from "../../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "Crea funciones reales",
	summary:
		"Deja que los modelos llamen a tus funciones, devuelvan JSON con una forma fija y reciban imágenes, archivos y audio como entrada.",
	level: "developer",
	format: "Cualquier lenguaje",
	prerequisites: ["Haz tu primera solicitud"],
	lessons: [
		{
			slug: "call-tools",
			title: "Llama a herramientas",
			summary: "Describe tus funciones, ejecuta las llamadas que pide el modelo y devuélvele los resultados hasta que responda.",
			minutes: 10,
			body: `Describe tus funciones en \`tools\` y el modelo responderá con una llamada a una de ellas, como una consulta a la base de datos, en lugar de adivinar. El modelo nunca ejecuta nada por sí mismo: tu aplicación ejecuta la función y devuelve el resultado, y después el modelo escribe la respuesta final.

\`\`\`bash
curl https://api.phaseo.app/v1/chat/completions \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "messages": [
      { "role": "user", "content": "What is the weather in London?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather by city",
          "parameters": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      }
    ]
  }'
\`\`\`

En Chat Completions, la respuesta tiene \`finish_reason: "tool_calls"\` y una lista \`tool_calls\` en el mensaje del asistente, cada una con un \`id\`, un \`name\` de función y \`arguments\` como cadena JSON. Ejecuta cada llamada y después envía una solicitud de seguimiento que repita la conversación, el mensaje del asistente sin cambios y un mensaje \`role: "tool"\` por llamada, asociado mediante \`tool_call_id\`. Vuelve a enviar \`tools\`. El modelo responde o llama a otra herramienta, y repites el proceso. En \`/v1/responses\`, la llamada es un elemento \`function_call\` y tu resultado un elemento \`function_call_output\` con el mismo \`call_id\`; en \`/v1/messages\` son bloques \`tool_use\` y \`tool_result\`.

\`tool_choice\` controla si el modelo puede llamar a herramientas: \`none\` para solo texto, \`auto\` (o no incluirlo) para que decida el modelo, \`required\` para obligarle a llamar a una, o un objeto que nombre una herramienta concreta. Pon \`parallel_tool_calls\` en \`false\` cuando tus herramientas deban ejecutarse de una en una.

Trata cada llamada como una entrada no fiable. Comprueba el nombre de la herramienta con una lista de permitidas, rechaza los nombres desconocidos y valida los argumentos analizados antes de ejecutar nada. Si la validación falla, no ejecutes la herramienta: envía un error breve como resultado de la herramienta y deja que el modelo lo intente de nuevo. Con \`stream: true\`, reúne todos los fragmentos de los argumentos antes de analizarlos. Las herramientas cuyo tipo empieza por \`phaseo:\`, como \`phaseo:web_search\` o \`phaseo:datetime\`, se ejecutan en Phaseo, así que obtienes la respuesta final sin escribir un ejecutor. Estas herramientas de servidor están en **Beta**.`,
			quiz: {
				question: "El modelo devuelve una llamada a `delete_user` con `{\"id\": \"42\"}`. Tu aplicación solo define `get_weather`. ¿Qué debe hacer tu código?",
				options: [
					"Ejecutarla, porque el modelo la eligió a partir de la conversación",
					"Rechazarla como herramienta desconocida y devolver un error breve como resultado de la herramienta",
					"Pedir a Phaseo que la ejecute con un prefijo `phaseo:`",
				],
				answer: 1,
				explanation:
					"La guía de seguridad indica que hay que rechazar los nombres de herramienta desconocidos en lugar de adivinar qué quería el modelo, y devolver un error controlado en lugar de ejecutar nada. Las herramientas `phaseo:` son un conjunto fijo que ofrece Phaseo, no una forma de ejecutar tus propias funciones.",
			},
			scenario: {
				prompt:
					"Tu bot de soporte llama a `get_order` y después responde. El bucle de un compañero envía solo el mensaje `role: \"tool\"` en la solicitud de seguimiento, y el proveedor lo rechaza. ¿Qué falta?",
				answer:
					"La solicitud de seguimiento debe repetir la conversación, después el mensaje del asistente con sus `tool_calls` sin cambios y después un mensaje `role: \"tool\"` por llamada con el `tool_call_id` correspondiente. Vuelve a enviar también `tools`. Un resultado de herramienta sin una llamada previa no tiene nada con qué asociarse.",
			},
			takeaway:
				"El modelo pide, tu aplicación valida y ejecuta la llamada, y tú devuelves el resultado con el ID de la llamada hasta que el modelo da una respuesta final.",
			links: [
				{ label: "Llamadas a herramientas", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "Patrones de llamadas a herramientas", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "Seguridad en las llamadas a herramientas", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "Herramientas de servidor", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "Obtén salidas estructuradas",
			summary: "Envía un JSON Schema para que el modelo devuelva JSON con tu forma, y valídalo antes de usarlo.",
			minutes: 8,
			body: `Envía un JSON Schema con la solicitud y el modelo devolverá JSON con esa forma en lugar de texto libre. Úsalo cuando quieras recibir datos, como campos extraídos de un correo. Usa las llamadas a herramientas cuando quieras que el modelo pida a tu aplicación que haga algo.

| \`type\` | Qué obtienes |
| --- | --- |
| \`json_schema\` | JSON que sigue tu esquema. Úsalo por defecto. |
| \`json_object\` | Algún objeto JSON válido, sin forma obligatoria. |
| \`text\` | Texto sin formato (el valor predeterminado). |

El formato va en \`response_format\` en \`/v1/chat/completions\`, en \`text.format\` en \`/v1/responses\` y en \`output_config.format\` en \`/v1/messages\` (solo \`json_schema\`).

\`\`\`json
{
  "model": "openai/gpt-6-astra",
  "messages": [
    { "role": "user", "content": "Return the city and weather for London." }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "city": { "type": "string" },
          "weather": { "type": "string" }
        },
        "required": ["city", "weather"],
        "additionalProperties": false
      }
    }
  }
}
\`\`\`

El JSON llega como cadena en el contenido del mensaje. Antes de analizarlo, comprueba si hay una negativa, si falta contenido o si el \`finish_reason\` es distinto de \`stop\`. Después valida el objeto analizado, por ejemplo con Zod. Si la validación falla, reintenta una vez con el error en el prompt y después devuelve un fallo seguro. Cada reintento se cobra, y un JSON válido no demuestra que los valores sean correctos.

Phaseo nunca descarta \`response_format\`. Solo enruta una solicitud \`json_schema\` a proveedores que admiten salidas estructuradas; si ninguno de los proveedores del modelo las admite, la solicitud falla con \`400 validation_error\`. Las páginas de los modelos indican la compatibilidad con \`structured_outputs\`, que es un indicador de capacidad, no un campo de la solicitud.`,
			quiz: {
				question: "Envías `response_format` con `json_schema` a un modelo cuyos proveedores no admiten salidas estructuradas. ¿Qué pasa?",
				options: [
					"Phaseo descarta `response_format` y devuelve texto sin formato",
					"Phaseo envía la solicitud igualmente y el modelo adivina la forma",
					"La solicitud falla con `400 validation_error`",
				],
				answer: 2,
				explanation:
					"`response_format` nunca se descarta. Phaseo solo enruta una solicitud con esquema a proveedores que admiten salidas estructuradas, y devuelve un 400 cuando el modelo no tiene ninguno.",
			},
			scenario: {
				prompt:
					"Tu analizador de facturas usa `json_schema` y, de vez en cuando, la respuesta no supera tu comprobación de Zod porque falta `total`. ¿Qué debe hacer el código?",
				answer:
					"Primero comprueba que `finish_reason` es `stop`, porque una respuesta cortada no puede ser válida. Después reintenta una vez con el error de validación en el prompt y, si vuelve a fallar, devuelve un fallo seguro en lugar de adivinar. Lleva la cuenta de los fallos por modelo y por versión del esquema para detectar cuándo un cambio en cualquiera de los dos empeora los resultados.",
			},
			takeaway:
				"Usa `json_schema` para los datos que necesitas con una forma fija, y valida siempre el resultado en tu propio código antes de fiarte de él.",
			links: [
				{ label: "Salidas estructuradas", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "Parámetros: response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "Reparación de respuestas para JSON", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "Envía imágenes y audio",
			summary: "Añade imágenes, archivos y audio a una solicitud, elige el endpoint según la salida que quieras y encuentra los modelos que aceptan cada entrada.",
			minutes: 9,
			body: `En los endpoints de texto, el \`content\` de un mensaje puede ser una lista de partes en lugar de una cadena. Una parte de imagen acepta una URL HTTP(S) o un URI \`data:\` en base64:

\`\`\`json
{
  "model": "anthropic/claude-sonnet-5.5",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What does this chart show?" },
        { "type": "image_url", "image_url": { "url": "https://example.com/chart.png" } }
      ]
    }
  ]
}
\`\`\`

Las demás partes de entrada siguen el mismo patrón. \`input_audio\` envía \`data\` de audio en base64 con un \`format\` como \`wav\` o \`mp3\`. Una parte \`file\` envía un documento como un PDF, ya sea como URL de datos en base64 en \`file_data\` o como \`file_id\`. Un \`file_id\` solo puede leerlo la cuenta del proveedor que lo emitió, así que fija ese proveedor o envía los datos.

Para otros tipos de salida, usa su endpoint:

| Quieres | Endpoint |
| --- | --- |
| Voz a partir de texto | \`/v1/audio/speech\` |
| Texto a partir de voz | \`/v1/audio/transcriptions\` (\`/v1/audio/translations\` para inglés) |
| Imágenes | \`/v1/images/generations\`, \`/v1/images/edits\` |
| Texto y maquetación de la imagen de un documento | \`/v1/ocr\`, \`/v1/parse\` |

\`/v1/parse\` acepta una imagen por solicitud y no admite PDF, así que convierte antes cada página en una imagen.

No todos los modelos aceptan todas las entradas. Phaseo solo enruta a proveedores que aceptan las entradas de tu solicitud; si ninguno las acepta, recibes \`400 unsupported_modalities\`. Compruébalo antes: cada modelo de \`GET /v1/models\` indica \`modalities.input\`, y puedes filtrar con \`input_types=image\`. En la página [Modelos](https://phaseo.app/models), usa los filtros de modalidades de entrada y salida.`,
			quiz: {
				question: "Necesitas una lista de los modelos que aceptan imágenes como entrada. ¿Cuál es la comprobación fiable más rápida?",
				options: [
					"Llamar a `GET /v1/models?input_types=image`",
					"Enviar una imagen a cada modelo y ver cuáles no dan error",
					"Elegir cualquier modelo cuyo nombre incluya «vision»",
				],
				answer: 0,
				explanation:
					"`GET /v1/models` filtra por `input_types` (alias `input_modalities`), y cada modelo indica `modalities.input`. La página Modelos tiene los mismos filtros. Probar a ciegas cuesta dinero, y el nombre no te dice qué acepta una ruta.",
			},
			scenario: {
				prompt:
					"Tu función de tiques envía una foto a un modelo que solo admite texto y recibe `400 unsupported_modalities`. El responsable de producto pregunta si Phaseo está caído. ¿Qué le dices y qué cambias?",
				answer:
					"Phaseo no está caído: ninguna ruta de ese modelo acepta imágenes como entrada. Elige un modelo cuyo `modalities.input` incluya `image` (filtra `GET /v1/models` con `input_types=image` o usa el filtro de la página Modelos) y envíale la misma solicitud.",
			},
			takeaway:
				"Envía imágenes, audio y archivos como partes del contenido, usa los endpoints dedicados para voz, transcripción e imágenes, y comprueba las modalidades de entrada de un modelo antes de depender de él.",
			links: [
				{ label: "Multimodalidad", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "Listar modelos", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "Analizar imágenes de documentos", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "Explorar modelos", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
