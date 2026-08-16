import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import prisma from '../config/prisma.js'
import { hasMailConfig, sendWelcomeEmail, sendPasswordResetEmail, sendTestEmail, sendContactEmail } from '../utils/mailer.js'

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

const isStrongPassword = (password) => PASSWORD_POLICY.test(password)

const normalizeEmail = (email) => email.trim().toLowerCase()

const generatePasswordResetToken = (user) => {
  return jwt.sign(
    { email: user.email },
    `${process.env.JWT_SECRET}:${user.password}`,
    { expiresIn: '1h' }
  )
}

const generateToken = (id, rememberMe = false) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: rememberMe ? '7d' : '1d' })
}

export const hasGoogleAuthConfig = () => Boolean(process.env.GOOGLE_CLIENT_ID)

const googleClient = hasGoogleAuthConfig() ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null

const authResponse = (user, rememberMe) => ({
  _id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  token: generateToken(user.id, rememberMe),
})

const formatSmtpError = (error) => {
  const message = error?.message || 'Unknown SMTP failure'

  if (error?.code === 'EAUTH' || /Invalid login|Username and Password not accepted|535/i.test(message)) {
    return 'SMTP authentication failed. Check that SMTP_USER and SMTP_PASS use the Gmail app password for the same account.'
  }

  if (error?.code === 'ETIMEDOUT' || /timeout|timed out/i.test(message)) {
    return 'SMTP connection timed out. Check network access and SMTP host/port settings.'
  }

  if (error?.code === 'ECONNECTION' || /connect|certificate|TLS|SSL/i.test(message)) {
    return 'SMTP connection failed. Check SMTP_HOST, SMTP_PORT, and SMTP_SECURE/TLS settings.'
  }

  return message
}

// @desc    Register new user
// @route   POST /api/users/register
export const registerUser = async (req, res) => {
  try {
    const { name, email, password, rememberMe = false } = req.body
    const normalizedEmail = normalizeEmail(email || '')

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' })
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
      })
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return res.status(400).json({ message: 'User already exists' })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const user = await prisma.user.create({
      data: { name, email: normalizedEmail, password: hashedPassword },
    })

    void sendWelcomeEmail({ name: user.name, email: user.email }).catch((mailError) => {
      console.error('Welcome email failed:', mailError.message)
    })

    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user.id, rememberMe),
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Login user
// @route   POST /api/users/login
export const loginUser = async (req, res) => {
  try {
    const { email, password, rememberMe = false } = req.body
    const normalizedEmail = normalizeEmail(email || '')

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    if (!user.password) {
      return res.status(401).json({
        message: 'This account signs in with Google. Use "Continue with Google", or set a password via "Forgot password?".',
      })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    res.json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user.id, rememberMe),
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Sign in or sign up with a Google ID token (Google Identity Services credential)
// @route   POST /api/users/google
export const googleAuth = async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(503).json({
        message: 'Google sign-in is not configured on the server. Set GOOGLE_CLIENT_ID.',
      })
    }

    const { credential, rememberMe = false } = req.body
    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required' })
    }

    let payload
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      payload = ticket.getPayload()
    } catch {
      return res.status(401).json({ message: 'Google sign-in could not be verified. Please try again.' })
    }

    const email = normalizeEmail(payload.email || '')
    if (!email || !payload.email_verified) {
      return res.status(401).json({ message: 'Your Google account has no verified email address.' })
    }

    const googleId = payload.sub

    let user = await prisma.user.findUnique({ where: { googleId } })

    if (!user) {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) {
        // Google verified this email, so it is safe to attach Google sign-in
        // to the account that already owns it.
        user = await prisma.user.update({ where: { id: existing.id }, data: { googleId } })
      } else {
        user = await prisma.user.create({
          data: {
            name: (payload.name || '').trim() || email.split('@')[0],
            email,
            googleId,
          },
        })

        void sendWelcomeEmail({ name: user.name, email: user.email }).catch((mailError) => {
          console.error('Welcome email failed:', mailError.message)
        })
      }
    }

    res.json(authResponse(user, rememberMe))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Request password reset
// @route   POST /api/users/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    const normalizedEmail = normalizeEmail(email || '')

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) {
      return res.json({ message: 'If that email exists, a password reset link has been sent.' })
    }

    if (!hasMailConfig()) {
      return res.status(503).json({
        message: 'Email service is not configured in production. Set GMAIL_RELAY_URL + GMAIL_RELAY_SECRET or the SMTP_* variables in Render.',
      })
    }

    const resetToken = generatePasswordResetToken(user)

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
    const resetUrl = `${frontendUrl}/login?mode=reset&token=${resetToken}&email=${encodeURIComponent(user.email)}`

    try {
      await sendPasswordResetEmail({ name: user.name, email: user.email, resetUrl })
    } catch (mailError) {
      console.error('Password reset email failed:', {
        message: mailError.message,
        code: mailError.code,
        responseCode: mailError.responseCode,
        command: mailError.command,
        response: mailError.response,
      })
      return res.status(502).json({ message: formatSmtpError(mailError) })
    }

    res.json({ message: 'If that email exists, a password reset link has been sent.' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Reset password
// @route   POST /api/users/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { token, email, password } = req.body
    const normalizedEmail = normalizeEmail(email || '')

    if (!token || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Token, email, and password are required' })
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
      })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset link' })
    }

    try {
      jwt.verify(token, `${process.env.JWT_SECRET}:${user.password}`)
    } catch {
      return res.status(400).json({ message: 'Invalid or expired reset link' })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    })

    res.json({ message: 'Password updated successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Send a diagnostic email to the logged-in user's own address and
//          report which provider delivered it — a one-click production probe
//          for "why are welcome/reset emails not arriving?"
// @route   POST /api/users/test-email
const MAIL_TEST_COOLDOWN_MS = 60 * 1000
const lastMailTestByUser = new Map()

export const sendMailDiagnostic = async (req, res) => {
  const last = lastMailTestByUser.get(req.user.id) || 0
  const waitMs = MAIL_TEST_COOLDOWN_MS - (Date.now() - last)
  if (waitMs > 0) {
    return res.status(429).json({ ok: false, message: `Please wait ${Math.ceil(waitMs / 1000)}s before sending another test email.` })
  }
  lastMailTestByUser.set(req.user.id, Date.now())

  try {
    const result = await sendTestEmail({ name: req.user.name, email: req.user.email })
    res.json({ ok: true, provider: result.provider, messageId: result.messageId, to: req.user.email })
  } catch (error) {
    res.status(502).json({ ok: false, message: error.message })
  }
}

// @desc    Public "Get in touch" contact form → emails the Medzae inbox
// @route   POST /api/users/contact
const CONTACT_COOLDOWN_MS = 30 * 1000
const CONTACT_MESSAGE_MAX = 5000
const lastContactByIp = new Map()
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const submitContactMessage = async (req, res) => {
  try {
    const name = (req.body?.name || '').trim()
    const email = normalizeEmail(req.body?.email || '')
    const message = (req.body?.message || '').trim()

    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Name, email, and message are all required.' })
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' })
    }
    if (message.length > CONTACT_MESSAGE_MAX) {
      return res.status(400).json({ message: `Message is too long — please keep it under ${CONTACT_MESSAGE_MAX} characters.` })
    }

    if (!hasMailConfig()) {
      return res.status(503).json({ message: 'Messaging is temporarily unavailable. Please email us directly instead.' })
    }

    // Light per-IP throttle so the public endpoint can't be used to spam the inbox.
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown'
    const waitMs = CONTACT_COOLDOWN_MS - (Date.now() - (lastContactByIp.get(ip) || 0))
    if (waitMs > 0) {
      return res.status(429).json({ message: `Please wait ${Math.ceil(waitMs / 1000)}s before sending another message.` })
    }
    lastContactByIp.set(ip, Date.now())

    await sendContactEmail({ name, email, message })
    res.json({ ok: true, message: 'Thanks for reaching out — your message has been sent. We\'ll be in touch shortly.' })
  } catch (error) {
    console.error('Contact message failed:', error.message)
    res.status(502).json({ message: 'We couldn\'t send your message just now. Please try again in a moment.' })
  }
}

// @desc    Get current logged-in user
// @route   GET /api/users/me
export const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({ ...user, _id: user.id })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Get all users
// @route   GET /api/users
export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
    res.json(users.map(u => ({ ...u, _id: u.id })))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
