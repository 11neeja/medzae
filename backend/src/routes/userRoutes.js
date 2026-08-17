import express from 'express'
import {
  registerUser,
  loginUser,
  googleAuth,
  forgotPassword,
  resetPassword,
  getUsers,
  getMe,
  sendMailDiagnostic,
  submitContactMessage,
  updateProfile,
  uploadAvatar,
  changePassword,
  requestEmailChange,
  cancelEmailChange,
  confirmEmailChange,
  deleteAccount,
  getUserProfile,
} from '../controllers/userController.js'
import { protect } from '../middleware/auth.js'
import { createMemoryUpload } from '../utils/upload.js'

const router = express.Router()

// Profile photos stream straight to Cloudinary, so memory storage + a tight
// size cap (large portraits are pointless at the sizes we render).
const avatarUpload = createMemoryUpload(5 * 1024 * 1024)

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/google', googleAuth)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/confirm-email', confirmEmailChange)
router.post('/contact', submitContactMessage)
router.post('/test-email', protect, sendMailDiagnostic)

router.get('/me', protect, getMe)
router.patch('/me', protect, updateProfile)
router.delete('/me', protect, deleteAccount)
router.post('/me/avatar', protect, avatarUpload.single('avatar'), uploadAvatar)
router.put('/me/password', protect, changePassword)
router.post('/me/email', protect, requestEmailChange)
router.delete('/me/email', protect, cancelEmailChange)

router.get('/', protect, getUsers)
// Keep after /me so "me" is never read as an id.
router.get('/:id/profile', protect, getUserProfile)

export default router
