import type { LearnCourse } from "../../types";

const DOCS = "https://phaseo.app/docs/v1";

export const adminsCourse: LearnCourse = {
	slug: "set-up-your-team",
	title: "Configura Phaseo para tu equipo",
	summary:
		"Incorpora a tu equipo a un espacio de trabajo, reparte claves de forma segura, limita el gasto, configura guardrails y enrutamiento, y descubre cómo se usa la IA. Sin código.",
	level: "admin",
	format: "Sin código",
	prerequisites: ["¿Qué es Phaseo?"],
	lessons: [
		{
			slug: "workspaces-and-members",
			title: "Espacios de trabajo y miembros",
			summary:
				"Usa espacios de trabajo para separar equipos, invita a personas con un código y da a cada una el rol adecuado.",
			minutes: 7,
			body: `Un espacio de trabajo tiene sus propias claves de API, ajustes de enrutamiento, preajustes, guardrails y acceso de administración. Cada cuenta empieza con un espacio de trabajo personal. Crea más para cada equipo, producto o entorno, por ejemplo para mantener las claves de producción separadas de las de desarrollo. Los espacios de trabajo adicionales se desbloquean después de tu primer depósito de créditos y no cambian tus precios.

Cada persona de un espacio de trabajo tiene uno de estos tres roles:

- **Propietario**: la persona a la que pertenece el espacio de trabajo. Solo el propietario puede nombrar administrador a alguien, cambiar roles o eliminar a otros miembros. Al propietario no se le puede eliminar.
- **Administrador**: gestiona los ajustes exclusivos de administradores, como las claves de API, los presupuestos, las reglas de gasto y los guardrails, y lee el registro de auditoría.
- **Miembro**: usa el espacio de trabajo y puede ver sus reglas de gasto, pero no puede cambiar los ajustes exclusivos de propietarios y administradores.

Para invitar a alguien, abre **Ajustes → Miembros** y selecciona **Crear invitación**. Elige el rol (Administrador o Miembro), cuántos días dura la invitación y, si quieres, un número máximo de usos. Obtendrás un código para compartir. Tu compañero abre **Ajustes → Espacios de trabajo**, elige **¿Tienes un código de invitación?** y lo introduce. Eso envía una solicitud de acceso, que un propietario o administrador aprueba en **Solicitudes de acceso**. Solo el propietario puede aprobar a alguien como administrador.

Cambia de espacio de trabajo con el selector de la cabecera. Todo lo que ves en Ajustes, desde las claves hasta el uso, pertenece al espacio de trabajo que tienes abierto. Tu espacio de trabajo personal no se puede renombrar ni eliminar.`,
			quiz: {
				question: "Un administrador quiere incorporar a un nuevo compañero como administrador. ¿Qué pasa?",
				options: [
					"El administrador crea una invitación con el rol Administrador y aprueba la solicitud de acceso.",
					"Solo el propietario del espacio de trabajo puede invitar o aprobar a alguien como administrador.",
					"No se puede invitar a administradores; cada persona nueva entra como propietario.",
				],
				answer: 1,
				explanation:
					"Nombrar administrador a alguien es decisión del propietario. Un administrador puede invitar a miembros, pero una invitación con el rol Administrador, su aprobación y los cambios de rol posteriores necesitan al propietario del espacio de trabajo.",
			},
			scenario: {
				prompt:
					"Un colaborador externo ha terminado su proyecto y quieres sacarlo del espacio de trabajo. Él configuró la clave de API que todavía usa tu bot de soporte. ¿Qué deberías comprobar primero?",
				answer:
					"Eliminar a un miembro también revoca las claves de API que creó en ese espacio de trabajo, así que el bot de soporte dejaría de funcionar. Primero crea tú una clave de sustitución (o rota la suya a una clave nueva), pasa el bot a ella y después pide al propietario que elimine al colaborador en Ajustes → Miembros.",
			},
			takeaway:
				"Da a cada equipo o entorno su propio espacio de trabajo, y reserva el rol Administrador para las pocas personas que gestionan claves, presupuestos y guardrails.",
			links: [
				{ label: "Guía de espacios de trabajo", href: `${DOCS}/guides/workspaces` },
				{ label: "Miembros", href: "/settings/workspaces/members" },
				{ label: "Tus espacios de trabajo", href: "/settings/account/workspaces" },
				{ label: "Glosario: roles", href: `${DOCS}/glossary` },
			],
			updated: "2026-11-17",
		},
		{
			slug: "keys-for-a-team",
			title: "Claves de API para un equipo",
			summary:
				"Da a cada aplicación y entorno su propia clave con límites, usa claves de administración para la automatización y rota claves sin interrupciones.",
			minutes: 8,
			body: `Los propietarios y administradores crean claves de API en **Ajustes → Claves de API**. Usa **una clave por aplicación y entorno**, no una clave compartida para todos. Así puedes ver el uso de cada clave, limitarla y sustituirla sin tocar nada más. El secreto solo se muestra una vez, así que guárdalo directamente en tu gestor de secretos.

Cada clave puede tener límites diarios, semanales o mensuales de solicitudes y de gasto. Se comprueban en cada solicitud y se restablecen a medianoche UTC, el lunes o el día 1 de cada mes. Cuando se alcanza un límite, las solicitudes con esa clave se rechazan hasta que se restablece el periodo. **Seguridad de claves** muestra las claves que podrían causar daños si se filtraran: sin límite de gasto, sin caducidad, inactivas durante 90 días o más, o utilizables desde cualquier dirección IP.

Para la automatización, como un script que crea claves o lee el uso, usa una **clave de administración** de **Ajustes → Claves de administración**. Las claves de administración no pueden enviar solicitudes a modelos. Elige una plantilla: **Lectura**, **Escritura** (sin eliminar) o **Todo**, o elige solo las capacidades que necesitas. Una clave de administración nunca puede hacer más de lo que permite el rol de la persona que la creó.

Para sustituir una clave, selecciona **Rotar**. Phaseo crea una clave de sustitución con los mismos límites y te deja elegir cuándo caduca la clave actual: de inmediato, en 1 hora, 24 horas o 7 días, en el momento que elijas o nunca. Pasa tus aplicaciones a la clave nueva antes de que caduque la antigua. También puedes pausar una clave y reanudarla más tarde, o eliminarla definitivamente. Una clave revocada no se puede volver a activar.`,
			quiz: {
				question: "Tu equipo quiere un script nocturno que cree y elimine claves de API. ¿Qué credencial debería usar?",
				options: [
					"Una clave de API normal con un límite de gasto alto.",
					"Una clave de administración con solo las capacidades de claves que necesita.",
					"Una clave de administración con la plantilla Todo, para que nunca falle.",
				],
				answer: 1,
				explanation:
					"Solo las claves de administración pueden llamar a las API de administración; las claves de API normales no pueden. Dale el conjunto de capacidades más reducido que funcione, y reserva Todo para automatizaciones de administración de confianza.",
			},
			scenario: {
				prompt:
					"Un desarrollador te dice que la clave de API de producción se subió a un repositorio público hace una hora. ¿Qué haces?",
				answer:
					"Rota la clave de inmediato y elige que la clave actual caduque al momento. Guarda el nuevo secreto en tu gestor de secretos y actualiza la aplicación. Después revisa las solicitudes de la clave en Ajustes → Registros por si hay algo que no reconoces. Primero rota, después investiga.",
			},
			takeaway:
				"Una clave por aplicación y entorno, cada una con un límite de gasto, hace que las filtraciones sean pequeñas y la rotación sencilla.",
			links: [
				{ label: "Autenticación y claves", href: `${DOCS}/developers/authentication` },
				{ label: "Claves de API de administración", href: `${DOCS}/developers/management-api-keys` },
				{ label: "Claves de API", href: "/settings/keys" },
				{ label: "Seguridad de claves", href: "/settings/security" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "bring-your-own-keys",
			title: "Usa tus propias claves de proveedor",
			summary:
				"Añade las claves de tus propias cuentas de proveedor para que Phaseo enrute las solicitudes con ellas, y decide cuándo pueden tomar el relevo las claves de proveedor de Phaseo.",
			minutes: 8,
			body: `Con **trae tu propia clave (BYOK)**, das a Phaseo una clave de API de tu propia cuenta con un proveedor. Phaseo sigue enrutando y registrando la solicitud, pero llama al proveedor con tu clave, y **tu proveedor factura directamente el uso del modelo**. Se aplican las cuotas, los límites de solicitudes, la política de datos y el acceso a modelos de tu cuenta del proveedor, no la capacidad compartida de Phaseo.

Los propietarios y administradores añaden claves en **Ajustes → Trae tu propia clave**. Elige el proveedor, selecciona **Configurar clave del proveedor** y pega la clave. Phaseo la cifra (AES-256-GCM), la vincula al espacio de trabajo y al proveedor, y no vuelve a mostrarla nunca. Limita cada clave a los modelos y las claves de API que la necesitan, en lugar de dejarla para todos, y usa **Prueba** para probarla en Chat. Cada cambio en una clave de proveedor queda registrado en el registro de auditoría del espacio de trabajo.

Cada clave de proveedor es de uno de estos dos tipos, y puedes arrastrar las claves para cambiar su orden:

- **Priorizado**: Phaseo prueba estas primero, de arriba abajo.
- **Retroceder**: estas actúan como alternativa y solo toman el relevo cuando la ruta de Phaseo no puede completar la solicitud.

Si falla una clave priorizada, el ajuste **Alternativa de BYOK** del espacio de trabajo decide si la solicitud puede reintentarse con las claves de proveedor de Phaseo, pagada con tus créditos. Está activado por defecto. Desactívalo si el uso solo debe pasar por tus propias cuentas de proveedor. Por ahora, los trabajos por lotes usan las claves de Phaseo, no las tuyas.

**Lo que cobra Phaseo:** ninguna comisión de servicio por las primeras 250 000 solicitudes BYOK completadas por espacio de trabajo cada mes UTC, y después el 2,5 % de lo que habría costado la solicitud a precios del proveedor. La comisión se descuenta de tus créditos, así que mantén al menos 1 $ disponible, lo que también cubre cualquier alternativa con las claves de Phaseo. La página muestra las solicitudes BYOK de este mes y cuántas te quedan sin comisión.`,
			quiz: {
				question:
					"Tu espacio de trabajo tiene una clave de OpenAI priorizada y la alternativa de BYOK está desactivada. El proveedor rechaza una solicitud hecha con tu clave. ¿Qué pasa?",
				options: [
					"Phaseo reintenta con sus propias claves de proveedor y lo cobra de tus créditos.",
					"Phaseo cobra una comisión del 2,5 % y reintenta con la misma clave.",
					"La solicitud no se reintenta con las claves de Phaseo, porque la alternativa está desactivada.",
				],
				answer: 2,
				explanation:
					"La alternativa de BYOK decide si una solicitud fallida con una clave priorizada puede reintentarse con las claves de proveedor de Phaseo. Si está desactivada, el uso solo pasa por tus propias cuentas de proveedor.",
			},
			scenario: {
				prompt:
					"Tu empresa ya tiene un contrato de gasto comprometido con un proveedor, y el equipo de finanzas quiere que ese uso se facture allí, no con créditos de Phaseo. Tu equipo envía unas 400 000 solicitudes al mes. ¿Cómo lo configuras y qué seguirá cobrando Phaseo?",
				answer:
					"Añade la clave del proveedor como clave priorizada en Ajustes → Trae tu propia clave, limitada a los modelos y las claves de API que deben usarla. Desactiva la alternativa de BYOK si ningún uso puede pasar por las claves de Phaseo. El proveedor factura el uso del modelo. Phaseo no cobra nada por las primeras 250 000 solicitudes BYOK completadas ese mes, y después el 2,5 % del coste equivalente del proveedor por el resto, pagado con créditos, así que mantén un pequeño saldo.",
			},
			takeaway:
				"BYOK envía las solicitudes a través de tus propias cuentas de proveedor; el ajuste de alternativa decide si las claves de Phaseo pueden intervenir cuando las tuyas fallan.",
			links: [
				{ label: "Consideraciones sobre BYOK", href: `${DOCS}/guides/routing-and-fallbacks#byok-considerations` },
				{ label: "Planes y comisiones de BYOK", href: `${DOCS}/exploring/subscription-plans` },
				{ label: "Trae tu propia clave", href: "/settings/byok" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "budgets-and-spend-rules",
			title: "Presupuestos y reglas de gasto",
			summary:
				"Usa créditos, presupuestos y límites de clave como topes estrictos, y reglas de gasto como avisos tempranos.",
			minutes: 9,
			body: `Los modelos de pago se pagan con el saldo de créditos de tu espacio de trabajo. Lo recargas en **Ajustes → Facturación y créditos**, donde también hay un correo sencillo de aviso de saldo bajo. Los modelos gratuitos no necesitan créditos.

Phaseo tiene dos tipos de tope estricto. Los dos se comprueban en cada solicitud, así que el gasto no puede superarlos:

- **Presupuestos del espacio de trabajo** en **Ajustes → Presupuestos**: un límite diario, semanal, mensual o total para todo el espacio de trabajo. La página muestra el gasto hasta ahora, el porcentaje usado y una previsión.
- **Límites de clave**: límites de solicitudes y de gasto en una clave de API.

Las **reglas de gasto** te avisan antes de llegar a un tope. Abre **Ajustes → Notificaciones → Alertas de gasto** y selecciona **Añadir alerta**. Una regla elige de quién es el gasto que cuenta (el espacio de trabajo, una clave, un miembro, un departamento, un modelo o un proveedor), un periodo y unos umbrales. Puede avisar por el gasto, por un porcentaje de un presupuesto, por una previsión para el periodo, por un pico repentino o por un saldo bajo. Los miembros pueden ver las reglas; los propietarios y administradores las crean y las cambian.

Una regla también puede bloquear las solicitudes cuando el gasto supera un límite. El bloqueo se hace en la medida de lo posible: las reglas se ejecutan sobre el uso registrado unos minutos después de que terminen las solicitudes, así que el gasto puede pasarse un poco del límite antes. Usa presupuestos y límites de clave para topes exactos, y reglas de bloqueo para ámbitos más amplios, como un miembro. Las alertas de gasto y el bloqueo todavía se están desplegando; hasta que se activen para ti, las reglas se guardan pero no se ejecutan.

Para limitar la rapidez con la que alguien puede enviar solicitudes, en lugar de cuánto gasta, usa **Ajustes → Límites de solicitudes**. Una política puede fijar solicitudes por minuto, tokens por minuto o solicitudes simultáneas para una clave, un miembro, un departamento o cada uno de tus usuarios finales. Los guardrails nunca limitan el gasto.`,
			quiz: {
				question: "Necesitas un tope mensual para todo el espacio de trabajo que se compruebe en cada solicitud. ¿Qué usas?",
				options: [
					"Un presupuesto mensual del espacio de trabajo.",
					"Una regla de gasto con la acción de bloqueo.",
					"Un guardrail con un límite de gasto.",
				],
				answer: 0,
				explanation:
					"Los presupuestos del espacio de trabajo y los límites de clave se comprueban en cada solicitud. Una regla de gasto de bloqueo empieza a actuar unos minutos después de superar el límite, y los guardrails no tienen límites de gasto.",
			},
			scenario: {
				prompt:
					"Un nuevo miembro del equipo está experimentando con modelos grandes. Quieres un aviso cuando su gasto mensual llegue a 200 $, y que sus solicitudes se detengan si llega a 250 $. ¿Cómo lo configuras?",
				answer:
					"Añade una regla de gasto limitada a ese miembro, con un periodo mensual, un umbral de alerta de 200 $ y la acción de bloqueo en 250 $. Recuerda que el bloqueo empieza unos minutos tarde. Si necesitas un tope exacto, define también un límite de gasto mensual en las claves que usa.",
			},
			takeaway:
				"Los presupuestos y los límites de clave son tus topes estrictos; las reglas de gasto son el aviso temprano que va antes.",
			links: [
				{ label: "Guía de alertas de gasto", href: `${DOCS}/guides/spend-alerts` },
				{ label: "Límites de clave y presupuestos", href: `${DOCS}/api-reference/limits` },
				{ label: "Presupuestos", href: "/settings/budgets" },
				{ label: "Notificaciones", href: "/settings/notifications" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "guardrails",
			title: "Guardrails",
			summary:
				"Controla a qué proveedores y modelos pueden acceder las claves, cómo se tratan los datos y qué se marca, se oculta o se bloquea.",
			minutes: 9,
			body: `Un guardrail es un conjunto de reglas para el tráfico de la API. Crea uno en **Ajustes → Guardrails → Nuevo guardrail**. Ponle un nombre que describa lo que aplica, como "eu-models-pii-redact", para poder reutilizarlo en varias claves. Un guardrail puede definir:

- **Modo de proveedores**: permitir todos los proveedores, solo los seleccionados o todos excepto los seleccionados.
- **Modo de modelos**: permitir todos los modelos o solo los seleccionados.
- **Manejo de datos**: solo retención de datos cero (ZDR), y si los endpoints que pueden entrenar con las entradas siguen siendo válidos.
- Comprobaciones de **Inyección de prompts** e **Información sensible**, como direcciones de correo, números de teléfono o números de tarjeta. Cada comprobación puede **Marcar**, **Ocultar** o **Bloquear**.

Usa la vista previa para probar una entrada inofensiva, una que debería detenerse y un prompt real antes de guardar. Después asigna el guardrail en **Aplicar a claves**, o en **Aplicar a miembros** para cubrir todas las claves que creen esos miembros. Los miembros no pueden editar ni quitar un guardrail que les haya asignado un propietario o administrador.

Las reglas de **Ajustes → Privacidad** se aplican a todas las solicitudes del espacio de trabajo, y un guardrail solo puede restringirlas más. Cuando varios guardrails se aplican a la misma clave, por ejemplo uno en la clave y otro en su creador, cuentan todos y gana el resultado más estricto. Un modelo debe estar permitido por todos los guardrails, los proveedores bloqueados se suman, ZDR es obligatorio si algún guardrail lo exige, y se usa la acción más fuerte (Bloquear antes que Ocultar, y Ocultar antes que Marcar).

Empieza poco a poco: asigna un guardrail nuevo a una clave de bajo riesgo y revisa **Ajustes → Uso → Actividad de controles de seguridad** y los registros de solicitudes antes de ampliarlo. Un guardrail desactivado conserva sus ajustes, pero no se aplica. Los guardrails no limitan el gasto; para eso usa presupuestos y límites de clave.`,
			quiz: {
				question:
					"El guardrail propio de una clave permite los modelos A y B. El guardrail de miembro de su creador solo permite el modelo B. ¿Qué modelos puede usar la clave?",
				options: ["A y B", "Solo B", "Ninguno, porque los guardrails entran en conflicto"],
				answer: 1,
				explanation:
					"Cuentan todos los guardrails que se aplican a una clave, y gana el más estricto. Un modelo tiene que estar permitido por todos ellos, así que solo queda B.",
			},
			scenario: {
				prompt:
					"Tu equipo legal quiere que se eliminen las direcciones de correo y los números de teléfono de los prompts, y que solo se usen proveedores con retención de datos cero. No quieres romper el bot de soporte mientras lo despliegas. ¿Cuál es tu plan?",
				answer:
					"Crea un guardrail con solo ZDR e Información sensible en Ocultar para correo y teléfono. Pruébalo en la vista previa con un prompt inofensivo, uno sensible y uno real. Asígnalo primero a una clave de staging o de bajo riesgo, revisa Actividad de controles de seguridad y los registros, y después asígnalo a la clave del bot de soporte y a las demás claves que lo necesiten.",
			},
			takeaway:
				"Los guardrails se acumulan: cuenta cada uno que se aplica, así que crea políticas pequeñas con nombres claros y despliégalas clave a clave.",
			links: [
				{ label: "Despliega guardrails", href: `${DOCS}/cookbook/guardrails-for-api-keys` },
				{ label: "Resumen de la API de guardrails", href: `${DOCS}/api-reference/endpoint/guardrails` },
				{ label: "Guardrails", href: "/settings/guardrails" },
				{ label: "Privacidad", href: "/settings/privacy" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "routing-defaults-and-auto-routing",
			title: "Enrutamiento predeterminado, preajustes y enrutamiento automático",
			summary:
				"Define cómo elige proveedores tu espacio de trabajo, comparte configuraciones con preajustes y deja que el enrutamiento automático elija el modelo.",
			minutes: 8,
			body: `La mayoría de los modelos los sirven varios proveedores. En **Ajustes → Enrutamiento** eliges cómo los ordena tu espacio de trabajo por defecto: **equilibrado** (el predeterminado, coste por respuesta correcta), **precio**, **latencia** o **rendimiento**. Una solicitud concreta puede pedir otro modo, pero tus listas de permitidos, tus guardrails y tus precios máximos se siguen aplicando. La misma página tiene interruptores para proveedores beta y alpha, de modo que los proveedores en vista previa solo reciben tráfico si los activas.

Un **preajuste** guarda el modelo, el prompt del sistema, los parámetros y las reglas de proveedor de una tarea con un nombre como "@support-triage". Crea preajustes en **Ajustes → Preajustes**. Las aplicaciones envían el nombre del preajuste en lugar de un modelo, así que puedes cambiar el modelo o el prompt en un solo sitio sin volver a desplegar. Cada **Publicar nueva versión** conserva las anteriores. Apunta una etiqueta como "production" a una versión, y muévela atrás para volver a la anterior.

El **enrutamiento automático** deja que Phaseo elija el modelo de cada solicitud cuando una aplicación envía "phaseo/auto". Está en [Alpha](https://phaseo.app/docs/v1/developers/feature-maturity) y se activa por espacio de trabajo bajo solicitud. En **Ajustes → Enrutamiento → Enrutamiento automático** eliges:

- un **objetivo**: equilibrado, calidad, coste o latencia;
- un **perfil de gasto**: un precio máximo estricto (Económico, Estándar, Premium, Cualquier precio o Personalizado). Los modelos que lo superan nunca se tienen en cuenta;
- patrones de modelo opcionales para acotar la elección, y si se pasa al siguiente modelo cuando hay errores.

Las solicitudes no pueden cambiar estos ajustes, y cada candidato sigue pasando por tus reglas de privacidad y tus guardrails. Comprueba la combinación de modelos con tu propio trabajo, porque los ajustes deciden qué modelos son válidos, no lo buenas que son las respuestas.`,
			quiz: {
				question: "Tu espacio de trabajo usa el enrutamiento automático con el perfil de gasto Económico. ¿Qué hace ese perfil?",
				options: [
					"Fija un precio máximo estricto, así que los modelos que lo superan nunca se tienen en cuenta.",
					"Es una preferencia que una solicitud puede sustituir con su propio objetivo.",
					"Hace que el enrutamiento automático se salte los guardrails para ganar tiempo.",
				],
				answer: 0,
				explanation:
					"Los perfiles de gasto son precios máximos estrictos sobre los precios estándar de texto. Las solicitudes no pueden cambiar el objetivo, el perfil de gasto ni los patrones del espacio de trabajo, y cada candidato sigue pasando por tus guardrails.",
			},
			scenario: {
				prompt:
					"Tres aplicaciones usan el mismo modelo y el mismo prompt del sistema para clasificar tiques. Quieres probar un modelo más nuevo sin pedir a cada equipo que vuelva a desplegar, y deshacerlo rápido si las respuestas empeoran. ¿Qué configuras?",
				answer:
					"Crea un preajuste, por ejemplo @support-triage, y haz que las aplicaciones lo llamen por su nombre. Publica una versión nueva con el modelo más reciente y mueve a ella la etiqueta production. Si las respuestas empeoran, vuelve a mover la etiqueta a la versión anterior.",
			},
			takeaway:
				"Define valores predeterminados razonables para el espacio de trabajo, comparte configuraciones con preajustes y trata el enrutamiento automático como una función Alpha que pruebas con tu propio trabajo.",
			links: [
				{ label: "Enrutamiento y alternativas", href: `${DOCS}/guides/routing-and-fallbacks` },
				{ label: "Guía de preajustes", href: `${DOCS}/guides/presets` },
				{ label: "Guía de enrutamiento automático", href: `${DOCS}/guides/auto-routing` },
				{ label: "Ajustes de enrutamiento", href: "/settings/routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "see-how-ai-is-used",
			title: "Descubre cómo se usa la IA",
			summary:
				"Usa las páginas de uso, los registros, las etiquetas de solicitud, los clasificadores y el registro de auditoría para ver quién gasta qué y quién ha cambiado qué.",
			minutes: 7,
			body: `**Ajustes → Uso** muestra el gasto y el tráfico del espacio de trabajo que tienes abierto, con las páginas Resumen, Tendencias, Explorar, Geografía, Actividad de controles de seguridad y Alertas. **Ajustes → Registros** muestra cada solicitud, con el modelo y el proveedor que la atendieron, además de sesiones, vídeos, lotes y sesiones en tiempo real.

Para repartir el gasto por equipo, función o entorno, pide a tus desarrolladores que añadan **etiquetas de solicitud**, como team=support, a sus solicitudes. Así podrás filtrar los registros y el uso por esas etiquetas. Las etiquetas no se envían a los proveedores. No pongas en ellas prompts, secretos ni datos personales.

Si tus aplicaciones no conocen la categoría, un **clasificador de solicitudes** puede añadir etiquetas por ti. Describes las categorías, como el departamento o el tipo de tarea, y eliges un modelo que etiqueta cada solicitud terminada. Nunca ralentiza la solicitud, y puedes fijar una tasa de muestreo y un presupuesto mensual. Los propietarios y administradores gestionan los clasificadores en **Ajustes → Clasificadores**. Los clasificadores están en **Beta** y se activan por espacio de trabajo bajo solicitud; todo lo demás de esta lección está disponible de forma general. Consulta la [madurez de las funciones](https://phaseo.app/docs/v1/developers/feature-maturity) para saber qué significa.

Los registros muestran el tráfico que se ha ejecutado. El **registro de auditoría** muestra quién ha cambiado los controles que lo rodean. Abre **Ajustes → Actividad** para ver quién creó, rotó o eliminó una clave, cambió el rol de un miembro, editó un guardrail, publicó una versión de un preajuste o levantó un bloqueo de gasto, y cuándo. Solo los propietarios y administradores pueden leerlo. Nunca guarda secretos ni cuerpos de solicitudes.`,
			quiz: {
				question: "El límite de gasto de una clave se subió durante la noche y nadie recuerda haberlo hecho. ¿Dónde miras?",
				options: [
					"En Ajustes → Registros, filtrado por esa clave.",
					"En Ajustes → Uso → Tendencias.",
					"En Ajustes → Actividad, el registro de auditoría del espacio de trabajo.",
				],
				answer: 2,
				explanation:
					"Los registros y el uso muestran las solicitudes que se ejecutaron. Los cambios en claves, miembros, guardrails y otros controles quedan en el registro de auditoría, con quién los hizo y cuándo.",
			},
			scenario: {
				prompt:
					"El equipo de finanzas quiere un desglose mensual del gasto en IA por departamento. Tus aplicaciones no envían etiquetas y los desarrolladores están ocupados durante semanas. ¿Qué puedes hacer?",
				answer:
					"Pide que se activen los clasificadores de solicitudes (están en Beta) y crea uno con una dimensión de departamento, una tasa de muestreo y un presupuesto mensual. Sus respuestas se guardan como etiquetas de solicitud, así que puedes filtrar el uso por departamento. Cuando los desarrolladores tengan tiempo, pueden añadir sus propias etiquetas para una atribución exacta.",
			},
			takeaway:
				"Las etiquetas y los clasificadores explican a dónde va el gasto; el registro de auditoría explica quién ha cambiado qué.",
			links: [
				{ label: "Etiquetas de solicitud", href: `${DOCS}/guides/request-labels` },
				{ label: "Clasificadores de solicitudes", href: `${DOCS}/guides/request-classifiers` },
				{ label: "Registro de auditoría del espacio de trabajo", href: `${DOCS}/guides/workspace-audit-log` },
				{ label: "Uso", href: "/settings/usage/overview" },
			],
			updated: "2026-11-17",
		},
	],
};
