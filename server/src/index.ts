import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { createAgentRouter } from './routes/agent.js';

dotenv.config();

const app = express();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()).filter(Boolean) : true,
    credentials: false,
    allowedHeaders: ['content-type', 'x-demo-api-key']
  })
);
app.use(express.json({ limit: '1mb' }));

app.use('/api', createAgentRouter());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 8787);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
