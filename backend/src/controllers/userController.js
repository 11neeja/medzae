import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import prisma from '../config/prisma.js'
import { hasMailConfig, sendWelcomeEmail, sendPasswordResetEmail, sendEmailChangeEmail, sendTestEmail, sendContactEmail } from '../utils/mailer.js'
import { persistFile, removeUploadedFile } from '../utils/storage.js'

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
  avatarUrl: user.avatarUrl ?? null,
  token: generateToken(user.id, rememberMe),
})

// ── Profile ───────────────────────────────────────────────────────────

// The fields the owner sees on their own account.
const OWN_PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  avatarUrl: true,
  headline: true,
  bio: true,
  careerStage: true,
  institution: true,
  specialty: true,
  qualification: true,
  designation: true,
  yearsExperience: true,
  studyYear: true,
  graduationYear: true,
  city: true,
  country: true,
  websiteUrl: true,
  linkedinUrl: true,
  twitterUrl: true,
  isProfilePublic: true,
  showEmail: true,
  pendingEmail: true,
}

// What every other feature needs to render a person: never more than this.
export const PUBLIC_USER_SELECT = { id: true, name: true, avatarUrl: true }

const CAREER_STAGES = new Set(['student', 'doctor', 'professor', 'researcher', 'other'])

// Fields the form only asks certain professions for. Clearing them when the
// profession changes is what stops a doctor's profile from still advertising
// the "third year" they filled in while they were a student.
const STAGE_FIELDS = {
  student: ['institution', 'qualification', 'studyYear', 'graduationYear'],
  doctor: ['institution', 'qualification', 'specialty', 'designation', 'yearsExperience'],
  professor: ['institution', 'qualification', 'specialty', 'designation', 'yearsExperience'],
  researcher: ['institution', 'qualification', 'specialty', 'designation', 'yearsExperience'],
  other: ['institution', 'designation'],
}

const ALL_STAGE_FIELDS = ['institution', 'specialty', 'qualification', 'designation', 'yearsExperience', 'studyYear', 'graduationYear']

// Avatars set through the profile form are always presets from the frontend
// catalog. Uploaded photos get their URL from persistFile, never from the
// client, so an arbitrary remote URL can't be smuggled in here.
const PRESET_AVATAR_PATTERN = /^preset:[a-z0-9-]{1,40}$/

const trimOrNull = (value, max) => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  return text.slice(0, max)
}

// Accepts "medzae.com" as readily as "https://medzae.com" — people rarely type
// the scheme. Anything that isn't http(s) after normalising is rejected.
const normalizeUrl = (value) => {
  const text = trimOrNull(value, 200)
  if (!text) return null
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

// @desc    Update the signed-in user's profile
// @route   PATCH /api/users/me
export const updateProfile = async (req, res) => {
  try {
    const body = req.body || {}
    const data = {}

    if (body.name !== undefined) {
      const name = trimOrNull(body.name, 80)
      if (!name) return res.status(400).json({ message: 'Name cannot be empty' })
      data.name = name
    }

    if (body.headline !== undefined) data.headline = trimOrNull(body.headline, 120)
    if (body.bio !== undefined) data.bio = trimOrNull(body.bio, 600)
    if (body.institution !== undefined) data.institution = trimOrNull(body.institution, 120)
    if (body.specialty !== undefined) data.specialty = trimOrNull(body.specialty, 120)
    if (body.qualification !== undefined) data.qualification = trimOrNull(body.qualification, 120)
    if (body.designation !== undefined) data.designation = trimOrNull(body.designation, 120)
    if (body.studyYear !== undefined) data.studyYear = trimOrNull(body.studyYear, 40)
    if (body.city !== undefined) data.city = trimOrNull(body.city, 80)
    if (body.country !== undefined) data.country = trimOrNull(body.country, 80)

    if (body.careerStage !== undefined) {
      const stage = trimOrNull(body.careerStage, 40)
      if (stage && !CAREER_STAGES.has(stage)) {
        return res.status(400).json({ message: 'Unknown profession' })
      }
      data.careerStage = stage
    }

    if (body.graduationYear !== undefined) {
      const raw = body.graduationYear
      if (raw === null || raw === '') {
        data.graduationYear = null
      } else {
        const year = Number(raw)
        const maxYear = new Date().getFullYear() + 15
        if (!Number.isInteger(year) || year < 1950 || year > maxYear) {
          return res.status(400).json({ message: `Graduation year must be between 1950 and ${maxYear}` })
        }
        data.graduationYear = year
      }
    }

    if (body.yearsExperience !== undefined) {
      const raw = body.yearsExperience
      if (raw === null || raw === '') {
        data.yearsExperience = null
      } else {
        const years = Number(raw)
        if (!Number.isInteger(years) || years < 0 || years > 80) {
          return res.status(400).json({ message: 'Years of experience must be between 0 and 80' })
        }
        data.yearsExperience = years
      }
    }

    // Switching profession drops whatever the previous one asked for and this
    // one doesn't, so nothing lingers invisibly on the public profile.
    if (data.careerStage !== undefined) {
      const kept = new Set(STAGE_FIELDS[data.careerStage] || [])
      for (const field of ALL_STAGE_FIELDS) {
        if (!kept.has(field)) data[field] = null
      }
    }

    for (const field of ['websiteUrl', 'linkedinUrl', 'twitterUrl']) {
      if (body[field] === undefined) continue
      const raw = trimOrNull(body[field], 200)
      if (!raw) {
        data[field] = null
        continue
      }
      const normalized = normalizeUrl(raw)
      if (!normalized) return res.status(400).json({ message: 'Please enter a valid link (for example https://example.com)' })
      data[field] = normalized
    }

    if (body.isProfilePublic !== undefined) data.isProfilePublic = Boolean(body.isProfilePublic)
    if (body.showEmail !== undefined) data.showEmail = Boolean(body.showEmail)

    // avatar: "preset:<id>" picks from the catalog, null clears back to initials.
    if (body.avatarUrl !== undefined) {
      const avatar = trimOrNull(body.avatarUrl, 60)
      if (avatar && !PRESET_AVATAR_PATTERN.test(avatar)) {
        return res.status(400).json({ message: 'Choose an avatar from the gallery, or upload a photo' })
      }
      data.avatarUrl = avatar
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'Nothing to update' })
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: OWN_PROFILE_SELECT,
    })

    res.json({ ...user, _id: user.id })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Upload a profile photo
// @route   POST /api/users/me/avatar   (multipart, field name "avatar")
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image was uploaded' })

    if (!req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ message: 'Profile photos must be an image file' })
    }

    const previous = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatarUrl: true },
    })

    const avatarUrl = await persistFile(req.file, { folder: 'medihub/avatars', prefix: 'avatar' })

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl },
      select: OWN_PROFILE_SELECT,
    })

    // Replacing a photo orphans the old file. This is a no-op for presets and
    // for Cloudinary URLs; it only sweeps the local dev uploads directory.
    if (previous?.avatarUrl && !previous.avatarUrl.startsWith('preset:')) {
      removeUploadedFile(previous.avatarUrl)
    }

    res.json({ ...user, _id: user.id })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Change (or, for Google-only accounts, set) the account password
// @route   PUT /api/users/me/password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {}

    if (!newPassword) return res.status(400).json({ message: 'A new password is required' })

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
      })
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Accounts created through Google have no password yet — there is nothing
    // to verify, so this call sets the first one instead of changing it.
    if (user.password) {
      if (!currentPassword) return res.status(400).json({ message: 'Your current password is required' })
      const isMatch = await bcrypt.compare(currentPassword, user.password)
      if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' })

      if (currentPassword === newPassword) {
        return res.status(400).json({ message: 'Your new password must be different from the current one' })
      }
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(newPassword, salt)

    await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } })

    // Reset links are signed with the old password hash, so any outstanding
    // "forgot password" email stops working the moment this succeeds.
    res.json({ message: user.password ? 'Password updated' : 'Password set — you can now sign in with email too' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Start an email change — confirmation goes to the NEW address
// @route   POST /api/users/me/email
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000

export const requestEmailChange = async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body || {}
    const normalizedEmail = normalizeEmail(newEmail || '')

    if (!normalizedEmail) return res.status(400).json({ message: 'A new email address is required' })
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' })
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(404).json({ message: 'User not found' })

    if (normalizedEmail === user.email) {
      return res.status(400).json({ message: 'That is already your email address' })
    }

    // Password-holders re-authenticate: a hijacked session shouldn't be able to
    // move the account to an attacker's inbox.
    if (user.password) {
      if (!currentPassword) return res.status(400).json({ message: 'Your current password is required' })
      const isMatch = await bcrypt.compare(currentPassword, user.password)
      if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' })
    }

    const taken = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (taken) return res.status(400).json({ message: 'That email address is already in use' })

    if (!hasMailConfig()) {
      return res.status(503).json({
        message: 'Email service is not configured, so the address cannot be verified right now.',
      })
    }

    const token = crypto.randomBytes(32).toString('hex')

    await prisma.user.update({
      where: { id: user.id },
      data: {
        pendingEmail: normalizedEmail,
        emailChangeToken: token,
        emailChangeExpires: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
      },
    })

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
    const confirmUrl = `${frontendUrl}/confirm-email?token=${token}`

    try {
      await sendEmailChangeEmail({ name: user.name, newEmail: normalizedEmail, confirmUrl })
    } catch (mailError) {
      // Roll the pending change back so the UI doesn't claim a mail is coming.
      await prisma.user.update({
        where: { id: user.id },
        data: { pendingEmail: null, emailChangeToken: null, emailChangeExpires: null },
      })
      console.error('Email change mail failed:', mailError.message)
      return res.status(502).json({ message: formatSmtpError(mailError) })
    }

    res.json({ message: `Confirmation sent to ${normalizedEmail}. Your current email keeps working until you confirm.` })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Cancel a pending email change
// @route   DELETE /api/users/me/email
export const cancelEmailChange = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { pendingEmail: null, emailChangeToken: null, emailChangeExpires: null },
    })
    res.json({ message: 'Email change cancelled' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Confirm an email change from the emailed link
// @route   POST /api/users/confirm-email      (public — the link may open in
//          a browser where nobody is signed in)
export const confirmEmailChange = async (req, res) => {
  try {
    const token = (req.body?.token || '').trim()
    if (!token) return res.status(400).json({ message: 'Confirmation token is required' })

    const user = await prisma.user.findUnique({ where: { emailChangeToken: token } })

    if (!user || !user.pendingEmail || !user.emailChangeExpires || user.emailChangeExpires < new Date()) {
      return res.status(400).json({ message: 'This confirmation link is invalid or has expired' })
    }

    // Someone else may have claimed the address while this link sat unopened.
    const taken = await prisma.user.findUnique({ where: { email: user.pendingEmail } })
    if (taken && taken.id !== user.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pendingEmail: null, emailChangeToken: null, emailChangeExpires: null },
      })
      return res.status(400).json({ message: 'That email address is now in use by another account' })
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.pendingEmail,
        pendingEmail: null,
        emailChangeToken: null,
        emailChangeExpires: null,
      },
    })

    res.json({ message: 'Email address updated', email: updated.email })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Permanently delete the signed-in user's account and their content
// @route   DELETE /api/users/me
export const deleteAccount = async (req, res) => {
  try {
    const { password, confirmText } = req.body || {}

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(404).json({ message: 'User not found' })

    if (user.password) {
      if (!password) return res.status(400).json({ message: 'Your password is required to delete the account' })
      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) return res.status(401).json({ message: 'Password is incorrect' })
    } else {
      // Google-only accounts have no password to check, so ask them to type
      // their email as the deliberate action.
      if (normalizeEmail(confirmText || '') !== user.email) {
        return res.status(400).json({ message: 'Type your email address exactly to confirm deletion' })
      }
    }

    const userId = user.id

    // Communities this user created would take every member's threads with
    // them, so hand each one to the longest-standing remaining member first.
    // Only a community nobody else is in gets deleted.
    const createdCommunities = await prisma.community.findMany({
      where: { creatorId: userId },
      select: { id: true },
    })

    for (const community of createdCommunities) {
      const successor = await prisma.communityMember.findFirst({
        where: { communityId: community.id, userId: { not: userId } },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        select: { userId: true },
      })

      if (successor) {
        await prisma.community.update({
          where: { id: community.id },
          data: { creatorId: successor.userId },
        })
        await prisma.communityMember.updateMany({
          where: { communityId: community.id, userId: successor.userId },
          data: { role: 'creator' },
        })
      } else {
        await prisma.community.delete({ where: { id: community.id } })
      }
    }

    // Relations that don't cascade have to go first, innermost outward.
    await prisma.$transaction([
      prisma.threadReply.deleteMany({ where: { authorId: userId } }),
      prisma.thread.deleteMany({ where: { authorId: userId } }),
      prisma.comment.deleteMany({ where: { authorId: userId } }),
      prisma.post.deleteMany({ where: { authorId: userId } }),
      prisma.chatMessage.deleteMany({ where: { senderId: userId } }),
      prisma.groupJoinRequest.deleteMany({ where: { userId } }),
      prisma.note.deleteMany({ where: { userId } }),
      prisma.task.deleteMany({ where: { userId } }),
      prisma.document.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ])

    res.json({ message: 'Your account and its content have been deleted' })
  } catch (error) {
    console.error('Account deletion failed:', error.message)
    res.status(500).json({ message: 'We could not delete the account. Please try again, or contact support.' })
  }
}

// @desc    View another user's profile — only what they chose to publish
// @route   GET /api/users/:id/profile
export const getUserProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: OWN_PROFILE_SELECT,
    })

    if (!user) return res.status(404).json({ message: 'User not found' })

    // The owner always sees their own profile in full.
    if (user.id === req.user.id) {
      return res.json({ ...user, _id: user.id, isOwnProfile: true })
    }

    if (!user.isProfilePublic) {
      // Name and avatar are already visible anywhere this person has posted,
      // so a private profile hides the details rather than the person.
      return res.json({
        _id: user.id,
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isPrivate: true,
      })
    }

    const { pendingEmail, showEmail, email, ...visible } = user

    res.json({
      ...visible,
      _id: user.id,
      email: showEmail ? email : null,
      isPrivate: false,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

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

    res.status(201).json(authResponse(user, rememberMe))
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

    res.json(authResponse(user, rememberMe))
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
      select: { ...OWN_PROFILE_SELECT, password: true },
    })
    if (!user) return res.status(404).json({ message: 'User not found' })

    // The profile page needs to know whether to offer "change password" or
    // "set a password" — never the hash itself.
    const { password, ...profile } = user
    res.json({ ...profile, _id: user.id, hasPassword: Boolean(password) })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Get all users
// @route   GET /api/users
export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true, avatarUrl: true },
    })
    res.json(users.map(u => ({ ...u, _id: u.id })))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// ─── @-mentions ────────────────────────────────────────────────────

const MENTION_LIMIT = 8
const MENTION_SELECT = { id: true, name: true, email: true, avatarUrl: true }

const HONORIFIC = /^(?:dr|prof|mr|mrs|ms|miss|mx|sir)\.?$/i

/**
 * The initials someone might type for a name: "Jane Q. Doe" → "jqd", and for
 * "Dr. Michael Chen" both "dmc" and "mc" — half this directory is titled, and
 * nobody thinks of a colleague's initials as starting with their doctorate.
 */
const initialSetsOf = (name) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  const first = (word) => word[0].toLowerCase()
  const sets = [words.map(first).join('')]
  if (words.length > 1 && HONORIFIC.test(words[0])) {
    sets.push(words.slice(1).map(first).join(''))
  }
  return sets
}

// @desc    People the current user can @-mention in a note
// @route   GET /api/users/mentions?q=jd
//
// The picker is driven by whatever follows the "@", which is usually initials
// rather than the start of a name — and SQL can't match initials. So the search
// runs twice: the substring match the database can do, plus a narrow "name
// starts with the query's first letter" fetch that JS filters down to real
// initial sequences. Both sets are merged and ranked.
export const searchMentionUsers = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase()
    const notMe = { id: { not: req.user.id } }

    // Folder-sharing counterparts rank above name-alike strangers: the people
    // you already work with are the ones you mean nine times out of ten.
    const shares = await prisma.folderShare.findMany({
      where: { OR: [{ ownerId: req.user.id }, { sharedWithId: req.user.id }] },
      select: { ownerId: true, sharedWithId: true },
      take: 200,
    })
    const collaborators = new Set()
    for (const share of shares) {
      collaborators.add(share.ownerId)
      collaborators.add(share.sharedWithId)
    }
    collaborators.delete(req.user.id)

    // Bare "@": nothing to match on yet, so lead with the collaborators and
    // top the list up alphabetically.
    if (!q) {
      const known = collaborators.size
        ? await prisma.user.findMany({
            where: { id: { in: [...collaborators] } },
            select: MENTION_SELECT,
            orderBy: { name: 'asc' },
            take: MENTION_LIMIT,
          })
        : []
      const rest = known.length < MENTION_LIMIT
        ? await prisma.user.findMany({
            where: { AND: [notMe, { id: { notIn: known.map(u => u.id) } }] },
            select: MENTION_SELECT,
            orderBy: { name: 'asc' },
            take: MENTION_LIMIT - known.length,
          })
        : []
      return res.json([...known, ...rest])
    }

    const [matches, sameFirstLetter] = await Promise.all([
      prisma.user.findMany({
        where: {
          AND: [
            notMe,
            {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: MENTION_SELECT,
        take: 40,
      }),
      // Initials are short by nature; past four letters it's a name being typed.
      // A name whose initials match starts one of its words with the query's
      // first letter — either the whole name ("Jane…") or a later word, which
      // is where a stripped honorific lands ("Dr. Michael…" for "mc").
      q.length <= 4
        ? prisma.user.findMany({
            where: {
              AND: [
                notMe,
                {
                  OR: [
                    { name: { startsWith: q[0], mode: 'insensitive' } },
                    { name: { contains: ` ${q[0]}`, mode: 'insensitive' } },
                  ],
                },
              ],
            },
            select: MENTION_SELECT,
            take: 200,
          })
        : [],
    ])

    const candidates = new Map()
    for (const user of [...matches, ...sameFirstLetter]) candidates.set(user.id, user)

    // Lower is better; 99 means the row only came back as an initials candidate
    // and didn't actually match anything.
    const rank = (user) => {
      const name = String(user.name || '').toLowerCase()
      if (name.startsWith(q)) return 0
      if (initialSetsOf(name).some(initials => initials.startsWith(q))) return 1
      if (name.split(/\s+/).some(word => word.startsWith(q))) return 2
      if (name.includes(q)) return 3
      if (String(user.email || '').toLowerCase().includes(q)) return 4
      return 99
    }

    const ranked = [...candidates.values()]
      .map(user => ({ user, score: rank(user) }))
      .filter(row => row.score < 99)
      .sort((a, b) =>
        a.score - b.score ||
        (collaborators.has(b.user.id) ? 1 : 0) - (collaborators.has(a.user.id) ? 1 : 0) ||
        a.user.name.localeCompare(b.user.name)
      )
      .slice(0, MENTION_LIMIT)
      .map(row => row.user)

    res.json(ranked)
  } catch (error) {
    console.error('searchMentionUsers error:', error)
    res.status(500).json({ message: error.message })
  }
}
