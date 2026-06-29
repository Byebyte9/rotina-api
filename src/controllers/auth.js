const pool = require('../db')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { sendVerificationEmail, sendPasswordResetEmail, sendNewDeviceEmail, sendFeedbackEmail } = require('../services/email')

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

// Fingerprint leve do dispositivo: hash de IP + User-Agent para comparar logins
function deviceFingerprint(request) {
  const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || request.socket?.remoteAddress
    || 'unknown'
  const ua = request.headers['user-agent'] || ''
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex')
}

function extractDeviceInfo(request) {
  const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || request.socket?.remoteAddress
    || 'desconhecido'
  const userAgent = request.headers['user-agent'] || null

  // Formata UA de forma mais legível (ex: "Android 13 · com.rotina.app")
  let uaDisplay = null
  if (userAgent) {
    if (userAgent.includes('Dart')) uaDisplay = 'App Rotina (Flutter)'
    else if (userAgent.includes('Android')) uaDisplay = `Android · ${userAgent.slice(0, 80)}`
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) uaDisplay = `iOS · ${userAgent.slice(0, 80)}`
    else uaDisplay = userAgent.slice(0, 100)
  }

  const time = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })

  return { ip, userAgent: uaDisplay, time }
}

// ── Register ─────────────────────────────────────────────────────────────────

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

    // Cria token de verificação de email (expira em 24h)
    const verifyToken = generateToken()
    await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user.id, verifyToken]
    )

    // Envia email de verificação em background (não bloqueia o cadastro)
    sendVerificationEmail({ to: email.toLowerCase(), nome: nome.trim(), token: verifyToken })
      .catch(err => console.error('ERRO sendVerificationEmail:', err.message))

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
        emailVerified: false,
      }
    })
  } catch (err) {
    console.error('ERRO REGISTER:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function login(request, reply) {
  const { email, senha } = request.body

  try {
    const result = await pool.query(
      `SELECT id, email, nome, senha_hash, is_founder, founder_position, is_premium, email_verified
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

    // ── Detecção de novo dispositivo ────────────────────────────────────────
    const fingerprint = deviceFingerprint(request)

    const knownDevice = await pool.query(
      `SELECT id FROM known_devices WHERE user_id = $1 AND fingerprint = $2`,
      [user.id, fingerprint]
    )

    if (knownDevice.rows.length === 0) {
      // Dispositivo novo — registra e envia alerta por email (se email verificado)
      await pool.query(
        `INSERT INTO known_devices (user_id, fingerprint, last_seen_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, fingerprint) DO UPDATE SET last_seen_at = NOW()`,
        [user.id, fingerprint]
      )

      if (user.email_verified) {
        const deviceInfo = extractDeviceInfo(request)
        sendNewDeviceEmail({ to: user.email, nome: user.nome, deviceInfo })
          .catch(err => console.error('ERRO sendNewDeviceEmail:', err.message))
      }
    } else {
      // Atualiza last_seen do dispositivo conhecido
      await pool.query(
        `UPDATE known_devices SET last_seen_at = NOW()
         WHERE user_id = $1 AND fingerprint = $2`,
        [user.id, fingerprint]
      )
    }
    // ────────────────────────────────────────────────────────────────────────

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
        emailVerified: user.email_verified,
      }
    })
  } catch (err) {
    console.error('ERRO LOGIN:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

// ── Verificar email (link do email) ─────────────────────────────────────────

async function verifyEmail(request, reply) {
  const { token } = request.query

  if (!token) {
    return reply.status(400).send(htmlPage('Link inválido', 'O link de verificação está incompleto.', false))
  }

  try {
    const result = await pool.query(
      `SELECT user_id, expires_at, used
       FROM email_verification_tokens
       WHERE token = $1`,
      [token]
    )

    if (result.rows.length === 0) {
      return reply.type('text/html').send(htmlPage('Link inválido', 'Este link de verificação não existe ou já foi usado.', false))
    }

    const row = result.rows[0]

    if (row.used) {
      return reply.type('text/html').send(htmlPage('Já verificado', 'Este email já foi confirmado. Você pode usar o app normalmente.', true))
    }

    if (new Date(row.expires_at) < new Date()) {
      return reply.type('text/html').send(htmlPage('Link expirado', 'Este link expirou. Abra o app e solicite um novo email de verificação.', false))
    }

    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [row.user_id])
    await pool.query('UPDATE email_verification_tokens SET used = TRUE WHERE token = $1', [token])

    return reply.type('text/html').send(htmlPage('Email confirmado!', 'Seu email foi verificado com sucesso. Volte ao app e aproveite o Rotina.', true))
  } catch (err) {
    console.error('ERRO VERIFY EMAIL:', err.message)
    return reply.type('text/html').send(htmlPage('Erro', 'Ocorreu um erro ao verificar seu email. Tente novamente.', false))
  }
}

// ── Reenviar verificação ─────────────────────────────────────────────────────

async function resendVerification(request, reply) {
  try {
    const userResult = await pool.query(
      'SELECT id, email, nome, email_verified FROM users WHERE id = $1',
      [request.user.id]
    )

    if (userResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Usuário não encontrado' })
    }

    const user = userResult.rows[0]

    if (user.email_verified) {
      return reply.send({ ok: true, message: 'Email já verificado' })
    }

    // Invalida tokens anteriores
    await pool.query(
      'UPDATE email_verification_tokens SET used = TRUE WHERE user_id = $1',
      [user.id]
    )

    const verifyToken = generateToken()
    await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user.id, verifyToken]
    )

    await sendVerificationEmail({ to: user.email, nome: user.nome, token: verifyToken })

    return reply.send({ ok: true })
  } catch (err) {
    console.error('ERRO RESEND VERIFICATION:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

// ── Forgot password ──────────────────────────────────────────────────────────

async function forgotPassword(request, reply) {
  const { email } = request.body

  // Resposta genérica — não revela se o email existe
  const genericOk = () => reply.send({ ok: true, message: 'Se este email estiver cadastrado, você receberá um link em breve.' })

  try {
    const result = await pool.query(
      'SELECT id, nome FROM users WHERE email = $1',
      [email.toLowerCase()]
    )

    if (result.rows.length === 0) {
      return genericOk()
    }

    const user = result.rows[0]

    // Invalida tokens anteriores
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1',
      [user.id]
    )

    const resetToken = generateToken()
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, resetToken]
    )

    await sendPasswordResetEmail({ to: email.toLowerCase(), nome: user.nome, token: resetToken })

    return genericOk()
  } catch (err) {
    console.error('ERRO FORGOT PASSWORD:', err.message)
    return reply.status(500).send({ error: 'Erro interno' })
  }
}

// ── Reset password (link do email → página web) ──────────────────────────────

async function resetPasswordPage(request, reply) {
  const { token } = request.query

  if (!token) {
    return reply.type('text/html').send(resetHtmlPage('Link inválido', null, 'O link está incompleto.'))
  }

  return reply.type('text/html').send(resetHtmlPage(null, token, null))
}

async function resetPasswordSubmit(request, reply) {
  const { token, novaSenha } = request.body

  if (!token || !novaSenha || novaSenha.length < 8) {
    return reply.type('text/html').send(resetHtmlPage('Dados inválidos', null, 'Preencha todos os campos corretamente.'))
  }

  try {
    const result = await pool.query(
      `SELECT user_id, expires_at, used
       FROM password_reset_tokens WHERE token = $1`,
      [token]
    )

    if (result.rows.length === 0) {
      return reply.type('text/html').send(resetHtmlPage('Link inválido', null, 'Este link não existe ou já foi usado.'))
    }

    const row = result.rows[0]

    if (row.used) {
      return reply.type('text/html').send(resetHtmlPage('Link já usado', null, 'Este link já foi utilizado. Solicite um novo no app.'))
    }

    if (new Date(row.expires_at) < new Date()) {
      return reply.type('text/html').send(resetHtmlPage('Link expirado', null, 'Este link expirou. Solicite um novo no app.'))
    }

    const novoHash = await bcrypt.hash(novaSenha, 10)
    await pool.query('UPDATE users SET senha_hash = $1 WHERE id = $2', [novoHash, row.user_id])
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE token = $1', [token])

    // Invalida todos os dispositivos conhecidos para forçar novo login
    await pool.query('DELETE FROM known_devices WHERE user_id = $1', [row.user_id])

    return reply.type('text/html').send(htmlPage('Senha redefinida!', 'Sua senha foi atualizada com sucesso. Abra o app e faça login com a nova senha.', true))
  } catch (err) {
    console.error('ERRO RESET PASSWORD SUBMIT:', err.message)
    return reply.type('text/html').send(resetHtmlPage('Erro', null, 'Ocorreu um erro. Tente novamente.'))
  }
}

// ── Me / Profile / Password / Delete ────────────────────────────────────────

async function me(request, reply) {
  try {
    const result = await pool.query(
      `SELECT id, email, nome, is_founder, founder_position, is_premium, email_verified, created_at
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
      emailVerified: user.email_verified,
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
    await pool.query('DELETE FROM known_devices WHERE user_id = $1', [request.user.id])
    await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [request.user.id])
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [request.user.id])
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

// ── HTML helpers para páginas web ────────────────────────────────────────────

function htmlPage(title, message, success) {
  const icon = success ? '✓' : '✗'
  const iconColor = success ? '#7BAF6E' : '#C45C4A'
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — Rotina</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background:#1E1008; font-family:'Helvetica Neue',Arial,sans-serif;
           min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { background:#3D2512; border:1px solid #5C3A20; border-radius:20px;
            padding:48px 36px; max-width:420px; width:100%; text-align:center; }
    .icon { font-size:48px; color:${iconColor}; margin-bottom:20px; }
    h1 { font-size:22px; color:#F5ECD7; margin-bottom:12px; font-weight:600; }
    p { font-size:14px; color:#C4A882; line-height:1.7; }
    .logo { font-size:14px; font-style:italic; color:#8A6A4A; margin-top:32px; }
    .logo span { color:#C4A882; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="logo">Rotina<span>.</span></p>
  </div>
</body>
</html>`
}

function resetHtmlPage(errorTitle, token, errorMsg) {
  if (errorTitle) {
    return htmlPage(errorTitle, errorMsg, false)
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Redefinir senha — Rotina</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background:#1E1008; font-family:'Helvetica Neue',Arial,sans-serif;
           min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { background:#3D2512; border:1px solid #5C3A20; border-radius:20px;
            padding:40px 32px; max-width:420px; width:100%; }
    h1 { font-size:20px; color:#F5ECD7; margin-bottom:8px; font-weight:600; }
    .sub { font-size:13px; color:#8A6A4A; margin-bottom:28px; }
    label { display:block; font-size:11px; color:#5C3A20; font-weight:600;
            letter-spacing:1px; margin-bottom:6px; text-transform:uppercase; }
    input { width:100%; background:#2C1A0E; border:1px solid #5C3A20; border-radius:10px;
            padding:13px 14px; color:#F5ECD7; font-size:14px; outline:none;
            font-family:inherit; margin-bottom:20px; }
    input:focus { border-color:#C4A882; }
    button { width:100%; background:#C4A882; color:#1E1008; border:none; border-radius:12px;
             padding:15px; font-size:14px; font-weight:700; cursor:pointer;
             font-family:inherit; letter-spacing:0.2px; }
    button:hover { background:#D4B892; }
    .req { font-size:12px; color:#8A6A4A; margin-top:-12px; margin-bottom:20px; }
    .logo { font-size:13px; font-style:italic; color:#8A6A4A; margin-top:28px; text-align:center; }
    .logo span { color:#C4A882; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Redefinir senha</h1>
    <p class="sub">Crie uma nova senha forte para sua conta.</p>
    <form method="POST" action="/auth/reset-password">
      <input type="hidden" name="token" value="${token}"/>
      <label>NOVA SENHA</label>
      <input type="password" name="novaSenha" placeholder="Mínimo 8 caracteres" required minlength="8"/>
      <p class="req">Mínimo 8 caracteres, 1 maiúscula e 1 caractere especial.</p>
      <button type="submit">Redefinir senha</button>
    </form>
    <p class="logo">Rotina<span>.</span></p>
  </div>
</body>
</html>`
}

async function feedback(request, reply) {
  const { tipo, mensagem } = request.body

  try {
    const userResult = await pool.query(
      'SELECT email, nome FROM users WHERE id = $1',
      [request.user.id]
    )
    const user = userResult.rows[0] || {}

    await sendFeedbackEmail({
      tipo,
      mensagem,
      userEmail: user.email,
      userName: user.nome,
    })

    return reply.send({ ok: true })
  } catch (err) {
    console.error('ERRO FEEDBACK:', err.message)
    return reply.status(500).send({ error: 'Erro ao enviar feedback' })
  }
}

module.exports = {
  register, login, me, deleteAccount, updateProfile, changePassword,
  verifyEmail, resendVerification, forgotPassword, resetPasswordPage, resetPasswordSubmit,
  feedback,
}
