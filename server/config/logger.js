import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const carpetaLogs = path.resolve('logs');
fs.mkdirSync(carpetaLogs, { recursive: true });

const formatoConsola = printf(({ level, message, timestamp: hora, stack }) => `${hora} ${level}: ${stack ?? message}`);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })),
  transports: [
    new winston.transports.Console({ format: combine(colorize(), formatoConsola) }),
    new winston.transports.File({ filename: path.join(carpetaLogs, 'error.log'), level: 'error', format: json() }),
    new winston.transports.File({ filename: path.join(carpetaLogs, 'app.log'), format: json() }),
  ],
  exceptionHandlers: [new winston.transports.File({ filename: path.join(carpetaLogs, 'exceptions.log') })],
  rejectionHandlers: [new winston.transports.File({ filename: path.join(carpetaLogs, 'rejections.log') })],
});

// Morgan escribe cada petición HTTP a través de Winston.
export const streamHttp = {
  write: (mensaje) => logger.http(mensaje.trim()),
};

export default logger;
