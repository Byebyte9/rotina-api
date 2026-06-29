const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'Rotina <noreply@send.rotina.life>'

// ── SVG logo inline (leve, sem dependência externa) ──────────────────────────
const LOGO_SVG = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" rx="14" fill="#3D2512"/>
  <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle"
    font-family="Georgia,serif" font-style="italic" font-size="28"
    font-weight="700" fill="#F5ECD7">R<tspan fill="#C4A882">.</tspan></text>
</svg>`

// ── Template base ─────────────────────────────────────────────────────────────
function baseHtml(content) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light dark"/>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings>
  </xml></noscript><![endif]-->
  <style>
    * { box-sizing: border-box; }
    body { margin:0; padding:0; background:#1E1008;
      font-family:'Helvetica Neue',Arial,sans-serif; -webkit-text-size-adjust:100%; }
    .email-wrap { max-width:560px; margin:0 auto; padding:40px 20px 32px; }
    .header { display:flex; align-items:center; gap:14px; margin-bottom:36px; }
    .header-text { }
    .header-logo-name { font-size:28px; font-style:italic; color:#F5ECD7;
      font-family:Georgia,serif; font-weight:700; line-height:1; margin:0; }
    .header-logo-name span { color:#C4A882; }
    .header-tagline { font-size:11px; color:#8A6A4A; letter-spacing:0.6px;
      margin:3px 0 0; text-transform:uppercase; }
    .card { background:#3D2512; border:1px solid #5C3A20; border-radius:18px;
      padding:36px 32px; }
    h1 { font-size:21px; color:#F5ECD7; margin:0 0 14px; font-weight:700;
      font-family:Georgia,serif; font-style:italic; line-height:1.3; }
    p { font-size:14px; color:#C4A882; line-height:1.75; margin:0 0 16px; }
    p:last-child { margin-bottom:0; }
    .btn { display:inline-block; margin:20px 0 24px; padding:15px 36px;
      background:#C4A882; color:#1E1008 !important; font-size:14px;
      font-weight:700; border-radius:12px; text-decoration:none;
      letter-spacing:0.3px; font-family:'Helvetica Neue',Arial,sans-serif; }
    .code-box { background:#2C1A0E; border:1px solid #5C3A20; border-radius:12px;
      padding:20px 24px; text-align:center; margin:20px 0 24px; }
    .code-number { font-size:40px; font-weight:800; color:#F5ECD7;
      letter-spacing:10px; font-family:'Courier New',monospace; line-height:1; }
    .code-label { font-size:11px; color:#8A6A4A; letter-spacing:0.8px;
      text-transform:uppercase; margin-top:8px; }
    .divider { border:none; border-top:1px solid #5C3A20; margin:24px 0; }
    .small { font-size:12px !important; color:#8A6A4A !important; line-height:1.65 !important; }
    .warn { color:#C45C4A !important; font-weight:600; }
    .security-box { background:#2C1A0E; border:1px solid #5C3A20;
      border-left:3px solid #C45C4A; border-radius:10px;
      padding:14px 16px; margin:20px 0 0; }
    .security-box p { font-size:12px; color:#C4A882; margin:0; line-height:1.6; }
    .security-box strong { color:#C45C4A; }
    .device-box { background:#2C1A0E; border:1px solid #5C3A20; border-radius:10px;
      padding:16px; margin:16px 0; }
    .device-box p { font-size:13px; color:#8A6A4A; margin:4px 0; }
    .device-box strong { color:#C4A882; }
    .footer { text-align:center; margin-top:28px; padding-top:0; }
    .footer p { font-size:11px; color:#5C3A20; margin:0; line-height:1.8; }
    .footer a { color:#8A6A4A !important; text-decoration:none; }
  </style>
</head>
<body>
  <div class="email-wrap">
    <div class="header">
      <div>${LOGO_SVG}</div>
      <div class="header-text">
        <p class="header-logo-name">Rotina<span>.</span></p>
        <p class="header-tagline">Sua vida em um app</p>
      </div>
    </div>

    <div class="card">
      ${content}
    </div>

    <div class="footer">
      <p>
        © ${new Date().getFullYear()} Rotina · <a href="https://rotina.life">rotina.life</a>
      </p>
      <p style="margin-top:4px;">
        Se você não reconhece esta ação, ignore este email com segurança.
      </p>
    </div>
  </div>
</body>
</html>`
}

// ── Verificação de email (código 6 dígitos) ──────────────────────────────────
async function sendVerificationEmail({ to, nome, code }) {
  const html = baseHtml(`
    <h1>Confirme seu email 👋</h1>
    <p>Olá, <strong style="color:#F5ECD7">${nome}</strong>! Para ativar sua conta no Rotina, insira o código abaixo no app:</p>

    <div class="code-box">
      <div class="code-number">${code}</div>
      <div class="code-label">Código de verificação</div>
    </div>

    <hr class="divider"/>

    <p class="small">
      O código expira em <strong>15 minutos</strong>.<br/>
      Se você não criou uma conta no Rotina, ignore este email.
    </p>

    <div class="security-box">
      <p>🔒 <strong>Nunca compartilhe este código</strong> com ninguém.<br/>
      A equipe do Rotina jamais pedirá seu código de verificação.</p>
    </div>
  `)

  const result = await resend.emails.send({
    from: FROM,
    to,
    subject: `${code} é seu código de verificação — Rotina`,
    html,
  })
  if (result.error) throw new Error(`Resend error: ${JSON.stringify(result.error)}`)
  return result
}

// ── Redefinição de senha ─────────────────────────────────────────────────────
async function sendPasswordResetEmail({ to, nome, token }) {
  const link = `https://api.rotina.life/auth/reset-password?token=${token}`

  const html = baseHtml(`
    <h1>Redefinir senha</h1>
    <p>Olá, <strong style="color:#F5ECD7">${nome}</strong>! Recebemos um pedido para redefinir a senha da sua conta Rotina.</p>

    <a href="${link}" class="btn">Redefinir minha senha</a>

    <hr class="divider"/>

    <p class="small">
      O link expira em <strong>1 hora</strong> e pode ser usado apenas uma vez.<br/>
      Se você não solicitou a redefinição, sua conta continua segura.
    </p>

    <div class="security-box">
      <p>🔒 <strong>Nunca compartilhe este link</strong> com ninguém.<br/>
      A equipe do Rotina jamais pedirá sua senha ou link de redefinição.</p>
    </div>
  `)

  const result = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Redefinir senha — Rotina',
    html,
  })
  if (result.error) throw new Error(`Resend error: ${JSON.stringify(result.error)}`)
  return result
}

// ── Alerta de novo dispositivo ───────────────────────────────────────────────
async function sendNewDeviceEmail({ to, nome, deviceInfo }) {
  const { ip, userAgent, time } = deviceInfo

  const html = baseHtml(`
    <h1>Novo acesso à sua conta</h1>
    <p>Olá, <strong style="color:#F5ECD7">${nome}</strong>! Detectamos um login na sua conta Rotina a partir de um <strong style="color:#F5ECD7">dispositivo desconhecido</strong>.</p>

    <div class="device-box">
      <p><strong>Horário:</strong> ${time}</p>
      <p><strong>IP:</strong> ${ip}</p>
      ${userAgent ? `<p><strong>Dispositivo:</strong> ${userAgent}</p>` : ''}
    </div>

    <p>Se foi você, pode ignorar este email. Caso contrário, <span class="warn">altere sua senha imediatamente</span> nas configurações do app.</p>

    <hr class="divider"/>

    <div class="security-box">
      <p>🔒 <strong>Nunca compartilhe sua senha</strong> com ninguém.<br/>
      A equipe do Rotina jamais solicitará sua senha por email ou telefone.</p>
    </div>
  `)

  const result = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Novo acesso à sua conta — Rotina',
    html,
  })
  if (result.error) throw new Error(`Resend error: ${JSON.stringify(result.error)}`)
  return result
}

// ── Feedback do app ──────────────────────────────────────────────────────────
async function sendFeedbackEmail({ tipo, mensagem, userEmail, userName }) {
  const tipoLabel = { sugestao: 'Sugestão', bug: 'Bug', elogio: 'Elogio', outro: 'Outro' }[tipo] || tipo
  const tipoColor = { sugestao: '#C4A882', bug: '#C45C4A', elogio: '#7BAF6E', outro: '#8A6A4A' }[tipo] || '#C4A882'

  const html = baseHtml(`
    <h1>Novo feedback — ${tipoLabel}</h1>
    <div class="device-box">
      <p><strong>Usuário:</strong> ${userName || 'Anônimo'}</p>
      <p><strong>Email:</strong> ${userEmail || '—'}</p>
      <p><strong>Tipo:</strong> <span style="color:${tipoColor};font-weight:600">${tipoLabel}</span></p>
    </div>
    <p style="white-space:pre-wrap;background:#2C1A0E;border:1px solid #5C3A20;border-radius:10px;padding:16px;font-size:13px;color:#C4A882">${mensagem.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  `)

  const result = await resend.emails.send({
    from: FROM,
    to: 'contact@rotina.life',
    reply_to: userEmail || undefined,
    subject: `[Feedback] ${tipoLabel} — Rotina`,
    html,
  })
  if (result.error) throw new Error(`Resend error: ${JSON.stringify(result.error)}`)
  return result
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendNewDeviceEmail, sendFeedbackEmail }
