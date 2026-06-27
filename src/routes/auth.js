const { register, login, me, deleteAccount, updateProfile, changePassword } = require('../controllers/auth')
const authMiddleware = require('../middleware/auth')

// Schema de validação reutilizável
const emailSchema = { type: 'string', format: 'email', maxLength: 255 }
const senhaSchema = { type: 'string', minLength: 8, maxLength: 128 }
const nomeSchema  = { type: 'string', minLength: 1, maxLength: 60 }

async function authRoutes(fastify) {

  // Registro — rate limit mais restrito
  fastify.post('/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'senha', 'nome'],
        additionalProperties: false,
        properties: {
          email: emailSchema,
          senha: senhaSchema,
          nome: nomeSchema,
        },
      },
    },
    handler: register,
  })

  // Login — rate limit agressivo (5 tentativas por minuto por IP)
  fastify.post('/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'senha'],
        additionalProperties: false,
        properties: {
          email: emailSchema,
          senha: senhaSchema,
        },
      },
    },
    handler: login,
  })

  // Rotas autenticadas
  fastify.get('/auth/me', { preHandler: authMiddleware }, me)
  fastify.delete('/auth/me', { preHandler: authMiddleware }, deleteAccount)

  fastify.patch('/auth/me', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['nome'],
        additionalProperties: false,
        properties: { nome: nomeSchema },
      },
    },
    handler: updateProfile,
  })

  // Troca de senha — só para usuário autenticado (sem email, sem risco)
  fastify.post('/auth/change-password', {
    preHandler: authMiddleware,
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: {
      body: {
        type: 'object',
        required: ['senhaAtual', 'novaSenha'],
        additionalProperties: false,
        properties: {
          senhaAtual: senhaSchema,
          novaSenha:  senhaSchema,
        },
      },
    },
    handler: changePassword,
  })
}

module.exports = authRoutes
