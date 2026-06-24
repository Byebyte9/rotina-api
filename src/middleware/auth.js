async function authMiddleware(request, reply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    return reply.status(401).send({ error: 'Token inválido ou expirado' })
  }
}

module.exports = authMiddleware
