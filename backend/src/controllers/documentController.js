import prisma from '../config/prisma.js'
import fs from 'fs'
import path from 'path'
import { extractTextFromFile } from '../utils/extractText.js'
import { isRemoteUrl, removeUploadedFile } from '../utils/storage.js'
import { getFolderShare, canEditFolder, resolveFolderOwner } from '../utils/folderShare.js'

// @desc    Get all documents for logged-in user (optionally by source / notebook folder)
// @route   GET /api/documents?source=assistant|notebook&subject=Anatomy  (shared: &ownerId=...)
export const getDocuments = async (req, res) => {
  try {
    const { ownerId, subject } = req.query
    const where = { userId: req.user.id }
    if (req.query.source) {
      where.source = req.query.source
    }
    if (subject) {
      where.subject = subject
    }

    // Reading a shared folder's documents: swap to the owner after a share check.
    if (ownerId && ownerId !== req.user.id) {
      const share = await getFolderShare(req.user.id, ownerId, subject)
      if (!share) return res.status(403).json({ message: 'Folder not shared with you' })
      where.userId = ownerId
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    res.json(documents.map(d => ({ ...d, _id: d.id })))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Upload a document (via multer disk storage)
// @route   POST /api/documents
export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const { originalname, mimetype, size, filename, path: filePath } = req.file
    const docType = req.body.type || 'other'
    const docSource = req.body.source || 'assistant'
    // Notebook uploads are filed under the folder that was open; other sources aren't scoped.
    const docSubject =
      docSource === 'notebook' && req.body.subject?.trim() ? req.body.subject.trim() : null

    // Uploading into a shared folder files the document under its owner (edit access only).
    let docUserId = req.user.id
    if (docSource === 'notebook' && req.body.ownerId && req.body.ownerId !== req.user.id) {
      const owner = await resolveFolderOwner(req.user.id, req.body.ownerId, docSubject)
      if (owner.error) return res.status(403).json({ message: owner.error })
      docUserId = owner.userId
    }

    const document = await prisma.document.create({
      data: {
        userId: docUserId,
        name: req.body.name || originalname,
        type: docType,
        source: docSource,
        subject: docSubject,
        filePath: filename, // store just the filename, serve from uploads/
        mimeType: mimetype,
        size,
      },
    })

    // Auto-extract text only for AI assistant documents (not chat/notebook uploads)
    if (docSource === 'assistant') {
      const uploadsDir = path.join(process.cwd(), 'uploads')
      const fullFilePath = path.join(uploadsDir, filename)
      extractTextFromFile(fullFilePath, mimetype)
        .then(async (extractedText) => {
          if (extractedText) {
            await prisma.document.update({
              where: { id: document.id },
              data: { extractedText },
            })
            console.log(`✅ Text extracted from "${document.name}" (${extractedText.length} chars)`)
          }
        })
        .catch((err) => {
          console.error(`⚠️ Auto-extraction failed for "${document.name}":`, err.message)
        })
    }

    res.status(201).json({ ...document, _id: document.id })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Download/get a specific document
// @route   GET /api/documents/:id/download
export const downloadDocument = async (req, res) => {
  try {
    const document = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!document) return res.status(404).json({ message: 'Document not found' })
    // Mine, or a document in a folder shared to me (view access is enough to open).
    if (document.userId !== req.user.id) {
      const share = await getFolderShare(req.user.id, document.userId, document.subject)
      if (!share) return res.status(404).json({ message: 'Document not found' })
    }

    // Files stored in cloud storage keep an absolute URL in filePath.
    if (isRemoteUrl(document.filePath)) {
      return res.json({
        name: document.name,
        type: document.type,
        mimeType: document.mimeType,
        fileUrl: document.filePath,
      })
    }

    const uploadsDir = path.join(process.cwd(), 'uploads')
    const fullPath = path.join(uploadsDir, document.filePath)

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'File not found on disk' })
    }

    // Read file and send as base64 (for frontend compatibility)
    const fileBuffer = fs.readFileSync(fullPath)
    const base64Data = fileBuffer.toString('base64')

    res.json({
      name: document.name,
      type: document.type,
      mimeType: document.mimeType,
      fileData: base64Data,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Delete a document
// @route   DELETE /api/documents/:id
export const deleteDocument = async (req, res) => {
  try {
    const document = await prisma.document.findUnique({ where: { id: req.params.id } })
    if (!document) return res.status(404).json({ message: 'Document not found' })
    // Mine, or a document in a folder shared to me with edit access.
    if (document.userId !== req.user.id) {
      const allowed = await canEditFolder(req.user.id, document.userId, document.subject)
      if (!allowed) return res.status(404).json({ message: 'Document not found' })
    }

    // Remove file from disk (no-op for cloud-hosted uploads)
    removeUploadedFile(document.filePath)

    await prisma.document.delete({ where: { id: req.params.id } })
    res.json({ message: 'Document deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
