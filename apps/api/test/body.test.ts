import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type Ctx, register, upload, type User } from './helpers';

let ctx: Ctx;
let ana: User;
let bia: User;
beforeAll(async () => {
  ctx = await createTestContext();
  ana = await register(ctx, 'Ana');
  bia = await register(ctx, 'Bia');
});
afterAll(async () => {
  await ctx.handle.close();
});

describe('imagens', () => {
  it('remove metadados (GPS) e redimensiona; URL é assinada', async () => {
    const f = await upload(ctx, ana);
    const img = await ctx.api().get(f.url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/webp');
    const meta = await sharp(img.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    const tampered = f.url.replace(/sig=[^&]+/, 'sig=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect((await ctx.api().get(tampered)).status).toBe(404);
  });

  it('recusa arquivo que não é imagem', async () => {
    const res = await ctx.api().post('/v1/files').set(ana.auth).field('kind', 'body').attach('file', Buffer.from('não sou imagem'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  it('não deixa anexar a foto de outra pessoa', async () => {
    const f = await upload(ctx, ana);
    const res = await ctx.api().post('/v1/body/weigh-ins').set(bia.auth).send({ date: '2026-11-03', weightKg: 60, photoFileIds: [f.id] });
    expect(res.status).toBe(400);
  });
});

describe('corpo', () => {
  it('pesagem com foto e avaliação do nutricionista com composição derivada', async () => {
    const f = await upload(ctx, ana);
    await ctx.api().post('/v1/body/weigh-ins').set(ana.auth).send({ date: '2026-11-01', weightKg: 72.4, note: 'em jejum', photoFileIds: [f.id] }).expect(201);
    const report = await upload(ctx, ana, 'assessment');
    const a = await ctx
      .api()
      .post('/v1/body/assessments')
      .set(ana.auth)
      .send({ date: '2026-11-02', method: 'bioimpedance', professional: 'Dra. Carla', weightKg: 72, bodyFatPct: 25, visceralFat: 6, waistCm: 80, fileIds: [report.id] });
    expect(a.status).toBe(201);
    await ctx.api().patch('/v1/me').set(ana.auth).send({ heightCm: 165 }).expect(200);
    const body = await ctx.api().get('/v1/body').set(ana.auth);
    expect(body.body.weighIns[0].photos).toHaveLength(1);
    const assessment = body.body.assessments[0];
    expect(assessment.composition).toMatchObject({ fatMassKg: 18, leanMassKg: 54, derived: ['fatMassKg', 'leanMassKg'] });
    expect(assessment.attachments).toHaveLength(1);
    expect(body.body.latest.weight).toMatchObject({ date: '2026-11-02', weightKg: 72 });
    expect(body.body.latest.bmi).toBe(26.4);
  });

  it('valida avaliação incoerente', async () => {
    const res = await ctx.api().post('/v1/body/assessments').set(ana.auth).send({ date: '2026-11-02', weightKg: 60, leanMassKg: 70 });
    expect(res.status).toBe(400);
  });

  it('privacidade: números só com "mostrar ao grupo"; fotos só as marcadas como Grupo', async () => {
    const privateView = await ctx.api().get('/v1/body').query({ userId: ana.id }).set(bia.auth);
    expect(privateView.body).toMatchObject({ numbersVisible: false, weighIns: [], assessments: [] });
    expect(privateView.body.photos).toEqual([]);
    const f = await upload(ctx, ana);
    const photo = await ctx.api().post('/v1/body/photos').set(ana.auth).send({ fileId: f.id, date: '2026-11-04', caption: 'antes', visibility: 'group' });
    expect(photo.status).toBe(201);
    const withPhoto = await ctx.api().get('/v1/body').query({ userId: ana.id }).set(bia.auth);
    expect(withPhoto.body.photos.map((p: { caption: string }) => p.caption)).toEqual(['antes']);
    await ctx.api().patch('/v1/me').set(ana.auth).send({ shareBody: true }).expect(200);
    const shared = await ctx.api().get('/v1/body').query({ userId: ana.id }).set(bia.auth);
    expect(shared.body.numbersVisible).toBe(true);
    expect(shared.body.weighIns.length).toBeGreaterThan(0);
    // Bia não altera nem apaga fotos da Ana.
    expect((await ctx.api().patch(`/v1/body/photos/${photo.body.id}`).set(bia.auth).send({ visibility: 'private' })).status).toBe(404);
    expect((await ctx.api().delete(`/v1/body/photos/${photo.body.id}`).set(bia.auth)).status).toBe(403);
    await ctx.api().delete(`/v1/body/photos/${photo.body.id}`).set(ana.auth).expect(204);
    expect((await ctx.api().get(photo.body.file.url)).status).toBe(404);
  });
});

describe('dieta', () => {
  it('plano do nutricionista é privado e só um fica ativo', async () => {
    const p1 = await ctx
      .api()
      .post('/v1/diet')
      .set(ana.auth)
      .send({ title: 'Plano outubro', professional: 'Dra. Carla', caloriesKcal: 1800, proteinG: 140, meals: [{ name: 'Café da manhã', time: '07:00', items: '2 ovos\n1 pão integral' }] });
    expect(p1.status).toBe(201);
    await ctx.api().post('/v1/diet').set(ana.auth).send({ title: 'Plano novembro', caloriesKcal: 1700 }).expect(201);
    const mine = await ctx.api().get('/v1/diet').set(ana.auth);
    expect(mine.body.map((p: { title: string; active: boolean }) => [p.title, p.active])).toEqual([
      ['Plano novembro', true],
      ['Plano outubro', false],
    ]);
    expect((await ctx.api().get('/v1/diet').set(bia.auth)).body).toEqual([]);
    expect((await ctx.api().put(`/v1/diet/${p1.body.id}`).set(bia.auth).send({ title: 'hack' })).status).toBe(404);
  });
});
