import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeOnSignals } from './shutdown';

const SIGNAL = 'SIGUSR2' as NodeJS.Signals;
const OTHER = 'SIGHUP' as NodeJS.Signals;

afterEach(() => {
  process.removeAllListeners(SIGNAL);
  process.removeAllListeners(OTHER);
});

describe('closeOnSignals (R-03)', () => {
  it('con la señal, cierra la app una vez (aunque llegue otra) y sale con 0', async () => {
    const app = Fastify();
    const close = vi.spyOn(app, 'close');
    const exit = vi.fn();
    closeOnSignals(app, { signals: [SIGNAL, OTHER], exit });

    process.emit(SIGNAL, SIGNAL);
    process.emit(OTHER, OTHER);
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('deja terminar el request en curso antes de salir', async () => {
    const app = Fastify();
    let finish!: () => void;
    app.get('/lento', () => new Promise<string>((resolve) => (finish = () => resolve('listo'))));
    await app.listen({ port: 0 });
    const port = (app.server.address() as { port: number }).port;
    const exit = vi.fn();
    closeOnSignals(app, { signals: [SIGNAL], exit });

    const response = fetch(`http://127.0.0.1:${port}/lento`).then((r) => r.text());
    await vi.waitFor(() => expect(finish).toBeDefined());
    process.emit(SIGNAL, SIGNAL);
    expect(exit).not.toHaveBeenCalled();

    finish();
    await expect(response).resolves.toBe('listo');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it('si el cierre falla, sale con 1', async () => {
    const app = Fastify();
    vi.spyOn(app, 'close').mockRejectedValue(new Error('boom') as never);
    const exit = vi.fn();
    closeOnSignals(app, { signals: [SIGNAL], exit });

    process.emit(SIGNAL, SIGNAL);
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });
});
