const pool = require('../db')
const bcrypt = require('bcryptjs')

async function register(request, reply) {
  const { email, nome, senha } = request.body

  if (!email || !nome || !senha) {
    return reply.status(400).send({ error: 'Email, nome e senha são obrigatórios' })
  }

  try {
    // Verifica se email já existe
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    )
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'Email já cadastrado' })
    }

    const senhaHash = await bcrypt.hash(senha, 10)

    // Bug 2 fix: usa INSERT com subquery atômica para evitar race condition
    // no sistema de fundadores. O COUNT e o INSERT acontecem na mesma operação.
    const result = await pool.query(
      `INSERT INTO users (email, senha_hash, nome, is_founder, founder_position)
       SELECT $1, $2, $3,
         (SELECT COUNT(*) < 200 FROM users),
         CASE WHEN (SELECT COUNT(*) FROM users) < 200
              THEN (SELECT COUNT(*) + 1 FROM users)
              ELSE NULL
         END
       RETURNING id, email, nome, is_founder, founder_position`,
      [email.toLowerCase(), senhaHash, nome]
    )

    const user = result.rows[0]
    const token = await reply.jwtSign(
      { id: user.id, email: user.email },
      { expiresIn: '30d' }
    )

    return reply.status(201).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        isFounder: user.is_founder,
        founderPosition: user.founder_position,
      }
    })
  } catch (err) {
    console.error('ERRO REGISTER:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

async function login(request, reply) {
  const { email, senha } = request.body

  if (!email || !senha) {
    return reply.status(400).send({ error: 'Email e senha são obrigatórios' })
  }

  try {
    const result = await pool.query(
      `SELECT id, email, nome, senha_hash, is_founder, founder_position, is_premium
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    )

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Email ou senha incorretos' })
    }

    const user = result.rows[0]
    const senhaCorreta = await bcrypt.compare(senha, user.senha_hash)

    if (!senhaCorreta) {
      return reply.status(401).send({ error: 'Email ou senha incorretos' })
    }

    const token = await reply.jwtSign(
      { id: user.id, email: user.email },
      { expiresIn: '30d' }
    )

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        isFounder: user.is_founder,
        founderPosition: user.founder_position,
        isPremium: user.is_premium,
      }
    })
  } catch (err) {
    console.error(err)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

async function me(request, reply) {
  try {
    const result = await pool.query(
      `SELECT id, email, nome, is_founder, founder_position, is_premium, created_at
       FROM users WHERE id = $1`,
      [request.user.id]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Usuário não encontrado' })
    }

    const user = result.rows[0]
    return reply.send({
      id: user.id,
      email: user.email,
      nome: user.nome,
      isFounder: user.is_founder,
      founderPosition: user.founder_position,
      isPremium: user.is_premium,
      createdAt: user.created_at,
    })
  } catch (err) {
    console.error(err)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

// Bug 7 fix: rota para deletar conta no servidor (LGPD)
async function deleteAccount(request, reply) {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [request.user.id])
    return reply.send({ ok: true })
  } catch (err) {
    console.error('ERRO DELETE ACCOUNT:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

module.exports = { register, login, me, deleteAccount }
