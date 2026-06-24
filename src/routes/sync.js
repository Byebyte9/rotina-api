const { push, pull } = require('../controllers/sync')
const authMiddleware = require('../middleware/auth')

async function syncRoutes(fastify) {
  fastify.post('/sync', { preHandler: authMiddleware }, push)
  fastify.get('/sync', { preHandler: authMiddleware }, pull)
}

module.exports = syncRoutes