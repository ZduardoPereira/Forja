import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Deps } from './deps';
import { errorHandler } from './http/errors';
import { createLimiters } from './http/rate-limit';
import { RouteRegistry } from './http/registry';
import { accountRoutes } from './modules/account';
import { bodyRoutes } from './modules/body';
import { chatRoutes } from './modules/chat';
import { competitionRoutes } from './modules/competitions';
import { dietRoutes } from './modules/diet';
import { eventRoutes } from './modules/events';
import { fileRoutes } from './modules/files';
import { homeRoutes } from './modules/home';
import { stravaRoutes } from './modules/strava';
import { testRoutes } from './modules/tests';
import { trainingRoutes } from './modules/training';

export const VERSION = '2.0.0';

export function buildRegistry(deps: Deps) {
  const limiters = createLimiters(deps);
  const r = new RouteRegistry(deps);
  accountRoutes(r, limiters);
  fileRoutes(r, limiters);
  homeRoutes(r);
  bodyRoutes(r);
  dietRoutes(r);
  trainingRoutes(r);
  eventRoutes(r);
  testRoutes(r);
  stravaRoutes(r);
  chatRoutes(r, limiters);
  competitionRoutes(r);
  return { registry: r, limiters };
}

export function openApiDocument(r: RouteRegistry) {
  return r.openApi({
    title: 'FORJA API',
    version: VERSION,
    description: 'API privada do grupo. Rotas privadas exigem `Authorization: Bearer <token>`. Erros: `{ error: { code, message, details? } }`.',
  });
}

export function createApp(deps: Deps) {
  const app = express();
  app.disable('x-powered-by');
  if (deps.config.TRUST_PROXY) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // react-native-web injeta estilos inline.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          // blob:/data: = imagem escolhida no navegador antes do envio.
          connectSrc: ["'self'", 'ws:', 'wss:', 'blob:', 'data:'],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  const origins = deps.config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  // Em produção o app web é servido pelo próprio servidor (mesma origem); CORS só para o modo de desenvolvimento.
  app.use('/v1', cors({ origin: deps.config.NODE_ENV === 'production' ? false : origins }));
  app.use(express.json({ limit: '256kb' }));
  if (deps.config.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger: deps.logger, serializers: { req: (req) => ({ method: req.method, url: String(req.url).split('?')[0] }), res: (res) => ({ statusCode: res.statusCode }) } }));
  }
  const { registry, limiters } = buildRegistry(deps);
  const doc = openApiDocument(registry);
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION, strava: deps.strava.configured });
  });
  app.get('/v1/openapi.json', (_req, res) => {
    res.json(doc);
  });
  app.use('/v1', limiters.global, registry.router);
  app.use('/v1', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } });
  });

  // App web (PC/celular pelo navegador): arquivos estáticos + volta para index.html nas rotas do app.
  const web = deps.config.WEB_DIST;
  if (existsSync(path.join(web, 'index.html'))) {
    app.use(express.static(web, { index: false, maxAge: '1h', setHeaders: (res, p) => p.endsWith('sw.js') && res.setHeader('Cache-Control', 'no-cache') }));
    app.get(/^(?!\/v1\/|\/ws).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(web, 'index.html'));
    });
  }
  app.use(errorHandler(deps.logger));
  return app;
}
