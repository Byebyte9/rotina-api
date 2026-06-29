require('dotenv').config()
const fastify = require('fastify')({ logger: true })

// Parseia application/x-www-form-urlencoded (formulário web de reset de senha)
fastify.register(require('@fastify/formbody'))

// CORS restrito
fastify.register(require('@fastify/cors'), {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    const allowed = [
      'https://rotina.life',
      'https://www.rotina.life',
      'https://api.rotina.life',
      'https://byebyte9.github.io',
    ]
    if (allowed.includes(origin)) return cb(null, true)
    cb(new Error('CORS: origem não permitida'), false)
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
})

// Rate limiting global
fastify.register(require('@fastify/rate-limit'), {
  global: true,
  max: 60,
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
