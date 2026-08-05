import fs from 'fs'
import path from 'path'
import { uploadsDir } from './upload.js'
import { isCloudinaryConfigured, uploadToCloudinary } from './cloudinary.js'

/**
 * Persist an uploaded (in-memory) file to shared cloud storage in production,
 * falling back to local disk when Cloudinary is not configured (dev only).
 *
 * Requires the route to use a memory-storage multer instance so `file.buffer`
 * is populated (see createMemoryUpload).
 *
 * @param {object} file - a multer file (must have `buffer` and `originalname`)
 * @param {object} [opts]
 * @param {string} [opts.folder] - Cloudinary folder (e.g. 'medihub/chat')
 * @param {string} [opts.prefix] - filename prefix for the disk fallback
 * @returns {Promise<string>} absolute Cloudinary URL, or a /uploads/... path
 */
export async function persistFile(file, opts = {}) {
  const { folder = 'medihub/uploads', prefix = 'file' } = opts

  if (isCloudinaryConfigured()) {
    // Images upload as 'image'; everything else (pdf, docx, ...) as 'raw'.
    const resourceType = file.mimetype?.startsWith('image/') ? 'image' : 'raw'
    return uploadToCloudinary(file.buffer, { folder, resourceType })
  }

  // Local dev fallback: write the buffer to the uploads directory.
  const ext = path.extname(file.originalname)
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer)
  return `/uploads/${filename}`
}

/**
 * Whether a stored URL points at external cloud storage (absolute) rather than
 * our local /uploads directory.
 * @param {string} url
 * @returns {boolean}
 */
export function isRemoteUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

/**
 * Delete a locally stored upload. Accepts either a bare filename or a
 * /uploads/... path; remote (Cloudinary) URLs and missing files are no-ops.
 * @param {string} storedPath - Document.filePath as saved in the database
 */
export function removeUploadedFile(storedPath) {
  if (!storedPath || isRemoteUrl(storedPath)) return
  const fullPath = path.join(uploadsDir, path.basename(storedPath))
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
  } catch (error) {
    console.error(`⚠️ Could not remove upload "${storedPath}":`, error.message)
  }
}
