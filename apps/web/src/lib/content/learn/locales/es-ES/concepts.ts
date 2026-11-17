import type { LearnCourse } from "../../types";

export const conceptsCourse: LearnCourse = {
	slug: "how-language-models-work",
	title: "Cómo funcionan los modelos de lenguaje",
	summary:
		"Una introducción sencilla a los modelos de lenguaje: cómo aprenden, cómo funcionan los tokens y el contexto, y cómo comprobar lo que te dicen.",
	level: "beginner",
	format: "Sin código",
	prerequisites: [],
	lessons: [
		{
			slug: "how-models-learn",
			title: "Cómo aprenden los modelos",
			summary:
				"Un modelo de lenguaje aprende patrones de enormes cantidades de texto y después se ajusta para seguir instrucciones.",
			minutes: 6,
			body: `Un modelo de lenguaje es un programa que lee texto y escribe el texto que es más probable que venga a continuación. Lo hace de poco en poco. Si le haces una pregunta, escribe una respuesta que encaja con los patrones que ha aprendido.

**Los modelos aprenden en dos pasos principales.** Primero viene el **preentrenamiento**: el modelo lee una cantidad enorme de texto, como libros, sitios web y código, y aprende a predecir la siguiente palabra. Ahí adquiere el lenguaje, los datos y los patrones de razonamiento. Después viene el **ajuste**: se le sigue entrenando con ejemplos de buenas respuestas, para que siga instrucciones y se comporte como un asistente útil en lugar de limitarse a continuar tu texto.

**Los modelos tienen una fecha de corte de conocimiento.** El entrenamiento termina en una fecha concreta, y el modelo no sabe nada de lo que pasó después. No busca información por su cuenta. Si necesitas datos recientes, tienes que dárselos al modelo, por ejemplo añadiendo un documento a tu prompt o activando una herramienta de búsqueda web.

**Los modelos de razonamiento piensan antes de responder.** Primero gastan tokens adicionales en resolver el problema y después escriben la respuesta. Esto ayuda con problemas difíciles, como matemáticas, código o planificación, pero tarda más y cuesta más, porque esos tokens de razonamiento cuentan como salida. En Phaseo eliges cuánto piensa un modelo con \`reasoning.effort\` (o \`reasoning_effort\` en Chat Completions), desde \`none\` hasta \`max\`. Un esfuerzo mayor ayuda con problemas difíciles y cuesta más tiempo y tokens.

**Modelos de pesos abiertos y modelos cerrados.** Algunos laboratorios publican los pesos de un modelo, los números que aprendió durante el entrenamiento, para que muchos proveedores puedan alojarlo. Otros mantienen los pesos en privado y solo ofrecen el modelo a través de su propia API o de socios elegidos. En Phaseo llamas a los dos tipos de la misma forma. La página de un modelo muestra su licencia en **Acerca de** y enumera todos los proveedores que lo alojan.`,
			quiz: {
				question:
					"Preguntas a un modelo por algo que pasó la semana pasada y te da una respuesta antigua o inventada. ¿Por qué?",
				options: [
					"El modelo está estropeado y necesita otro proveedor.",
					"El esfuerzo de razonamiento era demasiado bajo.",
					"El modelo solo sabe lo que había en sus datos de entrenamiento, hasta su fecha de corte de conocimiento.",
				],
				answer: 2,
				explanation:
					"Un modelo aprende de texto recopilado hasta una fecha concreta. No puede saber nada de hechos posteriores salvo que le des esa información, por ejemplo en tu prompt o con una herramienta de búsqueda web.",
			},
			scenario: {
				prompt:
					"Usas un modelo de razonamiento para responder preguntas sencillas de clientes, como el horario de apertura. Las respuestas son correctas pero lentas, y cuestan más de lo que esperabas. ¿Qué podrías cambiar?",
				answer:
					"Las preguntas sencillas rara vez necesitan pensar mucho. Baja `reasoning.effort` (o `reasoning_effort`), o usa un modelo que no razone. Los tokens de razonamiento cuentan como salida, así que pensar menos significa respuestas más rápidas y baratas. Reserva el esfuerzo alto para las tareas difíciles.",
			},
			takeaway:
				"Un modelo predice texto a partir de lo que aprendió en el entrenamiento, no sabe nada posterior a su fecha de corte, y los modelos de razonamiento cambian tiempo y tokens por mejores respuestas en problemas difíciles.",
			links: [
				{
					label: "Parámetros de razonamiento",
					href: "https://phaseo.app/docs/v1/api-reference/parameters#parameter-reasoning",
				},
				{
					label: "Explorar modelos",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{ label: "Modelos", href: "https://phaseo.app/models" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "tokens-and-context",
			title: "Tokens y contexto",
			summary:
				"Los modelos leen y escriben tokens, y cada token que envías o recibes añade tiempo y coste.",
			minutes: 7,
			body: `Los modelos no leen las palabras como tú. Dividen el texto en **tokens**: trozos cortos de palabras, palabras cortas enteras, espacios y signos de puntuación. Una palabra larga puede ser varios tokens. Todo se cuenta en tokens, desde los límites de lo que un modelo puede leer hasta el precio que pagas.

**La ventana de contexto es cuánto puede leer un modelo de una vez.** Contiene todo lo que hay en una solicitud: tus instrucciones, la conversación hasta ese momento, los documentos o resultados de búsqueda, las definiciones de herramientas y la respuesta que escribe el modelo. Cada ruta de proveedor tiene su propia **longitud de contexto**, que aparece en la página del modelo.

**Los tokens de entrada y de salida se cuentan por separado:**

| Tipo | Qué incluye |
| --- | --- |
| Entrada | Instrucciones, tus mensajes, documentos, definiciones de herramientas |
| Salida | La respuesta, más el razonamiento de un modelo de razonamiento |

La salida suele costar más por token que la entrada, porque el modelo tiene que escribir cada token de salida de uno en uno. En Phaseo, los precios de texto se muestran en USD por cada millón de tokens, con precios de entrada y salida separados. El campo \`usage\` de cada respuesta indica cuántos tokens ha usado.

**Los límites de salida cortan las respuestas antes de tiempo.** Puedes limitar la salida con \`max_tokens\` (Chat Completions y Messages) o \`max_output_tokens\` (Responses). Así reduces el coste y el tiempo de espera. Pero si el límite es demasiado bajo, la respuesta se corta y termina con \`finish_reason: "length"\`. No es un fallo del modelo: sube el límite o baja el esfuerzo de razonamiento.

**La caché de prompts abarata la entrada repetida.** Si el principio de tu prompt es el mismo en todas las solicitudes, como unas instrucciones largas o un documento de referencia, el proveedor puede leerlo de su caché. Esos tokens se facturan a la tarifa de lectura de caché, que es más baja, y el primer token llega antes. La mayoría de los proveedores guardan en caché los inicios repetidos por su cuenta; Claude solo guarda en caché lo que marcas con \`cache_control\`.`,
			quiz: {
				question:
					"Una respuesta se detiene a mitad de una frase y `finish_reason` es `\"length\"`. ¿Qué ha pasado?",
				options: [
					"El proveedor falló, así que Phaseo debería haber probado con otro.",
					"La respuesta alcanzó el límite de salida, así que se cortó.",
					"El prompt era demasiado largo para la ventana de contexto del modelo.",
				],
				answer: 1,
				explanation:
					"`finish_reason: \"length\"` significa que la respuesta alcanzó el límite de salida (`max_tokens` o `max_output_tokens`). Sube el límite, o baja el esfuerzo de razonamiento si un modelo de razonamiento lo agotó pensando.",
			},
			scenario: {
				prompt:
					"Tu bot de soporte envía el mismo documento de políticas de 20 páginas al principio de cada solicitud, seguido de la pregunta del cliente. Tu factura es casi toda de tokens de entrada. ¿Qué puedes hacer?",
				answer:
					"Mantén las políticas al principio del prompt, sin cambios, para que el proveedor pueda guardarlas en caché. Así la entrada repetida se factura a la tarifa de lectura de caché y las respuestas empiezan antes. En Claude, marca el final de las políticas con `cache_control`. También puedes recortar el documento a las partes que importan.",
			},
			takeaway:
				"Todo se cuenta en tokens: la entrada y la salida tienen precios distintos por millón, los límites de salida pueden cortar las respuestas y la caché abarata la entrada repetida.",
			links: [
				{
					label: "Presupuesto de contexto y tokens",
					href: "https://phaseo.app/docs/v1/guides/context-and-token-budgeting",
				},
				{
					label: "Caché de prompts",
					href: "https://phaseo.app/docs/v1/guides/prompt-caching",
				},
				{
					label: "Precios y facturación",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Glosario",
					href: "https://phaseo.app/docs/v1/glossary",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "check-the-output",
			title: "Comprueba la salida",
			summary:
				"Los modelos pueden sonar seguros y aun así equivocarse, así que basa sus respuestas en datos reales y pruébalas antes de depender de ellas.",
			minutes: 7,
			body: `Un modelo escribe el texto que es más probable que venga a continuación. Casi siempre eso también es correcto. Pero cuando no sabe algo, puede escribir igualmente una respuesta fluida y segura que es falsa. Esto se llama **alucinación**. Los datos, citas, enlaces y cifras inventados son ejemplos habituales.

**Basa las respuestas en datos reales y comprueba las fuentes.** Un modelo es mucho más fiable cuando tiene los datos delante. Pon tus propios documentos en el prompt y pídele que responda solo a partir de ellos y que indique de dónde sale cada dato. Para información actual, añade la herramienta de servidor \`phaseo:web_search\` (en Beta): el modelo busca en la web y escribe una respuesta a partir de los resultados, que incluyen URL que puedes abrir. Ábrelas de verdad, porque un modelo también puede inventarse un enlace que parezca real.

**Obtén una forma fiable con salidas estructuradas.** Si tu código necesita leer la respuesta, envía un JSON Schema con la solicitud. El modelo devolverá JSON con esa forma en lugar de texto libre. Tu código debe comprobar igualmente el resultado antes de usarlo, porque la forma puede ser correcta y el contenido no.

**Baja la temperatura para obtener coherencia.** \`temperature\` controla cuánta variedad añade el modelo. Los valores bajos dan respuestas más estables y repetibles. Para extracción, clasificación y JSON, la documentación recomienda entre \`0.0\` y \`0.2\`.

**Prueba con ejemplos reales antes de publicar.** Reúne entradas reales, incluidas las desordenadas y las poco habituales, y comprueba las respuestas a mano. Vuelve a hacerlo cada vez que cambies el prompt o el modelo.`,
			quiz: {
				question:
					"Tu aplicación pregunta a un modelo el año de fundación de una empresa y necesitas que la respuesta sea correcta. ¿Cuál es el mejor enfoque?",
				options: [
					"Basar la respuesta en una fuente fiable, como resultados de búsqueda web o tus propios datos, y comprobar la fuente.",
					"Poner `temperature` a `0`, que hace que el modelo acierte siempre.",
					"Pedir al modelo que diga lo seguro que está y fiarte de él cuando dice que está seguro.",
				],
				answer: 0,
				explanation:
					"Una temperatura baja hace que las respuestas sean más coherentes, no más correctas, y un modelo puede sonar seguro aunque se equivoque. Lo que hace fiable la respuesta es darle una fuente fiable y comprobar esa fuente.",
			},
			scenario: {
				prompt:
					"Has creado una herramienta que extrae el total, la fecha y el proveedor de las facturas. En la demo funcionaba, pero en producción tu código a veces falla porque el modelo responde con una frase en lugar de los campos. ¿Qué cambias?",
				answer:
					"Usa salidas estructuradas: envía un JSON Schema con los campos que necesitas, para que el modelo devuelva JSON con esa forma. Pon una `temperature` baja, entre `0.0` y `0.2`. Valida el JSON en tu código antes de usarlo, y prueba con un conjunto de facturas reales, incluidas las desordenadas, antes de publicar.",
			},
			takeaway:
				"Trata las respuestas del modelo como borradores: básalas en fuentes reales, pide una forma fija, mantén la temperatura baja para que sean coherentes y prueba con ejemplos reales.",
			links: [
				{
					label: "Herramienta de servidor de búsqueda web",
					href: "https://phaseo.app/docs/v1/guides/server-tools/web-search",
				},
				{
					label: "Salidas estructuradas",
					href: "https://phaseo.app/docs/v1/guides/structured-outputs",
				},
				{
					label: "Parámetros de inferencia",
					href: "https://phaseo.app/docs/v1/guides/inference-parameters",
				},
			],
			updated: "2026-11-17",
		},
	],
};
