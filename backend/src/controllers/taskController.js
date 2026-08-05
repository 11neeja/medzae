import prisma from '../config/prisma.js'
import { getFolderShare, canEditFolder, resolveFolderOwner } from '../utils/folderShare.js'

// @desc    Get all tasks for logged-in user (optionally one notebook folder)
// @route   GET /api/tasks?subject=Anatomy  (shared: &ownerId=...)
export const getTasks = async (req, res) => {
  try {
    const { ownerId, subject } = req.query
    const where = { userId: req.user.id }
    if (subject) {
      where.subject = subject
    }

    // Reading a shared folder's tasks: swap to the owner after a share check.
    if (ownerId && ownerId !== req.user.id) {
      const share = await getFolderShare(req.user.id, ownerId, subject)
      if (!share) return res.status(403).json({ message: 'Folder not shared with you' })
      where.userId = ownerId
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    res.json(tasks.map(t => ({ ...t, _id: t.id })))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Create a task, optionally filed under a notebook folder
// @route   POST /api/tasks
export const createTask = async (req, res) => {
  try {
    const { title, subject, ownerId } = req.body
    const cleanSubject = subject?.trim() ? subject.trim() : null
    // In a shared folder, the task belongs to the folder's owner (edit access only).
    const owner = await resolveFolderOwner(req.user.id, ownerId, cleanSubject)
    if (owner.error) return res.status(403).json({ message: owner.error })

    const task = await prisma.task.create({
      data: {
        userId: owner.userId,
        title,
        subject: cleanSubject,
      },
    })
    res.status(201).json({ ...task, _id: task.id })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Toggle task completion
// @route   PUT /api/tasks/:id/toggle
export const toggleTask = async (req, res) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } })
    if (!task) return res.status(404).json({ message: 'Task not found' })
    if (task.userId !== req.user.id) {
      const allowed = await canEditFolder(req.user.id, task.userId, task.subject)
      if (!allowed) return res.status(404).json({ message: 'Task not found' })
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: { completed: !task.completed },
    })
    res.json({ ...updated, _id: updated.id })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
export const deleteTask = async (req, res) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } })
    if (!task) return res.status(404).json({ message: 'Task not found' })
    if (task.userId !== req.user.id) {
      const allowed = await canEditFolder(req.user.id, task.userId, task.subject)
      if (!allowed) return res.status(404).json({ message: 'Task not found' })
    }
    await prisma.task.delete({ where: { id: req.params.id } })
    res.json({ message: 'Task deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
