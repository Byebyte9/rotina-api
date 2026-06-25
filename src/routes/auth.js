const { register, login, me, deleteAccount, updateProfile, resetPassword } = require('../controllers/auth')
const authMiddleware = require('../middleware/auth')

async function authRoutes(fastify) {
  fastify.post('/auth/register', register)
  fastify.post('/auth/login', login)
  fastify.get('/auth/me', { preHandler: authMiddleware }, me)
  // Bug 7 fix: rota para deletar conta (LGPD)
  fastify.delete('/auth/me', { preHandler: authMiddleware }, deleteAccount)
  fastify.patch('/auth/me', { preHandler: authMiddleware }, updateProfile)
  fastify.post('/auth/reset-password', resetPassword)
}

module.exports = authRoutes
