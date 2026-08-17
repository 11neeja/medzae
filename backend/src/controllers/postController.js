import prisma from '../config/prisma.js'
import { createMemoryUpload } from '../utils/upload.js'
import { persistFile } from '../utils/storage.js'

export const postImageUpload = createMemoryUpload(10 * 1024 * 1024) // 10 MB max

const postInclude = {
  author: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
  likes: { select: { id: true, name: true, avatarUrl: true } },
  bookmarkedBy: { select: { id: true } },
  comments: {
    include: { author: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  },
  repostedFrom: {
    include: {
      author: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
      likes: { select: { id: true, name: true, avatarUrl: true } },
      comments: { select: { id: true } },
      _count: { select: { reposts: true } },
    },
  },
  _count: { select: { reposts: true } },
}

// Map a Prisma post to the API shape
function mapPost(p) {
  return {
    ...p,
    _id: p.id,
    author: { ...p.author, _id: p.author.id },
    likes: p.likes.map(l => ({ ...l, _id: l.id })),
    commentsCount: p.comments.length,
    repostsCount: p._count.reposts,
    comments: p.comments.map(c => ({
      ...c,
      _id: c.id,
      author: { ...c.author, _id: c.author.id },
    })),
    repostedFrom: p.repostedFrom
      ? {
          ...p.repostedFrom,
          _id: p.repostedFrom.id,
          author: { ...p.repostedFrom.author, _id: p.repostedFrom.author.id },
          likes: p.repostedFrom.likes.map(l => ({ ...l, _id: l.id })),
          commentsCount: p.repostedFrom.comments.length,
          repostsCount: p.repostedFrom._count.reposts,
        }
      : null,
    bookmarkedBy: p.bookmarkedBy?.map(b => b.id) || [],
  }
}

// @desc    Get all posts
// @route   GET /api/posts
export const getPosts = async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      include: postInclude,
      orderBy: { createdAt: 'desc' },
    })
    res.json(posts.map(mapPost))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Create a post (with optional image upload)
// @route   POST /api/posts
export const createPost = async (req, res) => {
  try {
    const { content, tags, linkUrl } = req.body
    const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags

    let imageUrl = null
    if (req.file) {
      imageUrl = await persistFile(req.file, { folder: 'medihub/posts', prefix: 'post' })
    }

    const post = await prisma.post.create({
      data: {
        authorId: req.user.id,
        content,
        tags: parsedTags || [],
        imageUrl,
        linkUrl: linkUrl || null,
      },
      include: postInclude,
    })
    res.status(201).json(mapPost(post))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Like/unlike a post
// @route   PUT /api/posts/:id/like
export const toggleLike = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { likes: { select: { id: true } } },
    })
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const alreadyLiked = post.likes.some(l => l.id === req.user.id)

    const updated = await prisma.post.update({
      where: { id: req.params.id },
      data: {
        likes: alreadyLiked
          ? { disconnect: { id: req.user.id } }
          : { connect: { id: req.user.id } },
      },
      include: postInclude,
    })
    res.json(mapPost(updated))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Add a comment
// @route   POST /api/posts/:id/comments
export const addComment = async (req, res) => {
  try {
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ message: 'Content required' })

    const post = await prisma.post.findUnique({ where: { id: req.params.id } })
    if (!post) return res.status(404).json({ message: 'Post not found' })

    await prisma.comment.create({
      data: {
        content,
        authorId: req.user.id,
        postId: req.params.id,
      },
    })

    const updated = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: postInclude,
    })
    res.status(201).json(mapPost(updated))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Delete a comment
// @route   DELETE /api/posts/:postId/comments/:commentId
export const deleteComment = async (req, res) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } })
    if (!comment) return res.status(404).json({ message: 'Comment not found' })
    if (comment.authorId !== req.user.id) return res.status(403).json({ message: 'Not authorized' })

    await prisma.comment.delete({ where: { id: req.params.commentId } })

    const updated = await prisma.post.findUnique({
      where: { id: req.params.postId },
      include: postInclude,
    })
    res.json(mapPost(updated))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Repost a post
// @route   POST /api/posts/:id/repost
export const repost = async (req, res) => {
  try {
    const original = await prisma.post.findUnique({ where: { id: req.params.id } })
    if (!original) return res.status(404).json({ message: 'Post not found' })

    // Check if user already reposted this
    const existing = await prisma.post.findFirst({
      where: { authorId: req.user.id, repostedFromId: req.params.id },
    })
    if (existing) return res.status(400).json({ message: 'Already reposted' })

    const repostPost = await prisma.post.create({
      data: {
        authorId: req.user.id,
        content: req.body.content || '',
        tags: original.tags,
        repostedFromId: original.id,
      },
      include: postInclude,
    })
    res.status(201).json(mapPost(repostPost))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Toggle bookmark
// @route   PUT /api/posts/:id/bookmark
export const toggleBookmark = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { bookmarkedBy: { select: { id: true } } },
    })
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const alreadyBookmarked = post.bookmarkedBy.some(b => b.id === req.user.id)

    const updated = await prisma.post.update({
      where: { id: req.params.id },
      data: {
        bookmarkedBy: alreadyBookmarked
          ? { disconnect: { id: req.user.id } }
          : { connect: { id: req.user.id } },
      },
      include: postInclude,
    })
    res.json(mapPost(updated))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// @desc    Delete a post
// @route   DELETE /api/posts/:id
export const deletePost = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } })
    if (!post) return res.status(404).json({ message: 'Post not found' })
    if (post.authorId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' })
    }
    await prisma.post.delete({ where: { id: req.params.id } })
    res.json({ message: 'Post deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
