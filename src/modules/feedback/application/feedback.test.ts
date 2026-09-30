import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFeedback } from './feedback';
import type { FeedbackRepository } from './ports';

const repo = {
  saveFeedback: vi.fn<FeedbackRepository['saveFeedback']>(async () => {}),
  saveReport: vi.fn<FeedbackRepository['saveReport']>(async () => 'ok'),
};
const feedback = makeFeedback(repo);
const PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => vi.clearAllMocks());

describe('send', () => {
  it('guarda el mensaje sin espacios en los bordes y lo que falta como null', async () => {
    await feedback.send({ userId: null, message: '  Muy buena  \n' });
    expect(repo.saveFeedback).toHaveBeenCalledWith({ userId: null, message: 'Muy buena', appVersion: null, platform: null });
  });

  it('pasa el usuario, la versión y la plataforma', async () => {
    await feedback.send({ userId: 'u1', message: 'Hola', appVersion: '1.2.0', platform: 'android' });
    expect(repo.saveFeedback).toHaveBeenCalledWith({ userId: 'u1', message: 'Hola', appVersion: '1.2.0', platform: 'android' });
  });
});

describe('report', () => {
  it('sin mensaje, vacío o solo con espacios → message null', async () => {
    for (const message of [undefined, '', '  \n ']) {
      await feedback.report({ userId: null, productId: PRODUCT_ID, type: 'info', message });
    }
    expect(repo.saveReport.mock.calls.map(([r]) => r.message)).toEqual([null, null, null]);
  });

  it('pasa el usuario, el producto, el tipo y el mensaje recortado; devuelve lo del repositorio', async () => {
    repo.saveReport.mockResolvedValueOnce('product_not_found');
    await expect(feedback.report({ userId: 'u1', productId: PRODUCT_ID, type: 'score', message: ' No cierra ' }))
      .resolves.toBe('product_not_found');
    expect(repo.saveReport).toHaveBeenCalledWith({ userId: 'u1', productId: PRODUCT_ID, type: 'score', message: 'No cierra' });
  });
});
