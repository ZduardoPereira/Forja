import { workoutFromRoutine } from '@/components/workout';
import { ApiError, session, uploadImage } from '@/lib/api';
import type { Routine } from '@/lib/types';
import { parseInput } from '@/lib/workout';

const mockUpload = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, upload: (...args: unknown[]) => mockUpload(...args) })),
  Paths: { document: {} },
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

describe('envio de foto pelo app (Android/iPhone)', () => {
  beforeEach(async () => {
    mockUpload.mockReset();
    await session.setServer('https://forja.exemplo.ts.net');
    await session.setToken('token-abc');
  });

  it('usa o envio nativo em multipart, com o tipo da foto e o login', async () => {
    mockUpload.mockResolvedValue({ status: 201, body: JSON.stringify({ id: 'f1', url: '/v1/files/f1/full', thumbUrl: '/v1/files/f1/thumb', width: 10, height: 10 }), headers: {} });
    const f = await uploadImage('file:///cache/foto.jpg', 'body', 'image/jpeg');
    expect(f.id).toBe('f1');
    expect(mockUpload).toHaveBeenCalledWith('https://forja.exemplo.ts.net/v1/files', {
      httpMethod: 'POST',
      uploadType: 1,
      fieldName: 'file',
      mimeType: 'image/jpeg',
      parameters: { kind: 'body' },
      headers: { Accept: 'application/json', Authorization: 'Bearer token-abc' },
    });
  });

  it('mostra a mensagem do servidor quando a foto é recusada', async () => {
    mockUpload.mockResolvedValue({ status: 400, body: JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Arquivo não é uma imagem válida' } }), headers: {} });
    await expect(uploadImage('file:///cache/x.jpg', 'body')).rejects.toMatchObject({ status: 400, message: 'Arquivo não é uma imagem válida' });
  });

  it('sem internet vira erro de conexão (e não trava a tela)', async () => {
    mockUpload.mockRejectedValue(new Error('timeout'));
    const err = await uploadImage('file:///cache/x.jpg', 'chat').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK');
  });
});

describe('assistente de treino', () => {
  it('monta o treino a partir da rotina (séries vazias e descanso da rotina)', () => {
    const routine = {
      id: 'r1',
      name: 'Peito e tríceps',
      ownerId: 'u1',
      planKey: null,
      planName: null,
      description: null,
      exercises: [
        { id: 'ex1', namePt: 'Supino reto', nameEn: '', bodyPart: null, equipment: null, target: null, category: null, position: 0, sets: 4, reps: '8-12', restSec: 120, notes: null },
        { id: 'ex2', namePt: 'Tríceps corda', nameEn: '', bodyPart: null, equipment: null, target: null, category: null, position: 1, sets: 3, reps: '12', restSec: null, notes: null },
      ],
    } satisfies Routine;
    const w = workoutFromRoutine(routine);
    expect(w).toMatchObject({ title: 'Peito e tríceps', routineId: 'r1', kind: 'strength', rest: null });
    expect(w.exercises.map((e) => [e.name, e.sets.length, e.restSec, e.target])).toEqual([
      ['Supino reto', 4, 120, '8-12'],
      ['Tríceps corda', 3, 90, '12'],
    ]);
    expect(workoutFromRoutine(null)).toMatchObject({ title: 'Treino livre', routineId: null, exercises: [] });
  });

  it('lê peso e repetições digitados com vírgula', () => {
    expect(parseInput('62,5')).toBe(62.5);
    expect(parseInput(' 10 ')).toBe(10);
    expect(parseInput('')).toBeNull();
    expect(parseInput('abc')).toBeNull();
  });
});
