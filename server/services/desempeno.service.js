import db from '#db/conexion.js';
import { obtenerCarrera } from '#services/carrera.service.js';

// Mi desempeño: las métricas del técnico, cada una con una frase que dice qué significa para él.
// Todo sale de la bitácora de eventos, de las evaluaciones y de las órdenes del Taller.

const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : null);
// Color de la tarjeta: sin dato es neutro; si no, bueno u otro tono.
function tono(valor, esBueno, siNo = 'med') {
  if (valor == null) return 'neutro';
  return esBueno ? 'ok' : siNo;
}
// Texto del valor: sin dato muestra el aviso.
const mostrar = (valor, texto, sinDato) => (valor == null ? sinDato : texto);

export function obtenerDesempeno(tecnicoId) {
  const carrera = obtenerCarrera(tecnicoId);
  const ids = new Set(
    carrera.grupos.flatMap((g) => g.niveles.flatMap((n) => n.competencias.map((c) => c.id))),
  );

  const practica = db
    .prepare(
      `SELECT COUNT(*) AS intentos, COALESCE(SUM(correcta), 0) AS aciertos, COALESCE(SUM(critico), 0) AS criticos
       FROM eventos WHERE tecnico_id = ? AND fase = 'practica'`,
    )
    .get(tecnicoId);

  // Evaluaciones por competencia (solo las de su autobús): antes, después y diferida.
  const evaluaciones = db
    .prepare('SELECT competencia_id, fase, p_saber FROM evaluaciones WHERE tecnico_id = ? ORDER BY id')
    .all(tecnicoId)
    .filter((e) => ids.has(e.competencia_id));
  const porCompetencia = new Map();
  evaluaciones.forEach((e) => {
    const m = porCompetencia.get(e.competencia_id) ?? {};
    m[e.fase] = e.p_saber;
    porCompetencia.set(e.competencia_id, m);
  });
  const ganancias = [...porCompetencia.values()].filter((m) => m.pre != null && m.post != null);
  const retenciones = [...porCompetencia.values()].filter((m) => m.post && m.diferida != null);
  const promedio = (lista) => (lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : null);

  const ordenes = db
    .prepare(
      `SELECT COUNT(*) AS n, AVG(segundos) AS segundos, COALESCE(SUM(gasto), 0) AS gasto,
              COALESCE(SUM(gasto_necesario), 0) AS necesario, AVG(estrellas) AS estrellas
       FROM ordenes WHERE tecnico_id = ? AND estado = 'entregada'`,
    )
    .get(tecnicoId);

  const ganancia = promedio(ganancias.map((m) => m.post - m.pre));
  const retencion = promedio(retenciones.map((m) => Math.min(1, m.diferida / m.post)));
  const precision = porcentaje(practica.aciertos, practica.intentos);
  const sobrecosto = ordenes.necesario
    ? Math.round(((ordenes.gasto - ordenes.necesario) / ordenes.necesario) * 100)
    : null;

  const metricas = [
    {
      nombre: 'Competencias aprobadas',
      valor: `${carrera.dominadas} de ${carrera.total}`,
      texto: 'Las que ya dominas con 91 o más, la calificación mínima de Volvo.',
      tono: carrera.dominadas ? 'ok' : 'neutro',
    },
    {
      nombre: 'Precisión al practicar',
      valor: precision == null ? 'Sin práctica' : `${precision} %`,
      texto:
        'De cada 100 acciones en el autobús, cuántas hiciste bien. Mide si lo sabes hacer, no solo decir.',
      tono: tono(precision, precision >= 80),
    },
    {
      nombre: 'Errores críticos de seguridad',
      valor: String(practica.criticos),
      texto:
        'Acciones que en un taller real lastiman a alguien. La meta es cero; cada uno detiene la práctica.',
      tono: tono(practica.intentos ? practica.criticos : null, !practica.criticos, 'mal'),
    },
    {
      nombre: 'Lo que aprendiste',
      valor: mostrar(ganancia, `${Math.round(ganancia * 100)} puntos`, 'Aún no'),
      texto: 'Cuánto subiste entre "¿Qué sabes?" y "Comprueba" en tus misiones.',
      tono: tono(ganancia, ganancia > 0),
    },
    {
      nombre: 'Lo que retienes',
      valor: retencion == null ? 'Aún no' : `${Math.round(retencion * 100)} %`,
      texto: 'Qué tanto conservas a los 7 días sin practicar. Abajo de 80 % toca repaso.',
      tono: tono(retencion, retencion >= 0.8),
    },
    {
      nombre: 'Órdenes del Taller',
      valor: ordenes.n ? `${ordenes.n} · ${Math.round(ordenes.segundos / 60)} min promedio` : 'Ninguna aún',
      texto: 'Órdenes de clientes que ya entregaste y cuánto tardas en cada una.',
      tono: 'neutro',
    },
    {
      nombre: 'Refacciones de más',
      valor: mostrar(sobrecosto, sobrecosto > 0 ? `+${sobrecosto} %` : 'Ninguna', '—'),
      texto: 'Si cambias piezas que no hacían falta, el cliente paga de más: un buen diagnóstico evita esto.',
      tono: tono(sobrecosto, sobrecosto <= 0),
    },
  ];

  return {
    carrera,
    metricas,
    repasar: [...carrera.resumen.alertas, ...carrera.resumen.seguridad, ...carrera.resumen.brechas]
      .filter((n, i, lista) => lista.indexOf(n) === i)
      .slice(0, 4),
  };
}
