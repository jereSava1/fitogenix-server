import type { FastifyInstance } from 'fastify';
import { removeBackground } from '../../services/imageService';

export async function productImageRoute(app: FastifyInstance) {
  app.get<{ Querystring: { url: string } }>('/products/image', async (request, reply) => {
    const { url } = request.query;

    if (!url) {
      return reply.status(400).send({ error: 'Falta el parámetro url' });
    }

    const buffer = await removeBackground(url);

    if (!buffer) {
      return reply.status(502).send({ error: 'No se pudo procesar la imagen' });
    }

    return reply
      .header('Content-Type', 'image/png')
      .header('Cache-Control', 'public, max-age=604800')
      .send(Buffer.from(buffer));
  });
}
