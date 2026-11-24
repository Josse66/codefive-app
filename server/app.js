import express from 'express';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/', (_req, res) => {
  res.send('CodeFive · Técnicos del Mañana');
});

app.get('/api/salud', (_req, res) => {
  res.json({ ok: true, servicio: 'codefive-app' });
});

export default app;
