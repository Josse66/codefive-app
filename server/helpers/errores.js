// Error con código HTTP; el manejador de errores de app.js lo convierte en respuesta.
export function errorHttp(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}
