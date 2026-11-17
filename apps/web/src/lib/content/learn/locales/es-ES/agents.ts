import type { LearnCourse } from "../../types";

export const agentsCourse: LearnCourse = {
	slug: "phaseo-in-your-coding-agent",
	title: "Usa Phaseo con tu agente de programación",
	summary:
		"Dale a tu agente de programación las skills, la documentación y las herramientas de Phaseo, y deja que te enseñe Phaseo mientras crea tu proyecto.",
	level: "beginner",
	format: "Sin código",
	prerequisites: ["¿Qué es Phaseo?"],
	lessons: [
		{
			slug: "connect-your-agent",
			title: "Conecta tu agente",
			summary:
				"Dale a tu agente las skills y la documentación de Phaseo para que escriba código correcto, datos en directo mediante MCP y modelos de Phaseo mediante la CLI.",
			minutes: 8,
			body: `Los agentes de programación como Claude Code, Codex y Cursor pueden trabajar con Phaseo de tres formas distintas. Elige las que necesites.

**1. Enséñale Phaseo.** Las skills de agente son instrucciones que ayudan a tu agente a escribir código de Phaseo correcto. Cubren el Gateway, los SDK, los preajustes, el enrutamiento y las migraciones. Instálalas con:

\`\`\`bash
npx skills add https://phaseo.app/docs
\`\`\`

Para que lea la documentación actual durante una sesión, añade el servidor Docs MCP, \`https://phaseo.app/docs/mcp\`. Solo lee documentación y nunca toca tu cuenta.

**2. Dale datos de Phaseo en directo.** El servidor MCP de Phaseo, \`https://mcp.phaseo.app/mcp\`, permite a un agente consultar modelos, precios, proveedores, tus créditos, el uso y los registros de solicitudes. Es de solo lectura y nunca devuelve prompts, respuestas ni valores secretos. Inicias sesión con Phaseo en tu navegador. En Claude Code:

\`\`\`bash
claude mcp add --transport http phaseo https://mcp.phaseo.app/mcp
\`\`\`

Después ejecuta \`/mcp\`, selecciona \`phaseo\` y elige **Authenticate**. Si quieres que el agente también gestione claves de API y ajustes del espacio de trabajo, conéctate con \`https://mcp.phaseo.app/mcp?access=manage\` y desmarca los permisos que no quieras darle.

**3. Ejecuta el agente con modelos de Phaseo.** Instala la CLI de Phaseo con \`npm install -g @phaseo/cli\`, ejecuta \`phaseo login\` y después el comando de tu agente, como \`phaseo claude-code\` o \`phaseo codex\`. La CLI dirige el agente a Phaseo y le crea su propia clave de API con un límite de gasto mensual de 100 $ y una caducidad de 90 días. Apruebas la clave en tu navegador y puedes cambiar su límite en **Ajustes → Claves de API**.

En Claude Code o Codex, el plugin de Phaseo instala los dos servidores MCP y las skills de una vez.`,
			quiz: {
				question:
					"Conectas tu agente a https://mcp.phaseo.app/mcp sin ?access=manage. ¿Qué puede hacer?",
				options: [
					"Leer datos de Phaseo en directo, como modelos, precios, créditos y registros de solicitudes.",
					"Crear claves de API y comprar créditos para tu espacio de trabajo.",
					"Leer los prompts y las respuestas guardados en tus registros de solicitudes.",
				],
				answer: 0,
				explanation:
					"La URL sin parámetros es de solo lectura. Los cambios necesitan la URL de gestión, e incluso así el MCP no puede comprar créditos. Sus herramientas nunca devuelven prompts, respuestas ni valores secretos.",
			},
			scenario: {
				prompt:
					"Usas Codex. Quieres que escriba código de Phaseo que siga la documentación, y también quieres que el propio Codex funcione con modelos a través de Phaseo. ¿Qué configuras?",
				answer:
					"Dos cosas distintas. Para que escriba código correcto, instala las skills con `npx skills add https://phaseo.app/docs` y añade el Docs MCP si quieres que lea la documentación actual. Para ejecutar Codex con Phaseo, instala la CLI, ejecuta `phaseo login` y después `phaseo codex`, que crea una clave para Codex con un límite mensual de 100 $ y una caducidad de 90 días. El plugin de Phaseo para Codex puede instalar las skills y los dos servidores MCP a la vez.",
			},
			takeaway:
				"Las skills y el Docs MCP enseñan Phaseo a tu agente, el MCP de Phaseo le da datos en directo y la CLI lo ejecuta con modelos de Phaseo.",
			links: [
				{
					label: "CLI y MCP",
					href: "https://phaseo.app/docs/v1/developers/cli-and-mcp",
				},
				{
					label: "Agentes de programación",
					href: "https://phaseo.app/docs/v1/guides/integrations/coding-assistants",
				},
				{
					label: "Configura agentes de programación con SKILL.md",
					href: "https://phaseo.app/docs/v1/cookbook/coding-agents-skill-md",
				},
				{
					label: "Gestiona Phaseo desde un agente",
					href: "https://phaseo.app/docs/v1/developers/manage-from-an-agent",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "learn-in-your-agent",
			title: "Aprende Phaseo en tu agente",
			summary:
				"Convierte tu agente de programación en un tutor que te enseña Phaseo mientras crea algo que de verdad necesitas.",
			minutes: 6,
			body: `\`https://phaseo.app/learn.md\` es un curso escrito para tu agente de programación. Pega esto en Claude Code, Codex, Cursor o cualquier agente que pueda abrir URL:

\`\`\`text
Fetch https://phaseo.app/learn.md and follow it. Teach me Phaseo while we build something I actually need.
\`\`\`

**Qué pasa después.** El agente te pregunta qué quieres crear, tu experiencia, tu lenguaje y tu framework, cualquier limitación como el presupuesto o la región, y cómo sabrás que funciona. Lo resume como una misión y después propone la versión más pequeña que funcione de principio a fin. Aceptas el plan antes de que escriba código.

**Cómo funciona cada lección.** El agente escribe el código; tú tomas las decisiones, como qué modelo, qué endpoint y qué hacer cuando falla una solicitud. Explica una idea cada vez, te pregunta antes de escribir un cambio, lo ejecuta contigo y después te hace una pregunta para comprobar que lo has entendido antes de seguir. Consulta los ID de modelo, los precios y los límites en lugar de adivinarlos.

**Tu progreso se guarda** en una carpeta \`.phaseo-learn/\` de tu proyecto: el propio curso, tu misión y tu plan, notas sobre cómo te gusta trabajar, las páginas de documentación usadas y un registro por lección. Empieza una sesión nueva con la misma instrucción y el agente leerá esos archivos y seguirá donde lo dejaste. Te ofrece añadir la carpeta a \`.gitignore\`; tú decides.

Configura \`PHASEO_API_KEY\` tú mismo antes de empezar. El curso indica al agente que nunca te pida pegar una clave en el chat.`,
			quiz: {
				question: "¿Dónde guarda el curso tu progreso entre sesiones?",
				options: [
					"En una carpeta .phaseo-learn/ de tu proyecto.",
					"En tu cuenta de Phaseo, en Ajustes.",
					"En ningún sitio: cada sesión empieza desde el principio.",
				],
				answer: 0,
				explanation:
					"El agente guarda el curso, tu misión, tus notas, los recursos y los registros de cada lección en `.phaseo-learn/`, y los lee al principio de cada sesión.",
			},
			scenario: {
				prompt:
					"A mitad de una sesión, el agente escribe tres archivos seguidos cuando solo has dicho «ok», y cita de memoria el precio de un modelo. ¿Qué deberías hacer?",
				answer:
					"Las dos cosas indican que el agente se ha desviado del curso. Pídele que se detenga, vuelva a leer `.phaseo-learn/COURSE.md` y `MISSION.md`, y te haga una pregunta de comprobación sobre lo último que ha creado. Pídele que consulte el precio en `GET https://api.phaseo.app/v1/models` o en la página del modelo en lugar de citarlo de memoria.",
			},
			takeaway:
				"Una sola instrucción convierte tu agente en un tutor de Phaseo que crea tu proyecto contigo y guarda tu progreso en .phaseo-learn/.",
			links: [
				{ label: "El curso para tu agente", href: "https://phaseo.app/learn.md" },
				{
					label: "Inicio rápido",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Docs MCP",
					href: "https://phaseo.app/docs/v1/guides/integrations/docs-mcp",
				},
			],
			updated: "2026-11-17",
		},
	],
};
