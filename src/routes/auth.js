const {
  register, login, me, deleteAccount, updateProfile, changePassword,
  verifyEmail, resendVerification, forgotPassword, resetPasswordPage, resetPasswordSubmit,
  feedback,
} = require('../controllers/auth')
const authMiddleware = require('../middleware/auth')

const emailSchema = { type: 'string', format: 'email', maxLength: 255 }
const senhaSchema = { type: 'string', minLength: 8, maxLength: 128 }
const nomeSchema  = { type: 'string', minLength: 1, maxLength: 60 }

async function authRoutes(fastify) {

  // ── Registro ────────────────────────────────────────────────────────────────
  fastify.post('/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'senha', 'nome'],
        additionalProperties: false,
        properties: { email: emailSchema, senha: senhaSchema, nome: nomeSchema },
      },
    },
    handler: register,
  })

  // ── Login ────────────────────────────────────────────────────────────────────
  fastify.post('/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'senha'],
        additionalProperties: false,
        properties: { email: emailSchema, senha: senhaSchema },
      },
    },
    handler: login,
  })

  // ── Verificação de email (link clicado no email) ────────────────────────────
  // GET: exibe resultado; chamado pelo link do email
  fastify.get('/auth/verify-email', { handler: verifyEmail })

  // POST: reenvia o email de verificação (usuário autenticado)
  fastify.post('/auth/resend-verification', {
    preHandler: authMiddleware,
    config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    handler: resendVerification,
  })

  // ── Esqueci a senha ──────────────────────────────────────────────────────────
  fastify.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        additionalProperties: false,
        properties: { email: emailSchema },
      },
    },
    handler: forgotPassword,
  })

  // GET: página web para digitar nova senha (link do email)
  fastify.get('/auth/reset-password', { handler: resetPasswordPage })

  // POST: submete a nova senha (formulário web)
  fastify.post('/auth/reset-password', { handler: resetPasswordSubmit })

  // ── Rotas autenticadas ───────────────────────────────────────────────────────
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

  fastify.post('/auth/change-password', {
    preHandler: authMiddleware,
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: {
      body: {
        type: 'object',
        required: ['senhaAtual', 'novaSenha'],
        additionalProperties: false,
        properties: { senhaAtual: senhaSchema, novaSenha: senhaSchema },
      },
    },
    handler: changePassword,
  })

  // ── Feedback ─────────────────────────────────────────────────────────────────
  fastify.post('/feedback', {
    preHandler: authMiddleware,
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    schema: {
      body: {
        type: 'object',
        required: ['tipo', 'mensagem'],
        additionalProperties: false,
        properties: {
          tipo: { type: 'string', enum: ['sugestao', 'bug', 'elogio', 'outro'] },
          mensagem: { type: 'string', minLength: 5, maxLength: 2000 },
        },
      },
    },
    handler: feedback,
  })
}

module.exports = authRoutes
