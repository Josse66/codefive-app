// Borra todos los datos y vuelve a cargar la semilla. Uso: npm run db:reset
import db from '#db/conexion.js';
import { sembrar, sembrarCuentas, sembrarEvaluacion } from '#db/semilla.js';
import logger from '#config/logger.js';

db.exec(`
  DELETE FROM sesiones;
  DELETE FROM cuentas;
  DELETE FROM lecciones_vistas;
  DELETE FROM ordenes;
  DELETE FROM evaluaciones;
  DELETE FROM eventos;
  DELETE FROM dominio;
  DELETE FROM preguntas;
  DELETE FROM tecnicos;
  DELETE FROM competencias;
  DELETE FROM sqlite_sequence;
`);
sembrar(db);
sembrarEvaluacion(db);
sembrarCuentas(db);
db.close();
logger.info('Base de datos reiniciada');
