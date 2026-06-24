const pool = require('../db')

// Bug 11 fix: limite de 1MB por payload de sync
const MAX_PAYLOAD_BYTES = 1 * 1024 * 1024

async function push(request, reply) {
  const userId = request.user.id
  const data = request.body

  if (!data) {
    return reply.status(400).send({ error: 'Dados não informados' })
  }

  // Verifica tamanho estimado do payload
  const payloadSize = Buffer.byteLength(JSON.stringify(data), 'utf8')
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    return reply.status(413).send({ error: 'Payload muito grande (máx 1MB)' })
  }

  try {
    await pool.query(
      `INSERT INTO user_data (user_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET data = $2, updated_at = NOW()`,
      [userId, JSON.stringify(data)]
    )

    return reply.send({ ok: true, synced_at: new Date().toISOString() })
  } catch (err) {
    console.error('ERRO PUSH:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

async function pull(request, reply) {
  const userId = request.user.id

  try {
    const result = await pool.query(
      'SELECT data, updated_at FROM user_data WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      return reply.send({ data: null, synced_at: null })
    }

    return reply.send({
      data: result.rows[0].data,
      synced_at: result.rows[0].updated_at
    })
  } catch (err) {
    console.error('ERRO PULL:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

module.exports = { push, pull }
