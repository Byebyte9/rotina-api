const pool = require('../db')
const bcrypt = require('bcryptjs')

async function register(request, reply) {
  const { email, nome, senha } = request.body

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    )
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'Email já cadastrado' })
    }

    const senhaHash = await bcrypt.hash(senha, 10)

    const result = await pool.query(
      `INSERT INTO users (email, senha_hash, nome, is_founder, founder_position)
       SELECT $1, $2, $3,
         (SELECT COUNT(*) < 200 FROM users),
         CASE WHEN (SELECT COUNT(*) FROM users) < 200
              THEN (SELECT COUNT(*) + 1 FROM users)
              ELSE NULL
         END
       RETURNING id, email, nome, is_founder, founder_position`,
      [email.toLowerCase(), senhaHash, nome.trim()]
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

  try {
    const result = await pool.query(
      `SELECT id, email, nome, senha_hash, is_founder, founder_position, is_premium
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    )

    // Resposta genérica — não revela se o email existe ou não
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
    console.error('ERRO LOGIN:', err.message)
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
    console.error('ERRO ME:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

async function deleteAccount(request, reply) {
  try {
    await pool.query('DELETE FROM user_data WHERE user_id = $1', [request.user.id])
    await pool.query('DELETE FROM users WHERE id = $1', [request.user.id])
    return reply.send({ ok: true })
  } catch (err) {
    console.error('ERRO DELETE ACCOUNT:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

async function updateProfile(request, reply) {
  const { nome } = request.body
  try {
    const result = await pool.query(
      'UPDATE users SET nome = $1 WHERE id = $2 RETURNING id, email, nome',
      [nome.trim(), request.user.id]
    )
    return reply.send({ user: result.rows[0] })
  } catch (err) {
    console.error('ERRO UPDATE PROFILE:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

// Troca de senha segura — exige senha atual, só funciona autenticado
async function changePassword(request, reply) {
  const { senhaAtual, novaSenha } = request.body

  try {
    const result = await pool.query(
      'SELECT senha_hash FROM users WHERE id = $1',
      [request.user.id]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Usuário não encontrado' })
    }

    const senhaCorreta = await bcrypt.compare(senhaAtual, result.rows[0].senha_hash)
    if (!senhaCorreta) {
      return reply.status(401).send({ error: 'Senha atual incorreta' })
    }

    if (senhaAtual === novaSenha) {
      return reply.status(400).send({ error: 'A nova senha deve ser diferente da atual' })
    }

    const novoHash = await bcrypt.hash(novaSenha, 10)
    await pool.query(
      'UPDATE users SET senha_hash = $1 WHERE id = $2',
      [novoHash, request.user.id]
    )

    return reply.send({ ok: true })
  } catch (err) {
    console.error('ERRO CHANGE PASSWORD:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

module.exports = { register, login, me, deleteAccount, updateProfile, changePassword }
