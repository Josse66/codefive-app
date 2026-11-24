# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Técnico de autobuses** (recién egresado o con años de experiencia, diésel o eléctrico) de la red de servicio de Volvo Buses México (Puntos de Servicio Volvo, talleres integrados) o técnico propio de una flota cliente. Usa la app en una **laptop en un aula o centro de capacitación**, sentado y con tiempo: hace su diagnóstico, revisa su mapa de competencias, sigue su ruta y practica.
- **Capacitación y postventa de Volvo**: consulta el desempeño, nivel, errores recurrentes y retención de cada técnico (tablero, en construcción).
- **Jurado del HackaTec Nacional 2026** (miércoles 25 de noviembre de 2026): ve la demo en laptop y proyector, operada por el equipo. 7 min de exposición, 7 de demo, 6 de preguntas.

## Product Purpose

Sistema de entrenamiento adaptativo para técnicos que diagnostican, reparan y mantienen autobuses Volvo (Reto 1 "Técnicos del Mañana"). Diagnostica lo que cada técnico sabe por sistema del autobús, lo entrena solo en lo que le falta y le muestra a Volvo con datos cuándo está listo. Éxito: competencia demostrada y retenida, no cursos terminados.

## Positioning

CodeFive no mide cuánto tiempo se capacitó un técnico: mide qué competencias domina por sistema del autobús, cómo las demuestra con las manos y si las conserva días después, y le muestra a Volvo en tiempo real quién está listo. El nivel es por competencia, no global (un técnico puede ser avanzado en diésel y básico en eléctrico). La confianza declarada detecta al que "cree saber y no sabe".

## Operating Context

- Vocabulario de Volvo: grupos de función 1–9 (1 servicio y mantenimiento, 2 motor, 3 sistema eléctrico, 4 transmisión, 5 frenos, 6 ejes/suspensión/dirección, 7 bastidor/ruedas, 8 carrocería, 9 misceláneos); niveles Level 1 Básico, Level 2 Diseño y función, Level 3 Diagnóstico y reparación; tecnologías diésel y eléctrica.
- Flujo: perfil → diagnóstico adaptativo con confianza → mapa de competencias → ruta personalizada → práctica (microlección, pistas, retroalimentación con fuente) → evaluación diferida simulada → tablero Volvo en vivo.
- Práctica en 3D con pantalla dividida (Three.js) controlada con mouse, cámara (MediaPipe) o guante (ESP32 + MPU-6050), construida por el equipo de hardware.

## Capabilities and Constraints

- Stack obligatorio (lo evalúa un profesor): Node.js + Express (ES Modules), Handlebars, Vite, Tailwind CSS 3, Winston + Morgan, ESLint Airbnb + Prettier. Base de datos SQLite integrada en Node. Socket.IO para tiempo real.
- Debe funcionar sin internet en la demo (salvo el tutor IA opcional).
- Modelos: BKT por competencia, Elo para dificultad, curva de olvido, reglas de ruta. Umbrales del prototipo: dominada ≥ 80 %, en desarrollo ≥ 40 %.
- Seguridad de alto voltaje: la app no enseña maniobras reales de desconexión ni puntos de prueba; los errores críticos bloquean y escalan.

## Brand Commitments

- Debe sentirse como una **herramienta de Volvo** (decisión del equipo), pero **sin usar el logotipo, la tipografía propietaria ni activos oficiales de Volvo**. "CodeFive" es el equipo que la construye.
- Voz: español de México, directo, en lenguaje de taller.
- Impresión buscada: herramienta técnica seria y confiable en el uso diario, con momentos que muestran la tecnología (mapa de competencias, 3D, tablero en vivo). Nada infantil ni de videojuego.

## Evidence on Hand

- Técnicos ficticios de demostración (`data/tecnicos.json`): Ana Ruiz, Luis Mendoza, Marco Pérez, Sofía Torres. Deben presentarse como datos ficticios.
- 12 competencias, 24 preguntas y 12 microlecciones con fuentes públicas (ASE xEV v2.1, Bendix BW1231, Cummins, Bosch, NOM-029-STPS, Volvo Buses México).
- No hay testimonios, clientes, cifras de ahorro ni resultados de piloto reales: no inventarlos.

## Product Principles

1. Competencia demostrada sobre curso terminado.
2. Seguridad primero: un error crítico no se compensa con puntaje.
3. Ayuda que se retira: guiado → con pistas → autónomo.
4. Todo dato con su fuente; lo simulado se dice simulado.
5. El núcleo funciona con mouse; cámara y guante suman, no condicionan.
