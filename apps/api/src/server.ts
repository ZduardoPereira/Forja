import { createServer } from 'node:http';
import { createApp } from './app';
import { bootstrap } from './bootstrap';
import { userFromToken } from './http/auth';
import { purgeStravaCache } from './modules/strava';
import { attachRealtime } from './services/realtime';
import { startScheduler } from './services/scheduler';

const { deps, handle } = await bootstrap();
const app = createApp(deps);
const server = createServer(app);
const realtime = attachRealtime(server, deps.logger, (token) => userFromToken(deps, token));
deps.realtime = realtime;

// Política do Strava: nada de cache com mais de 7 dias.
const purge = setInterval(() => void purgeStravaCache(deps).catch(() => undefined), 3_600_000);
// Lembretes de treino, lembrete da sequência às 20h e tarefas da virada do dia.
const stopScheduler = startScheduler(deps);

server.listen(deps.config.PORT, deps.config.HOST, () => {
  deps.logger.info({ port: deps.config.PORT, url: deps.config.publicUrl }, 'FORJA no ar');
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  deps.logger.info({ signal }, 'Encerrando');
  clearInterval(purge);
  stopScheduler();
  realtime.close();
  server.close();
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// No Windows não há sinais entre processos. Rodando sob o supervisor do PC (tools/host),
// o pedido de desligar chega pelo canal IPC; se o supervisor sumir, o servidor desliga junto.
if (process.send) {
  process.on('message', (m) => {
    if (m === 'shutdown') void shutdown('supervisor');
  });
  process.on('disconnect', () => void shutdown('supervisor saiu'));
}
