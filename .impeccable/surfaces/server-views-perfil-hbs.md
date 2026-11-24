---
version: 1
slug: "server-views-perfil-hbs"
primary_target: "server/views/perfil.hbs"
related_targets: ["server/views/layouts/main.hbs","server/views/inicio.hbs","server/views/diagnostico.hbs","server/views/ruta.hbs","server/views/practica.hbs"]
---

# Surface: app del técnico (inicio, diagnóstico, competencias, ruta, práctica)

Mode: operate. Audiencia: técnico en laptop en aula de capacitación; jurado del HackaTec en proyector. Tarea: diagnosticarse, ver su mapa por grupo de función, seguir su ruta y practicar. Restricciones: stack Express + Handlebars + Tailwind 3 + Vite; sin internet en la demo; sin logo ni activos de Volvo.

Momento memorable: el autobús dibujado como lámina del manual con los recuadros 1–9 encendidos por estado.

## Direction contract

THESIS: El mapa de competencias del técnico es la lámina de grupos de función del manual de servicio: el autobús en línea con recuadros de referencia numerados. Rechaza el dashboard de capacitación con tarjetas iguales y barras de progreso.

OWN-WORLD: Fondo de papel técnico gris acero claro; tinta azul negra en barra superior, líneas y texto; rojo de recuadro de referencia solo para números de grupo y alertas críticas; naranja de alto voltaje solo para lo eléctrico de 600 V; verde, ámbar y rojo de estado. Archivo en ancho condensado para títulos y códigos, ancho normal para lectura. Tablas de partes con reglas de 1 px y cifras tabulares; códigos de competencia (E3-2-SEG) como número de parte. Sin sombras de tarjeta ni esquinas redondeadas grandes.

STORY: El técnico ve su autobús, entiende su nivel por grupo, toma la siguiente pieza de su ruta y la practica con su fuente; sabe en todo momento qué es obligatorio por seguridad.

FIRST VIEWPORT: Perfil a 1440: barra tinta de 56 px con nombre de la herramienta, secciones (Diagnóstico, Competencias, Ruta) y técnico activo a la derecha. Izquierda, dos tercios: título, la lámina SVG del autobús a ancho completo con recuadros 1–9 coloreados por estado y leyenda. Derecha, un tercio: tabla de partes del grupo seleccionado, alerta de seguro pero equivocado y botón primario Practicar. Interacción firma: seleccionar un recuadro cambia la tabla sin recargar.

FORM: Lámina de despiece del manual de servicio, posición 4 de mi lista ordenada. seed:99feae7e8164c1b1. Raises: siguiente decisión en grande en la ruta (señalética amarilla); acciones críticas aisladas (consola); antes, después y diferida a la misma escala (folio botánico); código de competencia como identificador (catálogo); cifras tabulares (campo de datos).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
