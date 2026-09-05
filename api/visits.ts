import { Redis } from '@upstash/redis'

// Clave única para el contador en la base de datos KV.
const COUNTER_KEY = 'visitas_total'

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
})

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      // Cada GET representa una visita: se incrementa y se devuelve el nuevo total.
      const total = await redis.incr(COUNTER_KEY)
      res.status(200).json({ visitas: total })
      return
    }

    res.status(405).json({ error: 'Método no permitido' })
  } catch (err) {
    console.error('Error en /api/visits:', err)
    res.status(500).json({ error: 'No se pudo leer/actualizar el contador' })
  }
}
