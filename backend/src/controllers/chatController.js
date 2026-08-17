import prisma from '../config/prisma.js'
import fs from 'fs'
import path from 'path'
import { createAndEmitNotification } from '../utils/notification.js'
import { persistFile } from '../utils/storage.js'

// @desc    Get all conversations for the logged-in user
// @route   GET /api/chat/conversations
export const getConversations = async (req, res) => {
  try {
    const memberships = await prisma.conversationMember.findMany({
      where: { userId: req.user.id },
      include: {
        conversation: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, role: true, avatarUrl: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: {
                  select: { id: true, name: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
    })

    const conversations = memberships.map(m => {
      const conv = m.conversation
      const lastMessage = conv.messages[0] || null
      // Count unread messages (messages after this user's last read - simplified: all from others)
      return {
        id: conv.id,
        name: conv.isGroup
          ? conv.name
          : conv.members.find(mem => mem.userId !== req.user.id)?.user.name || 'Unknown',
        isGroup: conv.isGroup,
        isPinned: m.isPinned,
        isAdmin: m.isAdmin,
        members: conv.members.map(mem => ({
          id: mem.user.id,
          name: mem.user.name,
          email: mem.user.email,
          role: mem.user.role,
          isAdmin: mem.isAdmin,
        })),
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              text: lastMessage.text,
              fileName: lastMessage.fileName,
              senderId: lastMessage.senderId,
              senderName: lastMessage.sender.name,
              createdAt: lastMessage.createdAt,
            }
          : null,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }
    })

    // Sort: pinned first, then by last message date
    conversations.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      const aDate = a.lastMessage?.createdAt || a.createdAt
      const bDate = b.lastMessage?.createdAt || b.createdAt
      return new Date(bDate) - new Date(aDate)
    })

    res.json(conversations)
  } catch (error) {
    console.error('getConversations error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Get messages for a conversation
// @route   GET /api/chat/conversations/:id/messages
export const getMessages = async (req, res) => {
  try {
    // Verify user is a member
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.user.id,
        },
      },
    })
    if (!membership) {
      return res.status(403).json({ message: 'Not a member of this conversation' })
    }

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
      },
    })

    res.json(
      messages.map(m => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: m.sender.name,
        senderRole: m.sender.role,
        text: m.text,
        fileName: m.fileName,
        fileUrl: m.fileUrl,
        fileType: m.fileType,
        documentId: m.documentId,
        createdAt: m.createdAt,
      }))
    )
  } catch (error) {
    console.error('getMessages error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Send a text message
// @route   POST /api/chat/conversations/:id/messages
export const sendMessage = async (req, res) => {
  try {
    const { text } = req.body
    const conversationId = req.params.id

    // Verify membership
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.id,
        },
      },
    })
    if (!membership) {
      return res.status(403).json({ message: 'Not a member of this conversation' })
    }

    const message = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderId: req.user.id,
        text,
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
      },
    })

    // Update conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    const msgData = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.sender.name,
      senderRole: message.sender.role,
      text: message.text,
      fileName: message.fileName,
      fileUrl: message.fileUrl,
      fileType: message.fileType,
      createdAt: message.createdAt,
    }

    // Emit via Socket.IO
    const io = req.app.get('io')
    io.to(`conv_${conversationId}`).emit('new_message', msgData)

    // Create notifications for other members
    const members = await prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: req.user.id } },
    })

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { name: true, isGroup: true },
    })

    for (const member of members) {
      await createAndEmitNotification(io, {
        userId: member.userId,
        type: 'chat',
        title: 'New Message',
        message: conv.isGroup
          ? `${req.user.name} in ${conv.name}: ${text?.slice(0, 50) || 'Sent a file'}`
          : `${req.user.name}: ${text?.slice(0, 50) || 'Sent a file'}`,
        link: '/chat',
        metadata: { conversationId },
      })
    }

    res.status(201).json(msgData)
  } catch (error) {
    console.error('sendMessage error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Send a file message (uploads file, stores as document with source=chat)
// @route   POST /api/chat/conversations/:id/files
export const sendFileMessage = async (req, res) => {
  try {
    const conversationId = req.params.id

    // Verify membership
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.id,
        },
      },
    })
    if (!membership) {
      return res.status(403).json({ message: 'Not a member of this conversation' })
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const { originalname, mimetype, size } = req.file
    const fileType = mimetype.startsWith('image/')
      ? 'image'
      : mimetype === 'application/pdf'
      ? 'pdf'
      : 'file'

    // Persist to shared cloud storage (or local disk in dev)
    const fileUrl = await persistFile(req.file, { folder: 'medihub/chat', prefix: 'chat' })

    // Store as document with source=chat
    const document = await prisma.document.create({
      data: {
        userId: req.user.id,
        name: originalname,
        type: fileType,
        source: 'chat',
        filePath: fileUrl,
        mimeType: mimetype,
        size,
      },
    })

    // Create chat message
    const message = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderId: req.user.id,
        fileName: originalname,
        fileUrl,
        fileType,
        documentId: document.id,
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
      },
    })

    // Update conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    const msgData = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.sender.name,
      senderRole: message.sender.role,
      text: message.text,
      fileName: message.fileName,
      fileUrl: message.fileUrl,
      fileType: message.fileType,
      documentId: document.id,
      createdAt: message.createdAt,
    }

    // Emit via Socket.IO
    const io = req.app.get('io')
    io.to(`conv_${conversationId}`).emit('new_message', msgData)

    // Create notifications for other members
    const members = await prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: req.user.id } },
    })
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { name: true, isGroup: true },
    })
    for (const member of members) {
      await createAndEmitNotification(io, {
        userId: member.userId,
        type: 'chat',
        title: 'New File',
        message: conv.isGroup
          ? `${req.user.name} shared a file in ${conv.name}`
          : `${req.user.name} sent you a file`,
        link: '/chat',
        metadata: { conversationId },
      })
    }

    res.status(201).json(msgData)
  } catch (error) {
    console.error('sendFileMessage error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Create or get a private conversation with another user
// @route   POST /api/chat/conversations/private
export const createPrivateConversation = async (req, res) => {
  try {
    const { userId: otherUserId } = req.body

    if (otherUserId === req.user.id) {
      return res.status(400).json({ message: 'Cannot create conversation with yourself' })
    }

    // Check if other user exists
    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    })
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Check if private conversation already exists between these two users
    const existingMemberships = await prisma.conversationMember.findMany({
      where: { userId: req.user.id },
      include: {
        conversation: {
          include: {
            members: true,
          },
        },
      },
    })

    const existingConv = existingMemberships.find(m => {
      const conv = m.conversation
      return (
        !conv.isGroup &&
        conv.members.length === 2 &&
        conv.members.some(mem => mem.userId === otherUserId)
      )
    })

    if (existingConv) {
      return res.json({ id: existingConv.conversation.id, existing: true })
    }

    // Create new private conversation
    const conversation = await prisma.conversation.create({
      data: {
        isGroup: false,
        members: {
          create: [
            { userId: req.user.id },
            { userId: otherUserId },
          ],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true, avatarUrl: true },
            },
          },
        },
      },
    })

    res.status(201).json({
      id: conversation.id,
      name: otherUser.name,
      isGroup: false,
      members: conversation.members.map(m => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.user.role,
      })),
      existing: false,
    })
  } catch (error) {
    console.error('createPrivateConversation error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Create a group conversation
// @route   POST /api/chat/conversations/group
export const createGroupConversation = async (req, res) => {
  try {
    const { name, memberIds } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' })
    }

    // Ensure current user is included
    const allMemberIds = [...new Set([req.user.id, ...(memberIds || [])])]

    const conversation = await prisma.conversation.create({
      data: {
        name: name.trim(),
        isGroup: true,
        members: {
          create: allMemberIds.map(uid => ({
            userId: uid,
            isAdmin: uid === req.user.id,
          })),
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true, avatarUrl: true },
            },
          },
        },
      },
    })

    // Notify added members
    const io = req.app.get('io')
    for (const uid of allMemberIds) {
      if (uid !== req.user.id) {
        await createAndEmitNotification(io, {
          userId: uid,
          type: 'group',
          title: 'Added to Group',
          message: `${req.user.name} added you to "${name}"`,
          link: '/chat',
          metadata: { conversationId: conversation.id },
        })
      }
      // Make socket join the room
      io.to(`user_${uid}`).emit('join_new_conversation', { conversationId: conversation.id })
    }

    res.status(201).json({
      id: conversation.id,
      name: conversation.name,
      isGroup: true,
      members: conversation.members.map(m => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.user.role,
        isAdmin: m.isAdmin,
      })),
    })
  } catch (error) {
    console.error('createGroupConversation error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Pin/unpin a conversation
// @route   PUT /api/chat/conversations/:id/pin
export const togglePinConversation = async (req, res) => {
  try {
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.user.id,
        },
      },
    })
    if (!membership) {
      return res.status(403).json({ message: 'Not a member of this conversation' })
    }

    const updated = await prisma.conversationMember.update({
      where: { id: membership.id },
      data: { isPinned: !membership.isPinned },
    })

    res.json({ isPinned: updated.isPinned })
  } catch (error) {
    console.error('togglePinConversation error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Delete a conversation (permanently)
// @route   DELETE /api/chat/conversations/:id
export const deleteConversation = async (req, res) => {
  try {
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.user.id,
        },
      },
    })
    if (!membership) {
      return res.status(403).json({ message: 'Not a member of this conversation' })
    }

    // Delete associated chat documents and their files from disk
    const fileMessages = await prisma.chatMessage.findMany({
      where: { conversationId: req.params.id, documentId: { not: null } },
      select: { documentId: true },
    })
    const docIds = fileMessages.map(m => m.documentId).filter(Boolean)
    if (docIds.length > 0) {
      const docs = await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, filePath: true },
      })
      // Delete files from disk
      for (const doc of docs) {
        const fullPath = path.join(process.cwd(), doc.filePath)
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
        }
      }
      // Delete document records
      await prisma.document.deleteMany({
        where: { id: { in: docIds } },
      })
    }

    // Delete the entire conversation (cascades to members, messages, join requests)
    await prisma.conversation.delete({
      where: { id: req.params.id },
    })

    // Notify via socket
    const io = req.app.get('io')
    io.to(`conv_${req.params.id}`).emit('conversation_deleted', {
      conversationId: req.params.id,
    })

    res.json({ message: 'Conversation deleted' })
  } catch (error) {
    console.error('deleteConversation error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Add members to an existing group
// @route   POST /api/chat/conversations/:id/members
export const addGroupMembers = async (req, res) => {
  try {
    const conversationId = req.params.id
    const { memberIds } = req.body

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ message: 'memberIds array is required' })
    }

    // Verify conversation exists and is a group
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: true,
      },
    })
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' })
    }
    if (!conversation.isGroup) {
      return res.status(400).json({ message: 'Can only add members to groups' })
    }

    // Verify requester is an admin
    const requesterMembership = conversation.members.find(m => m.userId === req.user.id)
    if (!requesterMembership || !requesterMembership.isAdmin) {
      return res.status(403).json({ message: 'Only admins can add members' })
    }

    // Filter out users who are already members
    const existingMemberIds = conversation.members.map(m => m.userId)
    const newMemberIds = memberIds.filter(id => !existingMemberIds.includes(id))

    if (newMemberIds.length === 0) {
      return res.status(400).json({ message: 'All users are already members' })
    }

    // Verify all new members exist
    const users = await prisma.user.findMany({
      where: { id: { in: newMemberIds } },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    })
    if (users.length !== newMemberIds.length) {
      return res.status(400).json({ message: 'Some users not found' })
    }

    // Add members
    await prisma.conversationMember.createMany({
      data: newMemberIds.map(uid => ({
        conversationId,
        userId: uid,
      })),
    })

    // Notify new members and emit socket events
    const io = req.app.get('io')
    for (const newUser of users) {
      await createAndEmitNotification(io, {
        userId: newUser.id,
        type: 'group',
        title: 'Added to Group',
        message: `${req.user.name} added you to "${conversation.name}"`,
        link: '/chat',
        metadata: { conversationId },
      })
      io.to(`user_${newUser.id}`).emit('join_new_conversation', { conversationId })
    }

    // Notify existing members about new additions
    io.to(`conv_${conversationId}`).emit('members_updated', { conversationId })

    // Return updated member list
    const updated = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
          },
        },
      },
    })

    res.json({
      members: updated.members.map(m => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.user.role,
        isAdmin: m.isAdmin,
      })),
      addedCount: newMemberIds.length,
    })
  } catch (error) {
    console.error('addGroupMembers error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Remove a member from a group
// @route   DELETE /api/chat/conversations/:id/members/:userId
export const removeGroupMember = async (req, res) => {
  try {
    const { id: conversationId, userId: targetUserId } = req.params

    // Verify conversation exists and is a group
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    })
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' })
    }
    if (!conversation.isGroup) {
      return res.status(400).json({ message: 'Can only remove members from groups' })
    }

    const requesterMembership = conversation.members.find(m => m.userId === req.user.id)
    const targetMembership = conversation.members.find(m => m.userId === targetUserId)

    if (!targetMembership) {
      return res.status(404).json({ message: 'User is not a member of this group' })
    }

    // Allow: admin removing anyone, or user removing themselves (leaving)
    const isAdmin = requesterMembership?.isAdmin
    const isSelf = req.user.id === targetUserId

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Only admins can remove other members' })
    }

    // Don't allow removing the last admin
    if (targetMembership.isAdmin) {
      const adminCount = conversation.members.filter(m => m.isAdmin).length
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot remove the last admin. Transfer admin rights first.' })
      }
    }

    // Remove the member
    await prisma.conversationMember.delete({
      where: { id: targetMembership.id },
    })

    // Notify via socket
    const io = req.app.get('io')
    io.to(`conv_${conversationId}`).emit('members_updated', { conversationId })

    // Notify removed user
    if (!isSelf) {
      await createAndEmitNotification(io, {
        userId: targetUserId,
        type: 'group',
        title: 'Removed from Group',
        message: `You were removed from "${conversation.name}"`,
        link: '/chat',
      })
    }

    // Return updated member list
    const updated = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
          },
        },
      },
    })

    res.json({
      members: updated.members.map(m => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.user.role,
        isAdmin: m.isAdmin,
      })),
    })
  } catch (error) {
    console.error('removeGroupMember error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Search users to start a new conversation
// @route   GET /api/chat/users/search?q=query
export const searchUsers = async (req, res) => {
  try {
    const query = req.query.q || ''
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.id } },
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
      take: 20,
    })
    res.json(users)
  } catch (error) {
    console.error('searchUsers error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Get shared files in a conversation
// @route   GET /api/chat/conversations/:id/files
export const getSharedFiles = async (req, res) => {
  try {
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: req.params.id,
          userId: req.user.id,
        },
      },
    })
    if (!membership) {
      return res.status(403).json({ message: 'Not a member of this conversation' })
    }

    const fileMessages = await prisma.chatMessage.findMany({
      where: {
        conversationId: req.params.id,
        fileName: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    })

    res.json(
      fileMessages.map(m => ({
        id: m.id,
        fileName: m.fileName,
        fileUrl: m.fileUrl,
        fileType: m.fileType,
        documentId: m.documentId,
        senderName: m.sender.name,
        createdAt: m.createdAt,
      }))
    )
  } catch (error) {
    console.error('getSharedFiles error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Request to join a group
// @route   POST /api/chat/conversations/:id/join-request
export const requestJoinGroup = async (req, res) => {
  try {
    const conversationId = req.params.id

    // Check if conversation is a group
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: true,
      },
    })
    if (!conv || !conv.isGroup) {
      return res.status(404).json({ message: 'Group not found' })
    }

    // Check if already a member
    const isMember = conv.members.some(m => m.userId === req.user.id)
    if (isMember) {
      return res.status(400).json({ message: 'Already a member' })
    }

    // Check existing request
    const existing = await prisma.groupJoinRequest.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: req.user.id,
        },
      },
    })
    if (existing) {
      return res.status(400).json({ message: `Request already ${existing.status}` })
    }

    const joinRequest = await prisma.groupJoinRequest.create({
      data: {
        conversationId,
        userId: req.user.id,
      },
    })

    // Notify admins
    const io = req.app.get('io')
    const admins = conv.members.filter(m => m.isAdmin)
    for (const admin of admins) {
      await createAndEmitNotification(io, {
        userId: admin.userId,
        type: 'group_join_request',
        title: 'Group Join Request',
        message: `${req.user.name} wants to join "${conv.name}"`,
        link: '/chat',
        metadata: {
          conversationId,
          joinRequestId: joinRequest.id,
          requestUserId: req.user.id,
          requestUserName: req.user.name,
        },
      })
    }

    res.status(201).json({ message: 'Join request sent', requestId: joinRequest.id })
  } catch (error) {
    console.error('requestJoinGroup error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Handle join request (approve/reject)
// @route   PUT /api/chat/join-requests/:id
export const handleJoinRequest = async (req, res) => {
  try {
    const { action } = req.body // 'approve' or 'reject'
    const joinRequest = await prisma.groupJoinRequest.findUnique({
      where: { id: req.params.id },
      include: {
        conversation: {
          include: { members: true },
        },
        user: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    })

    if (!joinRequest) {
      return res.status(404).json({ message: 'Join request not found' })
    }

    // Verify requester is an admin
    const isAdmin = joinRequest.conversation.members.some(
      m => m.userId === req.user.id && m.isAdmin
    )
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admins can handle join requests' })
    }

    if (action === 'approve') {
      // Add user to conversation
      await prisma.conversationMember.create({
        data: {
          conversationId: joinRequest.conversationId,
          userId: joinRequest.userId,
        },
      })

      await prisma.groupJoinRequest.update({
        where: { id: req.params.id },
        data: { status: 'approved' },
      })

      // Notify the requester
      const io = req.app.get('io')
      await createAndEmitNotification(io, {
        userId: joinRequest.userId,
        type: 'group',
        title: 'Request Approved',
        message: `Your request to join "${joinRequest.conversation.name}" was approved`,
        link: '/chat',
        metadata: { conversationId: joinRequest.conversationId },
      })
      io.to(`user_${joinRequest.userId}`).emit('join_new_conversation', {
        conversationId: joinRequest.conversationId,
      })

      res.json({ message: 'Request approved' })
    } else {
      await prisma.groupJoinRequest.update({
        where: { id: req.params.id },
        data: { status: 'rejected' },
      })

      // Notify the requester
      const io = req.app.get('io')
      await createAndEmitNotification(io, {
        userId: joinRequest.userId,
        type: 'group',
        title: 'Request Rejected',
        message: `Your request to join "${joinRequest.conversation.name}" was rejected`,
        link: '/chat',
      })

      res.json({ message: 'Request rejected' })
    }
  } catch (error) {
    console.error('handleJoinRequest error:', error)
    res.status(500).json({ message: error.message })
  }
}

// @desc    Get pending join requests for groups user admins
// @route   GET /api/chat/join-requests
export const getPendingJoinRequests = async (req, res) => {
  try {
    // Find conversations where user is admin
    const adminMemberships = await prisma.conversationMember.findMany({
      where: { userId: req.user.id, isAdmin: true },
      select: { conversationId: true },
    })

    const convIds = adminMemberships.map(m => m.conversationId)

    const requests = await prisma.groupJoinRequest.findMany({
      where: {
        conversationId: { in: convIds },
        status: 'pending',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
        conversation: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(requests)
  } catch (error) {
    console.error('getPendingJoinRequests error:', error)
    res.status(500).json({ message: error.message })
  }
}
