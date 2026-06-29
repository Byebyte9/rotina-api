const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'Rotina <noreply@send.rotina.life>'

// ── Templates ────────────────────────────────────────────────────────────────

function baseHtml(content) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body { margin:0; padding:0; background:#1E1008; font-family:'Helvetica Neue',Arial,sans-serif; }
    .wrap { max-width:520px; margin:0 auto; padding:48px 24px; }
    .logo { font-size:36px; font-style:italic; color:#F5ECD7; margin:0 0 4px; }
    .logo span { color:#C4A882; }
    .sub { font-size:12px; color:#8A6A4A; margin:0 0 40px; letter-spacing:0.4px; }
    .card { background:#3D2512; border:1px solid #5C3A20; border-radius:16px; padding:32px; }
    h1 { font-size:20px; color:#F5ECD7; margin:0 0 12px; font-weight:600; }
    p { font-size:14px; color:#C4A882; line-height:1.7; margin:0 0 16px; }
    .btn { display:inline-block; margin:8px 0 24px; padding:14px 32px; background:#C4A882;
           color:#1E1008; font-size:14px; font-weight:700; border-radius:12px;
           text-decoration:none; letter-spacing:0.2px; }
    .code { font-size:32px; font-weight:800; color:#F5ECD7; letter-spacing:8px;
            background:#2C1A0E; border:1px solid #5C3A20; border-radius:10px;
            padding:16px 24px; display:inline-block; margin:8px 0 24px; }
    .divider { border:none; border-top:1px solid #5C3A20; margin:24px 0; }
    .small { font-size:12px; color:#8A6A4A; line-height:1.6; }
    .footer { text-align:center; margin-top:32px; font-size:11px; color:#5C3A20; }
    .device-info { background:#2C1A0E; border:1px solid #5C3A20; border-radius:10px;
                   padding:16px; margin:16px 0; }
    .device-info p { margin:4px 0; font-size:13px; color:#8A6A4A; }
    .device-info strong { color:#C4A882; }
    .warn { color:#C45C4A; font-weight:600; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="logo">Rotina<span>.</span></p>
    <p class="sub">Sua vida em um app.</p>
    <div class="card">${content}</div>
    <div class="footer">© ${new Date().getFullYear()} Rotina · rotina.life</div>
  </div>
</body>
</html>`
}

// ── Verificação de email no cadastro ────────────────────────────────────────

async function sendVerificationEmail({ to, nome, token }) {
  const link = `https://api.rotina.life/auth/verify-email?token=${token}`

  const html = baseHtml(`
    <h1>Confirme seu email 👋</h1>
    <p>Olá, ${nome}! Para ativar sua conta no Rotina, confirme seu endereço de email clicando no botão abaixo.</p>
    <a href="${link}" class="btn">Confirmar email</a>
    <hr class="divider"/>
    <p class="small">O link expira em <strong>24 horas</strong>.<br/>
    Se você não criou uma conta no Rotina, pode ignorar este email com segurança.</p>
  `)

  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Confirme seu email — Rotina',
    html,
  })
}

// ── Redefinição de senha ─────────────────────────────────────────────────────

async function sendPasswordResetEmail({ to, nome, token }) {
  const link = `https://api.rotina.life/auth/reset-password?token=${token}`

  const html = baseHtml(`
    <h1>Redefinir senha</h1>
    <p>Olá, ${nome}! Recebemos um pedido para redefinir a senha da sua conta Rotina.</p>
    <a href="${link}" class="btn">Redefinir minha senha</a>
    <hr class="divider"/>
    <p class="small">
      O link expira em <strong>1 hora</strong>.<br/>
      Se você não solicitou a redefinição de senha, ignore este email — sua conta continua segura.
    </p>
  `)

  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Redefinir senha — Rotina',
    html,
  })
}

// ── Alerta de novo dispositivo ───────────────────────────────────────────────

async function sendNewDeviceEmail({ to, nome, deviceInfo }) {
  const { ip, userAgent, city, country, time } = deviceInfo

  const html = baseHtml(`
    <h1>Novo acesso à sua conta</h1>
    <p>Olá, ${nome}! Detectamos um login na sua conta Rotina a partir de um <strong>dispositivo ou local desconhecido</strong>.</p>

    <div class="device-info">
      <p><strong>Horário:</strong> ${time}</p>
      ${city ? `<p><strong>Local:</strong> ${city}${country ? `, ${country}` : ''}</p>` : ''}
      <p><strong>IP:</strong> ${ip}</p>
      ${userAgent ? `<p><strong>Dispositivo:</strong> ${userAgent}</p>` : ''}
    </div>

    <p>Se foi você, pode ignorar este email. Caso contrário, <span class="warn">altere sua senha imediatamente</span> nas configurações do app.</p>
    <hr class="divider"/>
    <p class="small">Por segurança, nunca compartilhe sua senha com ninguém.</p>
  `)

  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Novo acesso à sua conta — Rotina',
    html,
  })
}

// ── Feedback do app ──────────────────────────────────────────────────────────

async function sendFeedbackEmail({ tipo, mensagem, userEmail, userName }) {
  const tipoLabel = { sugestao: 'Sugestão', bug: 'Bug', elogio: 'Elogio', outro: 'Outro' }[tipo] || tipo
  const tipoColor = { sugestao: '#C4A882', bug: '#C45C4A', elogio: '#7BAF6E', outro: '#8A6A4A' }[tipo] || '#C4A882'

  const html = baseHtml(`
    <h1>Novo feedback — ${tipoLabel}</h1>
    <div class="device-info">
      <p><strong>Usuário:</strong> ${userName || 'Anônimo'}</p>
      <p><strong>Email:</strong> ${userEmail || '—'}</p>
      <p><strong>Tipo:</strong> <span style="color:${tipoColor};font-weight:600">${tipoLabel}</span></p>
    </div>
    <p style="white-space:pre-wrap">${mensagem.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  `)

  return resend.emails.send({
    from: FROM,
    to: 'contact@rotina.life',
    reply_to: userEmail || undefined,
    subject: `[Feedback] ${tipoLabel} — Rotina`,
    html,
  })
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendNewDeviceEmail, sendFeedbackEmail }
