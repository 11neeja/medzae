import prisma from '../config/prisma.js'

// Notebook folders are just the `Note.subject` string, so "sharing a folder" is a
// FolderShare row keyed on owner + folder-name + recipient. These helpers answer
// "may this viewer touch someone else's folder?" for the read/write endpoints.

/**
 * The FolderShare granting `viewerId` access to `ownerId`'s folder `subject`,
 * or null when none exists. Returns null for self-access (callers should treat
 * that as "own data", not shared).
 */
export async function getFolderShare(viewerId, ownerId, subject) {
  if (!ownerId || !subject || ownerId === viewerId) return null
  return prisma.folderShare.findUnique({
    where: {
      ownerId_subject_sharedWithId: { ownerId, subject, sharedWithId: viewerId },
    },
  })
}

/** True if `viewerId` may read `ownerId`'s folder `subject` (any permission). */
export async function canViewFolder(viewerId, ownerId, subject) {
  return (await getFolderShare(viewerId, ownerId, subject)) !== null
}

/** True if `viewerId` may write to `ownerId`'s folder `subject` (edit permission). */
export async function canEditFolder(viewerId, ownerId, subject) {
  const share = await getFolderShare(viewerId, ownerId, subject)
  return share?.permission === 'edit'
}

/**
 * Resolve which user should own a row created in a (possibly shared) folder.
 * Returns { userId } filed under the owner when the viewer has edit access, under
 * the viewer for their own folders, or { error } when access is denied.
 */
export async function resolveFolderOwner(viewerId, ownerId, subject) {
  if (!ownerId || ownerId === viewerId) return { userId: viewerId }
  if (await canEditFolder(viewerId, ownerId, subject)) return { userId: ownerId }
  return { error: 'You do not have edit access to this folder' }
}
