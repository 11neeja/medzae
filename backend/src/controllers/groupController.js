import prisma from '../config/prisma.js';
import { createMemoryUpload } from '../utils/upload.js';
import { persistFile } from '../utils/storage.js';
import { createAndEmitNotification } from '../utils/notification.js';

// Multer instance for community resource uploads
export const resourceUpload = createMemoryUpload(50 * 1024 * 1024);

// Shared include for communities
const communityInclude = {
  members: { include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } } },
  _count: { select: { members: true, threads: true } },
  creator: { select: { id: true, name: true, avatarUrl: true } },
};

// ── Communities ──────────────────────────────────────────

// GET /api/groups — list all communities
export const getCommunities = async (req, res) => {
  try {
    const communities = await prisma.community.findMany({
      include: communityInclude,
      orderBy: { createdAt: 'desc' },
    });

    const result = communities.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      category: c.category,
      emoji: c.emoji,
      membersCount: c._count.members,
      threadsCount: c._count.threads,
      creatorId: c.creatorId,
      creatorName: c.creator.name,
      isJoined: c.members.some(m => m.userId === req.user.id),
      myRole: c.members.find(m => m.userId === req.user.id)?.role || null,
      createdAt: c.createdAt,
    }));

    res.json(result);
  } catch (err) {
    console.error('getCommunities error:', err);
    res.status(500).json({ message: 'Failed to load communities' });
  }
};

// POST /api/groups — create community
export const createCommunity = async (req, res) => {
  try {
    const { name, description, category, emoji } = req.body;
    if (!name || !description) return res.status(400).json({ message: 'Name and description required' });

    const community = await prisma.community.create({
      data: {
        name,
        description,
        category: category || 'General',
        emoji: emoji || '💬',
        creatorId: req.user.id,
        members: {
          create: { userId: req.user.id, role: 'creator' },
        },
      },
      include: communityInclude,
    });

    res.status(201).json({
      id: community.id,
      name: community.name,
      description: community.description,
      category: community.category,
      emoji: community.emoji,
      membersCount: community._count.members,
      threadsCount: community._count.threads,
      creatorId: community.creatorId,
      creatorName: community.creator.name,
      isJoined: true,
      myRole: 'creator',
      createdAt: community.createdAt,
    });
  } catch (err) {
    console.error('createCommunity error:', err);
    res.status(500).json({ message: 'Failed to create community' });
  }
};

// PUT /api/groups/:id — update community (creator/admin only)
export const updateCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: id, userId: req.user.id } },
    });
    if (!membership || !['creator', 'admin'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { name, description, category, emoji } = req.body;
    const community = await prisma.community.update({
      where: { id },
      data: { ...(name && { name }), ...(description && { description }), ...(category && { category }), ...(emoji && { emoji }) },
      include: communityInclude,
    });

    res.json({
      id: community.id,
      name: community.name,
      description: community.description,
      category: community.category,
      emoji: community.emoji,
      membersCount: community._count.members,
      threadsCount: community._count.threads,
      creatorId: community.creatorId,
      creatorName: community.creator.name,
      isJoined: true,
      myRole: membership.role,
      createdAt: community.createdAt,
    });
  } catch (err) {
    console.error('updateCommunity error:', err);
    res.status(500).json({ message: 'Failed to update community' });
  }
};

// POST /api/groups/:id/join — join community
export const joinCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: id, userId: req.user.id } },
    });
    if (existing) return res.json({ message: 'Already a member' });

    await prisma.communityMember.create({
      data: { communityId: id, userId: req.user.id, role: 'member' },
    });
    const count = await prisma.communityMember.count({ where: { communityId: id } });

    // Notify community creator
    const community = await prisma.community.findUnique({ where: { id }, select: { name: true, creatorId: true } });
    if (community && community.creatorId !== req.user.id) {
      const io = req.app.get('io');
      await createAndEmitNotification(io, {
        userId: community.creatorId,
        type: 'community',
        title: 'New Member',
        message: `${req.user.name} joined your community "${community.name}"`,
        link: '/groups',
        metadata: { communityId: id },
      });
    }

    res.json({ joined: true, membersCount: count });
  } catch (err) {
    console.error('joinCommunity error:', err);
    res.status(500).json({ message: 'Failed to join community' });
  }
};

// DELETE /api/groups/:id/leave — leave community
export const leaveCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId: id, userId: req.user.id } },
    });
    const count = await prisma.communityMember.count({ where: { communityId: id } });
    res.json({ left: true, membersCount: count });
  } catch (err) {
    console.error('leaveCommunity error:', err);
    res.status(500).json({ message: 'Failed to leave community' });
  }
};

// GET /api/groups/:id/members — list members
export const getMembers = async (req, res) => {
  try {
    const members = await prisma.communityMember.findMany({
      where: { communityId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    res.json(members.map(m => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.user.role, memberRole: m.role, joinedAt: m.joinedAt })));
  } catch (err) {
    console.error('getMembers error:', err);
    res.status(500).json({ message: 'Failed to load members' });
  }
};

// POST /api/groups/:id/members — add members (admin/creator)
export const addMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: id, userId: req.user.id } },
    });
    if (!membership || !['creator', 'admin'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const community = await prisma.community.findUnique({ where: { id }, select: { name: true } });
    const io = req.app.get('io');

    for (const uid of userIds) {
      const before = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: id, userId: uid } },
      });
      await prisma.communityMember.upsert({
        where: { communityId_userId: { communityId: id, userId: uid } },
        update: {},
        create: { communityId: id, userId: uid, role: 'member' },
      });
      // Notify user only if they were newly added
      if (!before && uid !== req.user.id) {
        await createAndEmitNotification(io, {
          userId: uid,
          type: 'community',
          title: 'Added to Community',
          message: `${req.user.name} added you to "${community?.name}"`,
          link: '/groups',
          metadata: { communityId: id },
        });
      }
    }
    const count = await prisma.communityMember.count({ where: { communityId: id } });
    res.json({ added: true, membersCount: count });
  } catch (err) {
    console.error('addMembers error:', err);
    res.status(500).json({ message: 'Failed to add members' });
  }
};

// DELETE /api/groups/:id/members/:userId — remove member (admin/creator)
export const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: id, userId: req.user.id } },
    });
    if (!membership || !['creator', 'admin'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId: id, userId } },
    });
    const count = await prisma.communityMember.count({ where: { communityId: id } });
    res.json({ removed: true, membersCount: count });
  } catch (err) {
    console.error('removeMember error:', err);
    res.status(500).json({ message: 'Failed to remove member' });
  }
};

// ── Threads ─────────────────────────────────────────────

// GET /api/groups/:id/threads — list threads with sort
export const getThreads = async (req, res) => {
  try {
    const { id } = req.params;
    const { sort } = req.query; // hot | new | top

    const threads = await prisma.thread.findMany({
      where: { communityId: id },
      include: {
        author: { select: { id: true, name: true, role: true, avatarUrl: true } },
        _count: { select: { replies: true, votes: true } },
        votes: { select: { userId: true, value: true } },
      },
    });

    // Compute score for each thread
    const mapped = threads.map(t => {
      const totalScore = t.votes.reduce((sum, v) => sum + v.value, 0);
      const myVote = t.votes.find(v => v.userId === req.user.id)?.value || 0;
      return {
        id: t.id,
        title: t.title,
        content: t.content,
        tags: t.tags,
        isPinned: t.isPinned,
        authorName: t.author.name,
        authorRole: t.author.role,
        authorId: t.author.id,
        repliesCount: t._count.replies,
        score: totalScore,
        myVote,
        createdAt: t.createdAt,
      };
    });

    // Pinned always first, then sort
    const pinned = mapped.filter(t => t.isPinned);
    const unpinned = mapped.filter(t => !t.isPinned);

    if (sort === 'new') {
      unpinned.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === 'top') {
      unpinned.sort((a, b) => b.score - a.score);
    } else {
      // hot = replies count (most active discussions)
      unpinned.sort((a, b) => b.repliesCount - a.repliesCount);
    }

    res.json([...pinned, ...unpinned]);
  } catch (err) {
    console.error('getThreads error:', err);
    res.status(500).json({ message: 'Failed to load threads' });
  }
};

// POST /api/groups/:id/threads — create thread
export const createThread = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tags } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    // Must be a member
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: id, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ message: 'Join the community first' });

    const thread = await prisma.thread.create({
      data: {
        title,
        content: content || '',
        tags: tags || [],
        communityId: id,
        authorId: req.user.id,
      },
      include: {
        author: { select: { id: true, name: true, role: true, avatarUrl: true } },
        _count: { select: { replies: true, votes: true } },
      },
    });

    res.status(201).json({
      id: thread.id,
      title: thread.title,
      content: thread.content,
      tags: thread.tags,
      isPinned: thread.isPinned,
      authorName: thread.author.name,
      authorRole: thread.author.role,
      authorId: thread.author.id,
      repliesCount: 0,
      score: 0,
      myVote: 0,
      createdAt: thread.createdAt,
    });
  } catch (err) {
    console.error('createThread error:', err);
    res.status(500).json({ message: 'Failed to create thread' });
  }
};

// PUT /api/groups/threads/:threadId/vote — vote on thread
export const voteThread = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { value } = req.body; // 1 or -1

    if (![1, -1].includes(value)) return res.status(400).json({ message: 'Invalid vote' });

    const existing = await prisma.threadVote.findUnique({
      where: { threadId_userId: { threadId, userId: req.user.id } },
    });

    if (existing) {
      if (existing.value === value) {
        // Remove vote (toggle off)
        await prisma.threadVote.delete({ where: { id: existing.id } });
      } else {
        // Change vote direction
        await prisma.threadVote.update({ where: { id: existing.id }, data: { value } });
      }
    } else {
      await prisma.threadVote.create({ data: { threadId, userId: req.user.id, value } });
    }

    // Return new totals
    const votes = await prisma.threadVote.findMany({ where: { threadId } });
    const score = votes.reduce((sum, v) => sum + v.value, 0);
    const myVote = votes.find(v => v.userId === req.user.id)?.value || 0;
    res.json({ score, myVote });
  } catch (err) {
    console.error('voteThread error:', err);
    res.status(500).json({ message: 'Failed to vote' });
  }
};

// PUT /api/groups/threads/:threadId/pin — toggle pin (admin/creator)
export const togglePinThread = async (req, res) => {
  try {
    const { threadId } = req.params;
    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ message: 'Thread not found' });

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: thread.communityId, userId: req.user.id } },
    });
    if (!membership || !['creator', 'admin'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const updated = await prisma.thread.update({
      where: { id: threadId },
      data: { isPinned: !thread.isPinned },
    });
    res.json({ isPinned: updated.isPinned });
  } catch (err) {
    console.error('togglePinThread error:', err);
    res.status(500).json({ message: 'Failed to toggle pin' });
  }
};

// ── Replies ─────────────────────────────────────────────

// GET /api/groups/threads/:threadId/replies
export const getReplies = async (req, res) => {
  try {
    const replies = await prisma.threadReply.findMany({
      where: { threadId: req.params.threadId },
      include: { author: { select: { id: true, name: true, role: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(replies.map(r => ({
      id: r.id,
      content: r.content,
      authorName: r.author.name,
      authorRole: r.author.role,
      authorId: r.author.id,
      createdAt: r.createdAt,
    })));
  } catch (err) {
    console.error('getReplies error:', err);
    res.status(500).json({ message: 'Failed to load replies' });
  }
};

// POST /api/groups/threads/:threadId/replies
export const createReply = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: 'Content required' });

    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ message: 'Thread not found' });

    // Must be a community member
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: thread.communityId, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ message: 'Join the community first' });

    const reply = await prisma.threadReply.create({
      data: { content, threadId, authorId: req.user.id },
      include: { author: { select: { id: true, name: true, role: true, avatarUrl: true } } },
    });

    // Notify thread author about the reply
    if (thread.authorId !== req.user.id) {
      const io = req.app.get('io');
      await createAndEmitNotification(io, {
        userId: thread.authorId,
        type: 'community',
        title: 'New Reply',
        message: `${req.user.name} replied to your thread "${thread.title}"`,
        link: '/groups',
        metadata: { threadId, communityId: thread.communityId },
      });
    }

    res.status(201).json({
      id: reply.id,
      content: reply.content,
      authorName: reply.author.name,
      authorRole: reply.author.role,
      authorId: reply.author.id,
      createdAt: reply.createdAt,
    });
  } catch (err) {
    console.error('createReply error:', err);
    res.status(500).json({ message: 'Failed to create reply' });
  }
};

// ── Resources ───────────────────────────────────────────

// GET /api/groups/:id/resources
export const getResources = async (req, res) => {
  try {
    const resources = await prisma.communityResource.findMany({
      where: { communityId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(resources);
  } catch (err) {
    console.error('getResources error:', err);
    res.status(500).json({ message: 'Failed to load resources' });
  }
};

// POST /api/groups/:id/resources — upload resource (admin/creator)
export const uploadResource = async (req, res) => {
  try {
    const { id } = req.params;
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: id, userId: req.user.id } },
    });
    if (!membership || !['creator', 'admin'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (!req.file) return res.status(400).json({ message: 'No file provided' });

    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'file';
    const fileUrl = await persistFile(req.file, { folder: 'medihub/resources', prefix: 'resource' });
    const resource = await prisma.communityResource.create({
      data: {
        name: req.file.originalname,
        fileUrl,
        fileType: ext,
        communityId: id,
        uploadedById: req.user.id,
      },
    });
    res.status(201).json(resource);
  } catch (err) {
    console.error('uploadResource error:', err);
    res.status(500).json({ message: 'Failed to upload resource' });
  }
};

// PUT /api/groups/resources/:resourceId/download — increment download count
export const downloadResource = async (req, res) => {
  try {
    const resource = await prisma.communityResource.update({
      where: { id: req.params.resourceId },
      data: { downloads: { increment: 1 } },
    });
    res.json(resource);
  } catch (err) {
    console.error('downloadResource error:', err);
    res.status(500).json({ message: 'Failed to track download' });
  }
};
