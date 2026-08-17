import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Resolve a stored file path into something the browser can fetch.
 *
 * Uploads are served by the API host, not the web app. In production
 * persistFile returns an absolute Cloudinary URL and this is a no-op, but the
 * local-disk fallback returns "/uploads/..." — which the browser would
 * otherwise resolve against the frontend origin and 404.
 */
export const assetUrl = (path: string): string => {
  if (!path || /^https?:\/\//i.test(path)) return path
  const origin = API_URL.replace(/\/api\/?$/, '')
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`
}

// Request interceptor for adding auth token.
// Sessions without "remember me" store the token in sessionStorage, so check both.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ─── Health Check ──────────────────────────────────────────────────
export const checkBackendHealth = async (): Promise<{
  status: string
  server: boolean
  database: string
}> => {
  const res = await api.get('/health')
  return res.data
}

// ─── Auth API ──────────────────────────────────────────────────────
export const loginAPI = async (email: string, password: string, rememberMe = false) => {
  const res = await api.post('/users/login', { email, password, rememberMe })
  return res.data
}

export const registerAPI = async (name: string, email: string, password: string, rememberMe = false) => {
  const res = await api.post('/users/register', { name, email, password, rememberMe })
  return res.data
}

// credential = Google ID token from Google Identity Services; the backend
// verifies it and signs the user in (creating the account on first use).
export const googleLoginAPI = async (credential: string, rememberMe = false) => {
  const res = await api.post('/users/google', { credential, rememberMe })
  return res.data
}

export const forgotPasswordAPI = async (email: string) => {
  const res = await api.post('/users/forgot-password', { email })
  return res.data
}

export const resetPasswordAPI = async (email: string, token: string, password: string) => {
  const res = await api.post('/users/reset-password', { email, token, password })
  return res.data
}

export const getMeAPI = async () => {
  const res = await api.get('/users/me')
  return res.data
}

export const sendContactMessageAPI = async (data: { name: string; email: string; message: string }) => {
  const res = await api.post('/users/contact', data)
  return res.data
}

// ─── Profile API ────────────────────────────────────────────────────
export interface ProfileUpdate {
  name?: string
  headline?: string | null
  bio?: string | null
  careerStage?: string | null
  institution?: string | null
  specialty?: string | null
  qualification?: string | null
  designation?: string | null
  yearsExperience?: number | null
  studyYear?: string | null
  graduationYear?: number | null
  city?: string | null
  country?: string | null
  websiteUrl?: string | null
  linkedinUrl?: string | null
  twitterUrl?: string | null
  isProfilePublic?: boolean
  showEmail?: boolean
  /** `preset:<id>` from the avatar catalog, or null to clear back to initials */
  avatarUrl?: string | null
}

export const getUsersAPI = async () => {
  const res = await api.get('/users')
  return res.data
}

export const updateProfileAPI = async (data: ProfileUpdate) => {
  const res = await api.patch('/users/me', data)
  return res.data
}

export const uploadAvatarAPI = async (file: File) => {
  const formData = new FormData()
  formData.append('avatar', file)
  const res = await api.post('/users/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const changePasswordAPI = async (currentPassword: string, newPassword: string) => {
  const res = await api.put('/users/me/password', { currentPassword, newPassword })
  return res.data
}

export const requestEmailChangeAPI = async (newEmail: string, currentPassword?: string) => {
  const res = await api.post('/users/me/email', { newEmail, currentPassword })
  return res.data
}

export const cancelEmailChangeAPI = async () => {
  const res = await api.delete('/users/me/email')
  return res.data
}

export const confirmEmailChangeAPI = async (token: string) => {
  const res = await api.post('/users/confirm-email', { token })
  return res.data
}

export const deleteAccountAPI = async (payload: { password?: string; confirmText?: string }) => {
  const res = await api.delete('/users/me', { data: payload })
  return res.data
}

export const getUserProfileAPI = async (userId: string) => {
  const res = await api.get(`/users/${userId}/profile`)
  return res.data
}

// ─── Posts API ──────────────────────────────────────────────────────
export const getPostsAPI = async () => {
  const res = await api.get('/posts')
  return res.data
}

export const createPostAPI = async (data: {
  content: string
  tags?: string[]
  linkUrl?: string
  image?: File
}) => {
  const formData = new FormData()
  formData.append('content', data.content)
  if (data.tags) formData.append('tags', JSON.stringify(data.tags))
  if (data.linkUrl) formData.append('linkUrl', data.linkUrl)
  if (data.image) formData.append('image', data.image)
  const res = await api.post('/posts', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const toggleLikeAPI = async (postId: string) => {
  const res = await api.put(`/posts/${postId}/like`)
  return res.data
}

export const toggleBookmarkAPI = async (postId: string) => {
  const res = await api.put(`/posts/${postId}/bookmark`)
  return res.data
}

export const addCommentAPI = async (postId: string, content: string) => {
  const res = await api.post(`/posts/${postId}/comments`, { content })
  return res.data
}

export const deleteCommentAPI = async (postId: string, commentId: string) => {
  const res = await api.delete(`/posts/${postId}/comments/${commentId}`)
  return res.data
}

export const repostAPI = async (postId: string, content?: string) => {
  const res = await api.post(`/posts/${postId}/repost`, { content })
  return res.data
}

export const deletePostAPI = async (postId: string) => {
  const res = await api.delete(`/posts/${postId}`)
  return res.data
}

// ─── Notes API ─────────────────────────────────────────────────────
// Pass { ownerId, subject } to read a folder someone else shared with you.
export const getNotesAPI = async (shared?: { ownerId: string; subject: string }) => {
  const params = shared
    ? `?ownerId=${encodeURIComponent(shared.ownerId)}&subject=${encodeURIComponent(shared.subject)}`
    : ''
  const res = await api.get(`/notes${params}`)
  return res.data
}

export const createNoteAPI = async (data: {
  title: string
  subject: string
  blocks?: any[]
  tags?: string[]
  /** Owner of the shared folder to file this note under (shared-folder edits). */
  ownerId?: string
}) => {
  const res = await api.post('/notes', data)
  return res.data
}

export const updateNoteAPI = async (
  id: string,
  data: { title?: string; subject?: string; blocks?: any[]; tags?: string[] }
) => {
  const res = await api.put(`/notes/${id}`, data)
  return res.data
}

export const deleteNoteAPI = async (id: string) => {
  const res = await api.delete(`/notes/${id}`)
  return res.data
}

export const reorderNotesAPI = async (noteIds: string[]) => {
  const res = await api.put('/notes/reorder', { noteIds })
  return res.data
}

// ─── Subjects API ──────────────────────────────────────────────────
export const getSubjectsAPI = async (): Promise<string[]> => {
  const res = await api.get('/notes/subjects')
  return res.data
}

export const createSubjectAPI = async (name: string) => {
  const res = await api.post('/notes/subjects', { name })
  return res.data
}

export const renameSubjectAPI = async (oldName: string, newName: string) => {
  const res = await api.put(`/notes/subjects/${encodeURIComponent(oldName)}`, { newName })
  return res.data
}

export const deleteSubjectAPI = async (name: string) => {
  const res = await api.delete(`/notes/subjects/${encodeURIComponent(name)}`)
  return res.data
}

// ─── Folder Sharing API ────────────────────────────────────────────
export type FolderPermission = 'view' | 'edit'

export interface SharedFolder {
  subject: string
  permission: FolderPermission
  ownerId: string
  ownerName: string
  ownerEmail: string
}

export interface FolderShareEntry {
  id: string
  permission: FolderPermission
  user: { id: string; name: string; email: string }
}

// Folders other users have shared with me.
export const getSharedFoldersAPI = async (): Promise<SharedFolder[]> => {
  const res = await api.get('/notes/shared')
  return res.data
}

// My own folders that are shared out, with how many people each reaches — the
// sidebar marks those folders so sharing is visible without opening a dialog.
export const getMyFolderSharesAPI = async (): Promise<{ subject: string; count: number }[]> => {
  const res = await api.get('/notes/shares/mine')
  return res.data
}

// Share one of my folders with a user (picked from the user search).
export const shareSubjectAPI = async (
  subject: string,
  userId: string,
  permission: FolderPermission
): Promise<FolderShareEntry> => {
  const res = await api.post(`/notes/subjects/${encodeURIComponent(subject)}/share`, {
    userId,
    permission,
  })
  return res.data
}

// Who a folder of mine is currently shared with.
export const getSubjectSharesAPI = async (subject: string): Promise<FolderShareEntry[]> => {
  const res = await api.get(`/notes/subjects/${encodeURIComponent(subject)}/shares`)
  return res.data
}

export const revokeSubjectShareAPI = async (subject: string, userId: string) => {
  const res = await api.delete(`/notes/subjects/${encodeURIComponent(subject)}/share/${userId}`)
  return res.data
}

// ─── Documents API ─────────────────────────────────────────────────
// Pass { ownerId, subject } to read documents in a folder someone shared with you.
export const getDocumentsAPI = async (
  source?: 'assistant' | 'notebook',
  shared?: { ownerId: string; subject: string }
) => {
  const query = new URLSearchParams()
  if (source) query.set('source', source)
  if (shared) {
    query.set('ownerId', shared.ownerId)
    query.set('subject', shared.subject)
  }
  const qs = query.toString()
  const res = await api.get(`/documents${qs ? `?${qs}` : ''}`)
  return res.data
}

export const uploadDocumentAPI = async (data: {
  name: string
  type: string
  file: File
  source?: 'assistant' | 'notebook'
  /** Notebook folder to file this document under (notebook uploads only). */
  subject?: string
  /** Owner of the shared folder to file this document under (shared-folder edits). */
  ownerId?: string
}) => {
  const formData = new FormData()
  formData.append('file', data.file)
  formData.append('name', data.name)
  formData.append('type', data.type)
  if (data.source) formData.append('source', data.source)
  if (data.subject) formData.append('subject', data.subject)
  if (data.ownerId) formData.append('ownerId', data.ownerId)
  const res = await api.post('/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const downloadDocumentAPI = async (id: string) => {
  const res = await api.get(`/documents/${id}/download`)
  return res.data
}

export const deleteDocumentAPI = async (id: string) => {
  const res = await api.delete(`/documents/${id}`)
  return res.data
}

// ─── AI Assistant API ──────────────────────────────────────────────
// Generation can be slow (model fallbacks + a sleeping Render backend waking
// up), so give these calls a long leash — but never let them hang forever.
const AI_REQUEST_TIMEOUT_MS = 150_000

export const aiChatAPI = async (data: {
  message: string
  documentIds?: string[]
  chatHistory?: { sender: string; text: string }[]
}) => {
  const res = await api.post('/ai/chat', data, { timeout: AI_REQUEST_TIMEOUT_MS })
  return res.data
}

export const aiSummarizeAPI = async (documentId: string) => {
  const res = await api.post('/ai/summarize', { documentId }, { timeout: AI_REQUEST_TIMEOUT_MS })
  return res.data
}

export const getAiMessagesAPI = async () => {
  const res = await api.get('/ai/messages')
  return res.data
}

export const saveAiMessageAPI = async (data: {
  sender: string
  text: string
  relatedDocumentId?: string
}) => {
  const res = await api.post('/ai/messages', data)
  return res.data
}

export const clearAiMessagesAPI = async () => {
  const res = await api.delete('/ai/messages')
  return res.data
}

// ─── Tasks API ─────────────────────────────────────────────────────
// Pass { ownerId, subject } to read tasks in a folder someone shared with you.
export const getTasksAPI = async (shared?: { ownerId: string; subject: string }) => {
  const params = shared
    ? `?ownerId=${encodeURIComponent(shared.ownerId)}&subject=${encodeURIComponent(shared.subject)}`
    : ''
  const res = await api.get(`/tasks${params}`)
  return res.data
}

export const createTaskAPI = async (title: string, subject?: string, ownerId?: string) => {
  const res = await api.post('/tasks', { title, subject, ownerId })
  return res.data
}

export const toggleTaskAPI = async (id: string) => {
  const res = await api.put(`/tasks/${id}/toggle`)
  return res.data
}

export const deleteTaskAPI = async (id: string) => {
  const res = await api.delete(`/tasks/${id}`)
  return res.data
}

// ─── Events API ────────────────────────────────────────────────────
export const getEventsAPI = async () => {
  const res = await api.get('/events')
  return res.data
}

export const getEventbriteEventsAPI = async () => {
  const res = await api.get('/events/eventbrite')
  return res.data
}

export const refreshEventbriteCacheAPI = async () => {
  const res = await api.post('/events/eventbrite/refresh')
  return res.data
}

// Aggregated external events (Eventbrite + Hack Club + Devpost), filtered to health/medical
export const getExternalEventsAPI = async () => {
  const res = await api.get('/events/external')
  return res.data
}

export const refreshExternalEventsAPI = async () => {
  const res = await api.post('/events/external/refresh')
  return res.data
}

export const createEventAPI = async (data: any) => {
  const res = await api.post('/events', data)
  return res.data
}

export const toggleEventRegistrationAPI = async (id: string) => {
  const res = await api.put(`/events/${id}/register`)
  return res.data
}

// ─── Event registrations (calendar) ────────────────────────────────
// A registration is a snapshot of the event, not a pointer to it: external
// events only exist in the backend's 24h cache, so the calendar has to keep
// its own copy or entries would disappear when a source drops a listing.
export interface EventRegistration {
  id: string
  eventKey: string
  source: string
  title: string
  organizer: string | null
  dateText: string | null
  endDateText: string | null
  timeText: string | null
  location: string | null
  mode: string | null
  type: string | null
  imageUrl: string | null
  externalUrl: string | null
  startAt: string | null
  /** Last day of a multi-day event; null = single day. */
  endAt: string | null
  remindedDayBeforeAt: string | null
  remindedDayOfAt: string | null
  createdAt: string
}

export const getMyEventRegistrationsAPI = async (): Promise<EventRegistration[]> => {
  const res = await api.get('/events/registrations')
  return res.data
}

// Called only after the user confirms they actually completed registration on
// the source's site — never on the click that opened it.
export const confirmEventRegistrationAPI = async (data: {
  eventKey: string
  source?: string
  title: string
  organizer?: string
  date?: string
  endDate?: string
  time?: string
  location?: string
  mode?: string
  type?: string
  imageUrl?: string
  externalUrl?: string
}): Promise<EventRegistration> => {
  const res = await api.post('/events/registrations', data)
  return res.data
}

export const cancelEventRegistrationAPI = async (eventKey: string) => {
  const res = await api.delete(`/events/registrations/${encodeURIComponent(eventKey)}`)
  return res.data
}

// ─── Chat API ──────────────────────────────────────────────────────
export const getConversationsAPI = async () => {
  const res = await api.get('/chat/conversations')
  return res.data
}

export const getMessagesAPI = async (conversationId: string) => {
  const res = await api.get(`/chat/conversations/${conversationId}/messages`)
  return res.data
}

export const sendMessageAPI = async (conversationId: string, text: string) => {
  const res = await api.post(`/chat/conversations/${conversationId}/messages`, { text })
  return res.data
}

export const sendFileMessageAPI = async (conversationId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post(`/chat/conversations/${conversationId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const createPrivateConversationAPI = async (userId: string) => {
  const res = await api.post('/chat/conversations/private', { userId })
  return res.data
}

export const createGroupConversationAPI = async (name: string, memberIds: string[]) => {
  const res = await api.post('/chat/conversations/group', { name, memberIds })
  return res.data
}

export const togglePinConversationAPI = async (conversationId: string) => {
  const res = await api.put(`/chat/conversations/${conversationId}/pin`)
  return res.data
}

export const deleteConversationAPI = async (conversationId: string) => {
  const res = await api.delete(`/chat/conversations/${conversationId}`)
  return res.data
}

export const addGroupMembersAPI = async (conversationId: string, memberIds: string[]) => {
  const res = await api.post(`/chat/conversations/${conversationId}/members`, { memberIds })
  return res.data
}

export const removeGroupMemberAPI = async (conversationId: string, userId: string) => {
  const res = await api.delete(`/chat/conversations/${conversationId}/members/${userId}`)
  return res.data
}

export const searchUsersAPI = async (query: string) => {
  const res = await api.get(`/chat/users/search?q=${encodeURIComponent(query)}`)
  return res.data
}

export const getSharedFilesAPI = async (conversationId: string) => {
  const res = await api.get(`/chat/conversations/${conversationId}/files`)
  return res.data
}

export const handleJoinRequestAPI = async (requestId: string, action: 'approve' | 'reject') => {
  const res = await api.put(`/chat/join-requests/${requestId}`, { action })
  return res.data
}

// ─── Notifications API ─────────────────────────────────────────────
export const getNotificationsAPI = async () => {
  const res = await api.get('/notifications')
  return res.data
}

export const markNotificationReadAPI = async (id: string) => {
  const res = await api.put(`/notifications/${id}/read`)
  return res.data
}

export const markAllNotificationsReadAPI = async () => {
  const res = await api.put('/notifications/read-all')
  return res.data
}

export const clearAllNotificationsAPI = async () => {
  const res = await api.delete('/notifications')
  return res.data
}

// ─── News API ──────────────────────────────────────────────────────
export const getNewsAPI = async (params?: {
  specialty?: string
  search?: string
  sort?: string
}) => {
  const query = new URLSearchParams()
  if (params?.specialty && params.specialty !== 'All') query.set('specialty', params.specialty)
  if (params?.search) query.set('search', params.search)
  if (params?.sort) query.set('sort', params.sort)
  const qs = query.toString()
  const res = await api.get(`/news${qs ? `?${qs}` : ''}`)
  return res.data
}

export const getTrendingTopicsAPI = async () => {
  const res = await api.get('/news/trending')
  return res.data
}

// ─── Opportunities API ─────────────────────────────────────────────
export const getOpportunitiesAPI = async (params?: {
  department?: string
  location?: string
  type?: string
}) => {
  const query = new URLSearchParams()
  if (params?.department && params.department !== 'All') query.set('department', params.department)
  if (params?.location && params.location !== 'All') query.set('location', params.location)
  if (params?.type && params.type !== 'all') query.set('type', params.type)
  const qs = query.toString()
  const res = await api.get(`/opportunities${qs ? `?${qs}` : ''}`)
  return res.data
}

export const createOpportunityAPI = async (data: {
  roleTitle: string
  department: string
  type: string
  location: string
  description: string
  requirements: string[]
  duration: string
  postedBy: string
}) => {
  const res = await api.post('/opportunities', data)
  return res.data
}

export const applyToOpportunityAPI = async (id: string) => {
  const res = await api.post(`/opportunities/${id}/apply`)
  return res.data
}

export const getMyApplicationsAPI = async () => {
  const res = await api.get('/opportunities/applications')
  return res.data
}

// ── Groups / Communities ────────────────────────────────

export const getCommunitiesAPI = async () => {
  const res = await api.get('/groups')
  return res.data
}

export const createCommunityAPI = async (data: { name: string; description: string; category?: string; emoji?: string }) => {
  const res = await api.post('/groups', data)
  return res.data
}

export const updateCommunityAPI = async (id: string, data: { name?: string; description?: string; category?: string; emoji?: string }) => {
  const res = await api.put(`/groups/${id}`, data)
  return res.data
}

export const joinCommunityAPI = async (id: string) => {
  const res = await api.post(`/groups/${id}/join`)
  return res.data
}

export const leaveCommunityAPI = async (id: string) => {
  const res = await api.delete(`/groups/${id}/leave`)
  return res.data
}

export const getCommunityMembersAPI = async (id: string) => {
  const res = await api.get(`/groups/${id}/members`)
  return res.data
}

export const addCommunityMembersAPI = async (id: string, userIds: string[]) => {
  const res = await api.post(`/groups/${id}/members`, { userIds })
  return res.data
}

export const removeCommunityMemberAPI = async (id: string, userId: string) => {
  const res = await api.delete(`/groups/${id}/members/${userId}`)
  return res.data
}

export const getThreadsAPI = async (communityId: string, sort: string = 'hot') => {
  const res = await api.get(`/groups/${communityId}/threads?sort=${sort}`)
  return res.data
}

export const createThreadAPI = async (communityId: string, data: { title: string; content?: string; tags?: string[] }) => {
  const res = await api.post(`/groups/${communityId}/threads`, data)
  return res.data
}

export const voteThreadAPI = async (threadId: string, value: number) => {
  const res = await api.put(`/groups/threads/${threadId}/vote`, { value })
  return res.data
}

export const togglePinThreadAPI = async (threadId: string) => {
  const res = await api.put(`/groups/threads/${threadId}/pin`)
  return res.data
}

export const getThreadRepliesAPI = async (threadId: string) => {
  const res = await api.get(`/groups/threads/${threadId}/replies`)
  return res.data
}

export const createThreadReplyAPI = async (threadId: string, content: string) => {
  const res = await api.post(`/groups/threads/${threadId}/replies`, { content })
  return res.data
}

export const getCommunityResourcesAPI = async (communityId: string) => {
  const res = await api.get(`/groups/${communityId}/resources`)
  return res.data
}

export const uploadCommunityResourceAPI = async (communityId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post(`/groups/${communityId}/resources`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

export const downloadCommunityResourceAPI = async (resourceId: string) => {
  const res = await api.put(`/groups/resources/${resourceId}/download`)
  return res.data
}

export default api
