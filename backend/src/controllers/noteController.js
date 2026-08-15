import prisma from '../config/prisma.js'
import { removeUploadedFile } from '../utils/storage.js'
import { createAndEmitNotification } from '../utils/notification.js'
import { getFolderShare, canEditFolder, resolveFolderOwner, emitFolderEvent } from '../utils/folderShare.js'

// @desc    Get all subjects for logged-in user
// @route   GET /api/notes/subjects
export const getSubjects = async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.user.id },
      select: { subject: true },
      distinct: ['subject'],
    })
    res.json([...new Set(notes.map(n => n.subject))])
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Create a new subject (creates a placeholder note so the subject persists)
// @route   POST /api/notes/subjects
export const createSubject = async (req, res) => {
  try {
    const { name } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Subject name is required' })
    }

    const trimmedName = name.trim()

    const existing = await prisma.note.findFirst({
      where: { userId: req.user.id, subject: trimmedName },
    })
    if (existing) {
      return res.status(400).json({ message: 'Subject already exists' })
    }

    await prisma.note.create({
      data: {
        userId: req.user.id,
        title: '__subject_placeholder__',
        subject: trimmedName,
        tags: ['__system__'],
      },
    })

    res.status(201).json({ name: trimmedName })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Rename a subject (updates all notes under it)
// @route   PUT /api/notes/subjects/:name
export const renameSubject = async (req, res) => {
  try {
    const oldName = decodeURIComponent(req.params.name)
    const { newName } = req.body
    if (!newName || !newName.trim()) {
      return res.status(400).json({ message: 'New name is required' })
    }
    const trimmed = newName.trim()

    const existing = await prisma.note.findFirst({
      where: { userId: req.user.id, subject: trimmed },
    })
    if (existing) {
      return res.status(400).json({ message: 'A subject with that name already exists' })
    }

    // Notes, tasks, documents and any shares of this folder all key off the folder
    // name, so they move together.
    await prisma.$transaction([
      prisma.note.updateMany({
        where: { userId: req.user.id, subject: oldName },
        data: { subject: trimmed },
      }),
      prisma.task.updateMany({
        where: { userId: req.user.id, subject: oldName },
        data: { subject: trimmed },
      }),
      prisma.document.updateMany({
        where: { userId: req.user.id, source: 'notebook', subject: oldName },
        data: { subject: trimmed },
      }),
      prisma.folderShare.updateMany({
        where: { ownerId: req.user.id, subject: oldName },
        data: { subject: trimmed },
      }),
    ])
    res.json({ oldName, newName: trimmed })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Delete a subject with everything filed under it (notes, tasks, documents)
// @route   DELETE /api/notes/subjects/:name
export const deleteSubject = async (req, res) => {
  try {
    const subjectName = decodeURIComponent(req.params.name)
    // First delete all blocks for notes in this subject
    const notes = await prisma.note.findMany({
      where: { userId: req.user.id, subject: subjectName },
      select: { id: true },
    })
    const noteIds = notes.map(n => n.id)
    if (noteIds.length > 0) {
      await prisma.noteBlock.deleteMany({ where: { noteId: { in: noteIds } } })
    }
    await prisma.note.deleteMany({ where: { userId: req.user.id, subject: subjectName } })

    // Tasks are folder-scoped too — they go with it.
    await prisma.task.deleteMany({ where: { userId: req.user.id, subject: subjectName } })

    // Documents: drop the uploaded files from disk before their rows.
    const documents = await prisma.document.findMany({
      where: { userId: req.user.id, source: 'notebook', subject: subjectName },
      select: { id: true, filePath: true },
    })
    for (const doc of documents) {
      removeUploadedFile(doc.filePath)
    }
    await prisma.document.deleteMany({
      where: { userId: req.user.id, source: 'notebook', subject: subjectName },
    })

    // Drop any shares of this folder — recipients lose access when it's gone.
    await prisma.folderShare.deleteMany({
      where: { ownerId: req.user.id, subject: subjectName },
    })

    res.json({ message: 'Subject, notes, tasks and documents deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Share one of my folders with another user (by email), view or edit
// @route   POST /api/notes/subjects/:name/share
export const shareSubject = async (req, res) => {
  try {
    const subject = decodeURIComponent(req.params.name)
    const userId = (req.body.userId || '').trim()
    const email = (req.body.email || '').trim()
    const permission = req.body.permission === 'edit' ? 'edit' : 'view'

    if (!userId && !email) {
      return res.status(400).json({ message: 'Pick a person to share with' })
    }

    // The folder must actually exist for me (a note carries the subject string).
    const ownsFolder = await prisma.note.findFirst({
      where: { userId: req.user.id, subject },
    })
    if (!ownsFolder) {
      return res.status(404).json({ message: 'Folder not found' })
    }

    // Prefer the picked user id; fall back to an email lookup.
    const recipient = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true },
        })
      : await prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true, name: true, email: true },
        })
    if (!recipient) {
      return res.status(404).json({ message: 'That Medzae user could not be found' })
    }
    if (recipient.id === req.user.id) {
      return res.status(400).json({ message: 'You already own this folder' })
    }

    // Upsert so re-sharing simply updates the permission.
    const share = await prisma.folderShare.upsert({
      where: {
        ownerId_subject_sharedWithId: {
          ownerId: req.user.id,
          subject,
          sharedWithId: recipient.id,
        },
      },
      update: { permission },
      create: {
        ownerId: req.user.id,
        subject,
        sharedWithId: recipient.id,
        permission,
      },
    })

    // The recipient's sidebar picks the folder up without a reload.
    emitFolderEvent(req.app.get('io'), {
      ownerId: req.user.id,
      subject,
      actorId: req.user.id,
      event: 'notebook:access-changed',
    })

    // Let the recipient know, in-app + real-time.
    try {
      const io = req.app.get('io')
      await createAndEmitNotification(io, {
        userId: recipient.id,
        type: 'folder_share',
        title: 'A folder was shared with you',
        message: `${req.user.name} shared the folder "${subject}" with you (${permission === 'edit' ? 'can edit' : 'view only'}).`,
        link: '/notebook',
        metadata: { ownerId: req.user.id, subject, permission },
      })
    } catch (notifyErr) {
      console.error('⚠️ Folder-share notification failed:', notifyErr.message)
    }

    res.status(201).json({
      id: share.id,
      subject,
      permission: share.permission,
      user: recipient,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    List the users a folder of mine is shared with
// @route   GET /api/notes/subjects/:name/shares
export const getSubjectShares = async (req, res) => {
  try {
    const subject = decodeURIComponent(req.params.name)
    const shares = await prisma.folderShare.findMany({
      where: { ownerId: req.user.id, subject },
      include: { sharedWith: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    })
    res.json(
      shares.map(s => ({
        id: s.id,
        permission: s.permission,
        user: s.sharedWith,
      }))
    )
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Revoke a user's access to one of my folders
// @route   DELETE /api/notes/subjects/:name/share/:userId
export const revokeSubjectShare = async (req, res) => {
  try {
    const subject = decodeURIComponent(req.params.name)
    await prisma.folderShare.deleteMany({
      where: { ownerId: req.user.id, subject, sharedWithId: req.params.userId },
    })

    const io = req.app.get('io')
    emitFolderEvent(io, {
      ownerId: req.user.id,
      subject,
      actorId: req.user.id,
      event: 'notebook:access-changed',
    })
    // The share row is gone, so the person who lost access is no longer part of
    // the folder's audience — tell them directly or their sidebar keeps a folder
    // they can no longer open.
    if (io) {
      io.to(`user_${req.params.userId}`).emit('notebook:access-changed', {
        ownerId: req.user.id,
        subject,
        actorId: req.user.id,
        revoked: true,
      })
    }

    res.json({ message: 'Access revoked' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    List folders other users have shared with me
// @route   GET /api/notes/shared
export const getSharedSubjects = async (req, res) => {
  try {
    const shares = await prisma.folderShare.findMany({
      where: { sharedWithId: req.user.id },
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(
      shares.map(s => ({
        subject: s.subject,
        permission: s.permission,
        ownerId: s.owner.id,
        ownerName: s.owner.name,
        ownerEmail: s.owner.email,
      }))
    )
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    How many people each of my own folders is shared with
// @route   GET /api/notes/shares/mine
export const getMyFolderShares = async (req, res) => {
  try {
    const grouped = await prisma.folderShare.groupBy({
      by: ['subject'],
      where: { ownerId: req.user.id },
      _count: { _all: true },
    })
    res.json(grouped.map(g => ({ subject: g.subject, count: g._count._all })))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Get all notes for logged-in user
// @route   GET /api/notes
export const getNotes = async (req, res) => {
  try {
    const { ownerId, subject } = req.query
    let where = { userId: req.user.id, title: { not: '__subject_placeholder__' } }

    // Reading a folder shared with me: fetch the owner's notes for that folder,
    // but only after confirming a share grants me access.
    if (ownerId && ownerId !== req.user.id) {
      const share = await getFolderShare(req.user.id, ownerId, subject)
      if (!share) return res.status(403).json({ message: 'Folder not shared with you' })
      where = { userId: ownerId, subject, title: { not: '__subject_placeholder__' } }
    }

    const notes = await prisma.note.findMany({
      where,
      include: { blocks: { orderBy: { order: 'asc' } } },
      orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
    })
    res.json(notes.map(n => ({
      ...n,
      _id: n.id,
      blocks: (n.blocks || []).map(b => ({ ...b, _id: b.id })),
    })))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Create a note
// @route   POST /api/notes
export const createNote = async (req, res) => {
  try {
    const { title, subject, blocks, tags, ownerId } = req.body
    // In a shared folder, new notes belong to the folder's owner (so they appear
    // in the shared view) — allowed only with edit access.
    const owner = await resolveFolderOwner(req.user.id, ownerId, subject)
    if (owner.error) return res.status(403).json({ message: owner.error })

    const note = await prisma.note.create({
      data: {
        userId: owner.userId,
        title,
        subject,
        tags: tags || [],
        blocks: {
          create: (blocks || []).map((b, i) => ({
            type: b.type,
            text: b.text || '',
            checked: b.checked || false,
            order: i,
          })),
        },
      },
      include: { blocks: { orderBy: { order: 'asc' } } },
    })
    const payload = {
      ...note,
      _id: note.id,
      blocks: (note.blocks || []).map(b => ({ ...b, _id: b.id })),
    }
    emitFolderEvent(req.app.get('io'), {
      ownerId: note.userId,
      subject: note.subject,
      actorId: req.user.id,
      event: 'notebook:note-saved',
      payload: { note: payload },
    })
    res.status(201).json(payload)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Update a note
// @route   PUT /api/notes/:id
export const updateNote = async (req, res) => {
  try {
    const existing = await prisma.note.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ message: 'Note not found' })
    // Mine, or a note in a folder shared to me with edit access.
    if (existing.userId !== req.user.id) {
      const allowed = await canEditFolder(req.user.id, existing.userId, existing.subject)
      if (!allowed) return res.status(403).json({ message: 'Note not found' })
    }

    const { title, subject, blocks, tags } = req.body
    const updateData = {}
    if (title !== undefined) updateData.title = title
    if (subject !== undefined) updateData.subject = subject
    if (tags !== undefined) updateData.tags = tags

    // A save replaces the whole block list, so two of them running at once used
    // to interleave — both would clear the blocks, then both would insert their
    // own copy, leaving the note with every block twice. Locking the note row
    // first makes concurrent saves queue up: the second one deletes what the
    // first inserted instead of racing it.
    const note = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Note" WHERE id = ${req.params.id} FOR UPDATE`

      if (blocks !== undefined) {
        await tx.noteBlock.deleteMany({ where: { noteId: req.params.id } })
        updateData.blocks = {
          create: blocks.map((b, i) => ({
            type: b.type,
            text: b.text || '',
            checked: b.checked || false,
            order: i,
          })),
        }
      }

      return tx.note.update({
        where: { id: req.params.id },
        data: updateData,
        include: { blocks: { orderBy: { order: 'asc' } } },
      })
    })

    const payload = {
      ...note,
      _id: note.id,
      blocks: (note.blocks || []).map(b => ({ ...b, _id: b.id })),
    }
    // Everyone else with the folder open sees the edit without reloading.
    emitFolderEvent(req.app.get('io'), {
      ownerId: note.userId,
      subject: note.subject,
      actorId: req.user.id,
      event: 'notebook:note-saved',
      payload: { note: payload },
    })
    res.json(payload)
  } catch (error) {
    // The note was deleted between the access check and the write — a save
    // racing a delete, not a server fault.
    if (error.code === 'P2025') return res.status(404).json({ message: 'Note not found' })
    res.status(500).json({ message: error.message })
  }
}

// @desc    Reorder notes within a subject
// @route   PUT /api/notes/reorder
export const reorderNotes = async (req, res) => {
  try {
    const { noteIds } = req.body
    if (!noteIds || !Array.isArray(noteIds)) {
      return res.status(400).json({ message: 'noteIds array is required' })
    }

    // Update each note's position in a transaction
    await prisma.$transaction(
      noteIds.map((id, index) =>
        prisma.note.updateMany({
          where: { id, userId: req.user.id },
          data: { position: index },
        })
      )
    )

    res.json({ message: 'Notes reordered' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Delete a note
// @route   DELETE /api/notes/:id
export const deleteNote = async (req, res) => {
  try {
    const note = await prisma.note.findUnique({ where: { id: req.params.id } })
    if (!note) return res.status(404).json({ message: 'Note not found' })
    // Mine, or a note in a folder shared to me with edit access.
    if (note.userId !== req.user.id) {
      const allowed = await canEditFolder(req.user.id, note.userId, note.subject)
      if (!allowed) return res.status(403).json({ message: 'Note not found' })
    }
    // Blocks cascade-delete via onDelete: Cascade
    await prisma.note.delete({ where: { id: req.params.id } })
    emitFolderEvent(req.app.get('io'), {
      ownerId: note.userId,
      subject: note.subject,
      actorId: req.user.id,
      event: 'notebook:note-removed',
      payload: { noteId: note.id },
    })
    res.json({ message: 'Note deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
