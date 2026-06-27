require('dotenv').config()
const fastify = require('fastify')({ logger: true })

// CORS restrito — só aceita o app e domínios conhecidos
fastify.register(require('@fastify/cors'), {
  origin: (origin, cb) => {
    // Sem origin = requisição do app mobile (ok) ou ferramentas como curl
    if (!origin) return cb(null, true)
    const allowed = [
      'https://rotina-api.up.railway.app',
      'https://byebyte9.github.io',
    ]
    if (allowed.includes(origin)) return cb(null, true)
    cb(new Error('CORS: origem não permitida'), false)
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
})

// Rate limiting global (fallback)
fastify.register(require('@fastify/rate-limit'), {
  global: true,
  max: 60,           // 60 requisições por minuto por IP (geral)
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    error: 'Muitas requisições. Aguarde um momento e tente novamente.',
  }),
})

fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET
})

fastify.register(require('./routes/auth'))
fastify.register(require('./routes/sync'))

fastify.get('/health', async () => {
  return { status: 'ok', app: 'Rotina API' }
})

const start = async () => {
  try {
    await fastify.listen({
      port: process.env.PORT || 3000,
      host: '0.0.0.0'
    })
    console.log('🌱 Rotina API rodando!')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
