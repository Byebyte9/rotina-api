require('dotenv').config()
const fastify = require('fastify')({ logger: true })

fastify.register(require('@fastify/cors'), {
  origin: '*'
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