# Prograd

App de gimnasio de Manuel para iPhone: rutinas, registro de series (kg × reps), progresión automática, racha semanal, rangos por músculo, medidas con ajuste del batido y recordatorios. La usan él y unos amigos, cada uno con sus datos en su propio móvil.

- Web en vivo: https://manujsg11-dotcom.github.io/Prograd/ (GitHub Pages, rama principal, raíz del repo).
- Manuel habla español: responde en español y toda la interfaz va en español.
- No es programador: explica las cosas en lenguaje sencillo, sin jerga, y dile qué tiene que hacer él (si tiene que hacer algo) paso a paso.

## Archivos
- Se trabaja en `C:\Users\Desktop-PC\Desktop\Prograd`, que es una copia del repositorio conectada a GitHub. El `index.html` suelto del Escritorio es una versión **antigua**: no usarla. Antes de cambiar nada, hacer `git pull` por si Manuel ha subido algo a mano desde la web.
- `index.html`: la app entera en un solo archivo (unos 500 KB). React 18 (UMD) + `htm` (plantillas `html\`...\``, sin JSX ni compilación) + Tailwind **ya compilado e incrustado**. Fuentes Barlow y Barlow Condensed incrustadas en base64 (OFL).
- `sw.js`: service worker. `index.html` va con red primero (si hay internet, siempre la última versión); iconos y manifiesto con caché. Cambiar `VERSION` solo si cambian iconos o manifiesto. También recibe los avisos push y pide el texto a `/mensaje` del servidor.
- `manifest.webmanifest`, `icono-prograd-v3.png`, `icons/` (180/192/512).
- `worker/prograd-avisos.js`: **copia de referencia** del servidor de avisos (Cloudflare Worker). Lo que funciona de verdad es lo que Manuel tiene pegado en Cloudflare; si lo cambias, dile que lo pegue en el panel de Cloudflare.

## Reglas de trabajo
- **Nunca romper los datos de quien ya usa la app.** Todo vive en `localStorage` de cada móvil. Claves: `gym-notes-v1` (rutinas/días con su historial), `gym-cfg` (ajustes), `gym-meas` (medidas) y otras `gym-*`. Cualquier cambio de formato necesita migración compatible.
- Cuando Manuel diga «que a mí no me cambie, solo a los nuevos»: se distingue con `BOOT_OLD` (el móvil ya tenía datos al arrancar) y se guarda la decisión en `cfg` (ejemplo: `cfg.shake`).
- Tailwind va precompilado: **una clase nueva que no esté ya en el CSS no hace nada**. Usa estilos en línea (`style=${{...}}`) o clases que ya existan.
- `<link rel="icon">` lleva un SVG en data URI con `>` dentro: si lo buscas con expresiones regulares, usa `href="[^"]*"`.
- Probar siempre antes de subir: abrir `index.html` con Playwright/Chromium a 390×844, recorrer las 4 pestañas (los botones de `nav`), crear un día nuevo y comprobar que no hay errores en consola. Mejor probar con datos de ejemplo metidos en `localStorage`.
- **Antes de subir nada a GitHub, enséñale una versión de prueba**: copia `index.html` a `prueba.html` (con `<title>Prograd · Prueba</title>`) y publícala en el mismo artefacto de siempre, https://claude.ai/artifact/LRLQYeTYTYAudFDBWgonvm (con `url` si es otra conversación). Solo se sube cuando Manuel da el visto bueno. `prueba.html` no se sube al repositorio. En la prueba sus datos no están (puede importar su copia de seguridad) y el botón de exportar no descarga.
- Sube cada cambio con un commit claro en español. Si el cambio es grande o arriesgado, propón primero una rama y que Manuel lo pruebe.
- La app tiene constantes como `PUSH_SERVER='https://prograd-avisos.manujsg11.workers.dev'` ya puestas en esta versión; no las borres.

## Estilo (decidido por Manuel)
- Oscuro, monocromo, estilo iOS, para usar con una mano; acento lima `#C6F432`; Barlow para texto y Barlow Condensed para cifras y títulos (clase `.ch` en cabeceras de tarjeta). Nada recargado, animaciones suaves tipo iOS.
- Barra inferior de cristal con 4 pestañas: Inicio, Progresión, Medidas, Ajustes.
- La capa de «pulido» del 27 oct ya está aplicada (cabeceras `.ch`, botones secundarios en píldora, foco y selección en lima).
- Se deja a propósito la etiqueta «Ejercicio» encima de cada ejercicio, la barra de cristal y la llama de la racha.

## Cómo funciona (lo importante)
- **Días y rutinas:** cada día es una nota con `title` («Nombre del día») y `tags`; la primera etiqueta es la **rutina** (campo obligatorio «Rutina» al crear). En Inicio se fijan rutinas arriba («Hoy toca», rotando días). Instalaciones nuevas empiezan sin rutinas; la primera que crean se fija sola. Manuel tiene sus «Rutina A» y «Rutina C».
- **Progresión (doble progresión):** cada ejercicio tiene objetivo `tgt` = {s series, lo–hi reps, inc kg, big}. Si no lo tiene, `tgtOf(b)` da uno por defecto: sus series, 8–12 reps, +2,5 kg en básicos y máquinas, +1 kg en mancuernas y aislados, +1,25 kg en lastrados. «Quitar objetivo» pone `noTgt`. Todas las series al máximo de reps → sube; por debajo del mínimo dos sesiones seguidas con el mismo peso → baja un 10 %; si no, mantiene y suma reps. Al terminar el entreno se rellena el peso siguiente. Semana de descarga: mitad de series y −10 %.
- **Rangos por músculo (estilo Valorant: Hierro → Radiante, 3 divisiones):** mejor 1RM estimado (Epley) ÷ peso corporal (el de Medidas; si no hay, 75 kg). Tabla `STD` con [principiante, élite] por ejercicio. Escala común `LVL`: principiante ≈ Hierro 3, novato ≈ Plata, intermedio ≈ Oro, avanzado ≈ Diamante, élite = Radiante. Dominadas y fondos suman el peso corporal al lastre. Respeta los músculos ajustados a mano (`b.mu`). Si un ejercicio tiene dos músculos principales, el segundo cuenta al 85 %. Los nombres de rango son de Valorant: si algún día la app se vende, hay que cambiarlos.
- **Icono de rango (`RankBadge`):** disco dodecágono de 10 kg (opción A elegida por Manuel): borde y estampado del color del rango, la división (1–3) estampada donde pondría «10KG» (en tamaño grande, con abreviatura del rango); Radiante con brillo dorado y estrella en el centro.
- **Mapa de rangos:** silueta negra con contorno blanco y músculos de color separados por líneas blancas (datos en `BODY`, frente y espalda, recortados con `clipPath`).
- **Medidas y batido:** cada 2 semanas peso y cintura; la app recomienda subir o bajar el batido por niveles (−2…+2). Manuel tiene su receta fija (`cfg.shake='legacy'`). Las instalaciones nuevas configuran la suya por ingredientes (`cfg.recipe`), con ajuste de ±120 kcal por nivel tocando hidratos y grasa (nunca la proteína ni la creatina), o eligen «No tomo batido» y la app les habla en calorías.
- **Avisos:** el usuario elige hora y días; el servidor (Cloudflare Worker gratis, KV `AVISOS`, cron cada minuto) manda un aviso vacío y el service worker pide el texto («Hoy toca …», última marca, racha). No avisa si ya entrenó. Rutas: `/clave`, `/suscribir`, `/mensaje-nuevo`, `/mensaje`, `/comprobar`, `/baja`, `/prueba`, `/estado`. La app se vuelve a apuntar sola si el servidor la pierde.
- **Ajustes:** copia de seguridad (exportar/importar JSON), avisos y un atajo opcional del iPhone para el descanso (Manuel no quiere temporizador dentro de la app).

## Decisiones ya tomadas
- Descartado: clasificaciones entre amigos, vídeos o imágenes de técnica, fotos de progreso con IA, anuncios, suscripción, temporizador propio y (de momento) un cuestionario de bienvenida.
- Gratis; como mucho, una donación voluntaria en el futuro.

## Pendiente
1. **Copia en la nube con cuenta (lo siguiente):** Firebase, plan gratuito Spark, sin tarjeta. Inicio de sesión con email y contraseña (Google solo si funciona bien con la app instalada en la pantalla de inicio del iPhone, que suele fallar). La cuenta es **opcional**: sin cuenta todo sigue como ahora. **Solo los emails que Manuel autorice** pueden usar la nube, comprobado en las reglas de seguridad de Firestore (no en la app), para que si entra mucha gente no se gaste el cupo ni le perjudique. Guardado automático agrupando cambios (no en cada toque), un documento por rutina (límite de 1 MB por documento), y la exportación manual se mantiene. Manuel tendrá que crear el proyecto de Firebase: guíale paso a paso.
2. Ideas opcionales: insignias y logros, retos mensuales.
