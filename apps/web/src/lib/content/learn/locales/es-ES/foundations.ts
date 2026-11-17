import type { LearnCourse } from "../../types";

export const foundationsCourse: LearnCourse = {
	slug: "what-is-phaseo",
	title: "¿Qué es Phaseo?",
	summary:
		"Descubre qué hace Phaseo, configura tu cuenta y tu primera clave de API, encuentra las páginas del panel que más usarás y elige un modelo.",
	level: "beginner",
	format: "Sin código",
	prerequisites: [],
	lessons: [
		{
			slug: "what-phaseo-is",
			title: "Qué es Phaseo",
			summary:
				"Phaseo es un gateway: una API y una clave delante de muchos modelos y de los proveedores que los alojan.",
			minutes: 6,
			body: `Phaseo es un gateway de IA. Envías todas las solicitudes a una sola API, \`https://api.phaseo.app/v1\`, con una sola clave. Phaseo pasa cada solicitud a un proveedor que pueda atenderla y la factura a tu espacio de trabajo. Puedes usar el formato de la API Responses, Chat Completions o Messages, el que ya use tu aplicación.

**Los modelos y los proveedores son cosas distintas.** Un modelo es el sistema que escribe la respuesta. Un proveedor aloja el modelo y fija su precio, su velocidad, su disponibilidad y los parámetros que admite. Un mismo modelo puede tener varios proveedores.

**Un ID de modelo nombra el modelo, no el proveedor.** Los ID tienen esta forma: \`openai/gpt-6-astra\` o \`anthropic/claude-sonnet-5.5\`, es decir, el laboratorio y después el modelo. \`phaseo/free\` elige un modelo gratuito disponible y funciona sin créditos. Si necesitas un proveedor concreto, puedes ponerlo delante del ID, por ejemplo \`baseten:thinking-machines/inkling-small\`.

**Cómo se enruta una solicitud:**

1. Phaseo se queda solo con los proveedores que permiten los ajustes de tu espacio de trabajo y la solicitud.
2. Los ordena. El modo predeterminado, \`balanced\`, tiene en cuenta el precio, la velocidad y la fiabilidad.
3. Llama al primer proveedor. Si ese proveedor falla, prueba con el siguiente.
4. Si todos los proveedores fallan con un error reintentable y has indicado modelos alternativos en \`models\`, prueba con el siguiente modelo.

Las alternativas no garantizan el éxito, así que tu aplicación debe seguir reintentando los errores \`429\` y \`5xx\` con espera exponencial. Una cosa más: el catálogo público incluye algunos modelos a los que todavía no se puede llamar. Comprueba que un modelo está **Activo en Gateway** antes de usar su ID.`,
			quiz: {
				question:
					"Llamas a un modelo que alojan tres proveedores y el proveedor mejor situado devuelve un error. ¿Qué hace Phaseo a continuación?",
				options: [
					"Prueba con el siguiente proveedor válido para el mismo modelo.",
					"Devuelve el error de inmediato, porque elegiste ese proveedor.",
					"Cambia a otro modelo que elige por ti.",
				],
				answer: 0,
				explanation:
					"Cuando un proveedor falla, el Gateway prueba con el siguiente proveedor válido para el mismo modelo. Solo pasa a otro modelo si has indicado modelos alternativos en `models` y todos los proveedores han fallado con un error reintentable.",
			},
			scenario: {
				prompt:
					"Un compañero encontró un modelo en la página Modelos de Phaseo y copió su ID en una solicitud. La solicitud falla, pero la página del modelo parece correcta. ¿Cuál es el motivo más probable y cómo lo compruebas?",
				answer:
					"El catálogo incluye más modelos de los que el Gateway puede llamar. Puede que el modelo esté en Próximamente o Inactivo. En la página Modelos, el filtro de estado del Gateway muestra por defecto los modelos Activo en Gateway, y `GET /v1/models` devuelve solo los modelos a los que puedes llamar. Elige un modelo que esté Activo en Gateway.",
			},
			takeaway:
				"Tú eliges el modelo; Phaseo elige un proveedor que lo aloja y pasa a otro cuando uno falla.",
			links: [
				{
					label: "Cómo funciona Phaseo",
					href: "https://phaseo.app/docs/v1/developers/introduction",
				},
				{
					label: "Enrutamiento y alternativas",
					href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks",
				},
				{
					label: "Explorar modelos",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "create-an-account-and-key",
			title: "Crea una cuenta y una clave",
			summary:
				"Regístrate, aprende qué contiene un espacio de trabajo y crea una clave de API que mantengas fuera de tu código.",
			minutes: 7,
			body: `Regístrate en phaseo.app con Google, GitHub, GitLab o un correo y una contraseña. Cada cuenta empieza con un espacio de trabajo personal, que basta para un proyecto pequeño.

**El espacio de trabajo es la unidad a la que pertenece todo.** Contiene tus claves de API, los ajustes de enrutamiento, los preajustes, los guardrails y quién tiene acceso de administración. Las solicitudes de pago usan el saldo de créditos del espacio de trabajo. Puedes añadir más espacios de trabajo, por ejemplo uno por producto o por entorno, después de tu primer depósito de créditos. Tener más espacios de trabajo no cambia tus precios.

**Crea una clave** en **Ajustes → Claves de API** y selecciona **Crear clave**. Elige el espacio de trabajo, ponle un nombre a la clave y elige un preajuste:

- **Desarrollo**: un límite de gasto diario bajo para aplicaciones locales y prototipos.
- **Producción**: sin límites predefinidos. Añade límites más adelante si los necesitas.
- **CI**: un límite de solicitudes para pruebas, evaluaciones y tareas de publicación.
- **Entorno de pruebas**: un límite estricto para demos, pruebas y experimentos compartidos.

Las claves pueden tener límites diarios, semanales o mensuales de solicitudes y de gasto. Cuando se alcanza un límite, las solicitudes con esa clave devuelven \`429\` con \`key_limit_exceeded\`.

**La clave solo se muestra una vez.** Cópiala y guárdala como variable de entorno:

\`\`\`bash
export PHASEO_API_KEY="phaseo_v1_sk_..."
\`\`\`

Trátala como una contraseña. Léela de \`PHASEO_API_KEY\` en código del servidor. Nunca la pongas en tu código, en un repositorio, en un navegador o una aplicación móvil, ni en un chat con una persona o un agente. Usa una clave por aplicación y entorno, para poder sustituir una sin romper las demás, y elimina las claves que ya no uses.`,
			quiz: {
				question: "¿Dónde debe estar tu clave de API de Phaseo?",
				options: [
					"En la variable de entorno PHASEO_API_KEY, leída por código del servidor.",
					"En tu código de front-end, para que el navegador pueda llamar a Phaseo directamente.",
					"En un mensaje de chat a tu agente de programación, para que termine la configuración por ti.",
				],
				answer: 0,
				explanation:
					"La documentación indica que las claves deben estar en código del servidor y fuera de navegadores, aplicaciones móviles, repositorios y chats. Cualquiera que tenga la clave puede gastar los créditos de tu espacio de trabajo.",
			},
			scenario: {
				prompt:
					"Estás creando un prototipo que llama a un modelo de pago dentro de un bucle. Te preocupa que un fallo genere una factura alta durante la noche. ¿Qué puedes hacer al crear la clave?",
				answer:
					"Elige el preajuste Desarrollo o Entorno de pruebas, que fijan un límite de gasto bajo, o define un límite de gasto diario en la clave. Si el bucle alcanza el límite, las solicitudes devuelven 429 con key_limit_exceeded en lugar de seguir gastando. Usa una clave distinta para producción.",
			},
			takeaway:
				"Tu espacio de trabajo es dueño de las claves y los créditos; crea una clave por aplicación y entorno, y guárdala en PHASEO_API_KEY en el servidor.",
			links: [
				{
					label: "Inicio rápido",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Autenticación",
					href: "https://phaseo.app/docs/v1/developers/authentication",
				},
				{
					label: "Espacios de trabajo",
					href: "https://phaseo.app/docs/v1/guides/workspaces",
				},
				{ label: "Claves de API", href: "/settings/keys" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "find-your-way-around",
			title: "Oriéntate en el panel",
			summary:
				"Conoce las pocas páginas que usarás primero: modelos, claves, facturación, uso, registros y ajustes del espacio de trabajo.",
			minutes: 6,
			body: `El panel tiene muchas páginas, pero para empezar solo necesitas unas pocas. La barra lateral de ajustes las agrupa en **General** (tu cuenta y la facturación), **Espacio de trabajo**, **Observar** y **Gateway**. Las páginas de los tres últimos grupos se aplican al espacio de trabajo elegido en la cabecera, así que compruébalo antes de cambiar nada.

**Antes de empezar a construir:**

- **Modelos** (\`/models\`): explora los modelos, fíltralos por lo que pueden hacer y abre uno para ver sus proveedores, precios y rendimiento. Un modelo con una ruta activa muestra un inicio rápido con el ID que debes enviar. **Comparar** (\`/compare\`) muestra modelos uno al lado del otro.
- **Claves de API** (\`/settings/keys\`): crea, limita y elimina claves. **Presupuestos** (\`/settings/budgets\`) limita el gasto de todo el espacio de trabajo.

**Dinero:**

- **Facturación → Facturación y créditos** (\`/settings/credits\`): tu saldo, el gasto reciente y dónde comprar créditos. Las recargas desde el panel empiezan en 5 $, y Phaseo añade una comisión del 5 % de la compra, con un mínimo de 1 $.
- **Facturación → Transacciones** (\`/settings/credits/transactions\`) muestra cada compra.

**Después de enviar solicitudes:**

- **Uso** (\`/settings/usage/overview\`): cómo usa Phaseo tu espacio de trabajo, con las páginas Resumen, Tendencias, Explorar y Alertas.
- **Registros** (\`/settings/usage/logs/requests\`): una fila por solicitud, con su uso, latencia, coste y errores. Es el primer sitio que debes mirar cuando algo falla.

**Ajustes del espacio de trabajo:** **Ajustes** (\`/settings/workspaces/settings\`) para los ajustes generales del espacio de trabajo y sus miembros, **Privacidad** (\`/settings/privacy\`) para lo que se guarda y **Enrutamiento** (\`/settings/routing\`) para la forma predeterminada de ordenar los proveedores.`,
			quiz: {
				question:
					"Una solicitud falló hace una hora. ¿Dónde ves su coste, su latencia y su error?",
				options: [
					"En Registros, dentro de Observar en la barra lateral de ajustes.",
					"En Facturación → Transacciones.",
					"En la página Claves de API.",
				],
				answer: 0,
				explanation:
					"Los registros de solicitudes muestran el uso, la latencia, el coste y los errores de cada solicitud. Transacciones solo muestra las compras de créditos, y la página Claves de API sirve para gestionar claves.",
			},
			scenario: {
				prompt:
					"Tu saldo de créditos baja más rápido de lo que esperabas y quieres averiguar por qué y evitar que vuelva a ocurrir. ¿Qué páginas abres y en qué orden?",
				answer:
					"Empieza por Uso para ver cuándo subió el gasto. Después abre Registros para ver las solicitudes concretas que lo causaron: qué modelo, cuántos tokens y cuánto costó cada una. Cuando sepas la causa, define un límite de gasto en la clave desde Claves de API o un presupuesto del espacio de trabajo en Presupuestos.",
			},
			takeaway:
				"Modelos para elegir, Claves de API para conectar, Facturación para pagar, y Uso y Registros para ver qué ha pasado.",
			links: [
				{ label: "Modelos", href: "/models" },
				{ label: "Registros de solicitudes", href: "/settings/usage/logs/requests" },
				{
					label: "Precios y facturación",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Límites de clave y presupuestos",
					href: "https://phaseo.app/docs/v1/api-reference/limits",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "choose-a-model",
			title: "Elige un modelo",
			summary:
				"Usa la lista de modelos, las páginas de cada modelo y Comparar para encontrar algunos candidatos, y pruébalos con tus propios ejemplos antes de decidirte.",
			minutes: 8,
			body: `Empieza en **Modelos** (\`/models\`). Por defecto solo muestra los modelos que están **Activo en Gateway**, así que puedes llamar a todo lo que ves. Acota la lista con los filtros **Endpoints** (como generación de texto o embeddings), **Modalidades de entrada y salida** (texto, imagen, audio, vídeo), **Funciones** (como llamadas a herramientas o razonamiento) y **Año**. Si has iniciado sesión, **Disponibles en mi espacio de trabajo** oculta los modelos que bloquean las reglas de tu espacio de trabajo. Puedes ordenar por más recientes, más populares, precio, longitud de contexto, rendimiento o latencia.

**Abre un modelo para ver lo que ofrece.** Su página solo muestra las secciones de las que tiene datos:

- **Proveedores**: cada ruta de proveedor con su estado, longitud de contexto, precio, disponibilidad, política de datos y parámetros admitidos.
- **Precios**: cada medidor en USD. Los precios de texto son por cada millón de tokens, con la entrada y la salida por separado, más la entrada en caché cuando un proveedor la ofrece.
- **Rendimiento** y **Disponibilidad**: latencia, rendimiento y disponibilidad medidos con el tráfico del Gateway, cuando hay suficiente.
- **Benchmarks**, **Acerca de** (fechas de lanzamiento, licencia, familia) y un inicio rápido con el ID de modelo que debes enviar.

**Haz una lista corta de dos o tres modelos.** **Comparar** (\`/compare\`) los muestra uno al lado del otro por precio, puntuaciones de benchmarks, contexto y funciones, y la **Calculadora de precios** (\`/tools/pricing-calculator\`) estima el coste de una solicitud típica. Los benchmarks y los gráficos de velocidad son un punto de partida, no un veredicto. Prueba la lista corta con ejemplos reales de tu trabajo: cortos, típicos y largos. Prueba primero el candidato más barato y rápido, y pasa a un modelo más caro solo si sus respuestas no son lo bastante buenas. Para una primera prueba sin créditos, envía \`phaseo/free\`, que ejecuta tu solicitud en un modelo gratuito disponible (hasta 1500 solicitudes a modelos gratuitos por usuario y día UTC).

**Los modelos no duran para siempre.** Los laboratorios marcan como obsoletos y retiran modelos a medida que llegan otros nuevos. Un modelo retirado sigue funcionando mientras algún proveedor lo sirva; después, las solicitudes fallan con \`410 model_retired\`. La página del modelo muestra sus fechas de obsolescencia y retirada, y el sustituto recomendado. Phaseo muestra un aviso en tu panel cuando un modelo que tu espacio de trabajo ha usado en los últimos 90 días se retira en los próximos 90 días, y **Ajustes → Uso → Alertas** muestra todos los modelos afectados. Prueba el sustituto antes de cambiar, porque los modelos nuevos pueden responder de forma distinta al mismo prompt.`,
			quiz: {
				question:
					"Dos modelos parecen similares en la lista de modelos. Uno cuesta la cuarta parte que el otro. ¿Qué deberías hacer primero?",
				options: [
					"Elegir el más caro, porque un precio más alto significa mejores respuestas.",
					"Elegir el que tenga mejor puntuación en benchmarks, sin probarlo.",
					"Probar el más barato con ejemplos reales de tu trabajo y pasar a otro solo si sus respuestas no son lo bastante buenas.",
				],
				answer: 2,
				explanation:
					"El precio y las puntuaciones de benchmarks te ayudan a hacer una lista corta, pero no demuestran cómo funciona un modelo con tus prompts. Probar primero el modelo más barato con tus propios ejemplos te dice si necesitas pagar más.",
			},
			scenario: {
				prompt:
					"Un aviso del panel dice que un modelo que usa tu bot de soporte se retira dentro de 30 días. ¿Qué haces?",
				answer:
					"Abre Ajustes → Uso → Alertas para ver el modelo afectado, sus fechas y el sustituto recomendado. Revisa la página del modelo sustituto para conocer su precio, su longitud de contexto y los parámetros que admite, y pruébalo con preguntas reales de soporte. Cuando estés conforme, cambia el ID de modelo en tu aplicación o en tu preajuste antes de que ningún proveedor sirva el modelo antiguo y las solicitudes empiecen a fallar con 410.",
			},
			takeaway:
				"Haz la lista corta con el catálogo, decide con tus propios ejemplos y empieza por el modelo más barato que haga el trabajo.",
			links: [
				{ label: "Modelos", href: "/models" },
				{
					label: "Explorar modelos",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{
					label: "Precios y rendimiento",
					href: "https://phaseo.app/docs/v1/exploring/pricing-performance",
				},
				{
					label: "Retirada de modelos",
					href: "https://phaseo.app/docs/v1/guides/model-retirement",
				},
			],
			updated: "2026-11-17",
		},
	],
};
