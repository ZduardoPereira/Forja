import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import { z, type ZodType } from 'zod';
import type { Deps } from '../deps';
import { type AuthUser, requireAuth } from './auth';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Out<S> = S extends ZodType ? z.output<S> : undefined;

export interface HandlerCtx<B, Q, P> {
  req: Request;
  res: Response;
  deps: Deps;
  user: AuthUser;
  body: B;
  query: Q;
  params: P;
}

export interface RouteDef<B extends ZodType | undefined, Q extends ZodType | undefined, P extends ZodType | undefined> {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  /** 'user' (padrão), 'admin' ou 'public'. */
  access?: 'user' | 'admin' | 'public';
  body?: B;
  query?: Q;
  params?: P;
  status?: number;
  middleware?: RequestHandler[];
  handler: (ctx: HandlerCtx<Out<B>, Out<Q>, P extends ZodType ? z.output<P> : Record<string, string>>) => Promise<unknown>;
}

interface Op {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  access: 'user' | 'admin' | 'public';
  body?: ZodType;
  query?: ZodType;
  status: number;
}

/** Cada rota é declarada uma vez: gera o handler Express (com validação Zod) e o OpenAPI. */
export class RouteRegistry {
  readonly router = Router();
  readonly ops: Op[] = [];

  constructor(private readonly deps: Deps) {}

  add<B extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined, P extends ZodType | undefined = undefined>(def: RouteDef<B, Q, P>) {
    const access = def.access ?? 'user';
    const status = def.status ?? 200;
    this.ops.push({ method: def.method, path: def.path, tag: def.tag, summary: def.summary, access, body: def.body, query: def.query, status });
    const handlers: RequestHandler[] = access === 'public' ? [] : [requireAuth(this.deps, { admin: access === 'admin' })];
    handlers.push(...(def.middleware ?? []));
    handlers.push(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await def.handler({
          req,
          res,
          deps: this.deps,
          user: (req as Request & { user: AuthUser }).user,
          body: (def.body ? def.body.parse(req.body ?? {}) : undefined) as never,
          query: (def.query ? def.query.parse(req.query) : undefined) as never,
          params: (def.params ? def.params.parse(req.params) : req.params) as never,
        });
        if (res.headersSent) return;
        if (result === undefined) res.status(status === 200 ? 204 : status).end();
        else res.status(status).json(result);
      } catch (err) {
        next(err);
      }
    });
    this.router[def.method](def.path, ...handlers);
  }

  openApi(info: { title: string; version: string; description: string }) {
    const paths: Record<string, Record<string, unknown>> = {};
    const json = (s: ZodType) => z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' });
    for (const op of this.ops) {
      const p = '/v1' + op.path.replace(/:([A-Za-z_]+)/g, '{$1}');
      const parameters: unknown[] = [...op.path.matchAll(/:([A-Za-z_]+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
      if (op.query) {
        const js = json(op.query) as { properties?: Record<string, unknown>; required?: string[] };
        for (const [name, schema] of Object.entries(js.properties ?? {})) parameters.push({ name, in: 'query', required: js.required?.includes(name) ?? false, schema });
      }
      paths[p] ??= {};
      paths[p]![op.method] = {
        tags: [op.tag],
        summary: op.summary + (op.access === 'admin' ? ' (administrador)' : ''),
        security: op.access === 'public' ? [] : [{ bearerAuth: [] }],
        parameters,
        requestBody: op.body ? { required: true, content: { 'application/json': { schema: json(op.body) } } } : undefined,
        responses: { [op.status]: { description: 'Sucesso' }, 400: { $ref: '#/components/responses/Error' }, 401: { $ref: '#/components/responses/Error' } },
      };
    }
    return {
      openapi: '3.1.0',
      info,
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
        responses: { Error: { description: 'Erro: { error: { code, message, details? } }' } },
      },
      paths,
    };
  }
}
