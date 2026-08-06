import express from 'express'
import { getNotes, createNote, updateNote, deleteNote, reorderNotes, getSubjects, createSubject, renameSubject, deleteSubject, shareSubject, getSubjectShares, revokeSubjectShare, getSharedSubjects, getMyFolderShares } from '../controllers/noteController.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

// Folders shared with me (must come before /:id)
router.get('/shared', protect, getSharedSubjects)

// Folders I've shared out, with a headcount per folder (must come before /:id)
router.get('/shares/mine', protect, getMyFolderShares)

// Subject routes (must come before /:id)
router.get('/subjects', protect, getSubjects)
router.post('/subjects', protect, createSubject)
router.put('/subjects/:name', protect, renameSubject)
router.delete('/subjects/:name', protect, deleteSubject)

// Folder sharing
router.post('/subjects/:name/share', protect, shareSubject)
router.get('/subjects/:name/shares', protect, getSubjectShares)
router.delete('/subjects/:name/share/:userId', protect, revokeSubjectShare)

router.get('/', protect, getNotes)
router.post('/', protect, createNote)
router.put('/reorder', protect, reorderNotes)
router.put('/:id', protect, updateNote)
router.delete('/:id', protect, deleteNote)

export default router
