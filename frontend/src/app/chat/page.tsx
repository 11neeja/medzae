'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ResizableSidebar from '@/components/ResizableSidebar';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import {
  Search, Pin, MessageCircle, Users, Paperclip, FileText,
  ImageIcon, Info, Send, X, CheckCheck, Plus, Trash2,
  UserPlus, PinOff, Loader2, UserMinus, Sparkles, Download,
  ShieldCheck, ArrowLeft, UserCircle
} from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  getConversationsAPI, getMessagesAPI, sendMessageAPI, sendFileMessageAPI,
  createPrivateConversationAPI, createGroupConversationAPI,
  togglePinConversationAPI, deleteConversationAPI,
  searchUsersAPI, getSharedFilesAPI,
  addGroupMembersAPI, removeGroupMemberAPI,
} from '@/lib/api';
import { io, Socket } from 'socket.io-client';

// Types
interface ChatUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isAdmin?: boolean;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  text?: string;
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  documentId?: string;
  createdAt: string;
}

interface ConversationType {
  id: string;
  name: string;
  isGroup: boolean;
  isPinned: boolean;
  isAdmin: boolean;
  members: ChatUser[];
  lastMessage: {
    id: string;
    text?: string;
    fileName?: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface SharedFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  documentId?: string;
  senderName: string;
  createdAt: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || BACKEND_URL;

// Cloud (absolute) file URLs are used as-is; legacy /uploads/... paths are served by our backend.
const resolveFileUrl = (url?: string | null) => {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `${BACKEND_URL}${url}`;
};

export default function ChatPage() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  // State
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationType | null>(null);
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showChatInfo, setShowChatInfo] = useState(true);
  // Mobile-only view switcher: 'list' = conversations, 'chat' = messages, 'info' = chat info.
  // Desktop ignores this (all panels render side-by-side via lg: classes).
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'info'>('list');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  // Modal states
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Search users state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Group creation state
  const [groupName, setGroupName] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<ChatUser[]>([]);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<ChatUser[]>([]);

  // Add member to group state
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearchQuery, setAddMemberSearchQuery] = useState('');
  const [addMemberSearchResults, setAddMemberSearchResults] = useState<ChatUser[]>([]);
  const [addMemberSelected, setAddMemberSelected] = useState<ChatUser[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const data = await getConversationsAPI();
      setConversations(data);
      return data;
    } catch (err) {
      console.error('Failed to load conversations:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize socket connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('get_online_users');
    });

    socket.on('online_users_list', (users: string[]) => {
      setOnlineUsers(users);
    });

    socket.on('user_online', ({ userId }: { userId: string }) => {
      setOnlineUsers(prev => [...new Set([...prev, userId])]);
    });

    socket.on('user_offline', ({ userId }: { userId: string }) => {
      setOnlineUsers(prev => prev.filter(id => id !== userId));
    });

    socket.on('new_message', (message: ChatMessage) => {
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });

      // Update conversation list with latest message
      setConversations(prev =>
        prev.map(c =>
          c.id === message.conversationId
            ? {
                ...c,
                lastMessage: {
                  id: message.id,
                  text: message.text,
                  fileName: message.fileName,
                  senderId: message.senderId,
                  senderName: message.senderName,
                  createdAt: message.createdAt,
                },
              }
            : c
        )
      );

      // Refresh shared files if it's a file message
      if (message.fileName) {
        setSharedFiles(prev => [
          {
            id: message.id,
            fileName: message.fileName!,
            fileUrl: message.fileUrl!,
            fileType: message.fileType!,
            documentId: message.documentId,
            senderName: message.senderName,
            createdAt: message.createdAt,
          },
          ...prev,
        ]);
      }
    });

    socket.on('user_typing', ({ conversationId, userName }: { conversationId: string; userId: string; userName: string }) => {
      setTypingUsers(prev => ({ ...prev, [conversationId]: userName }));
    });

    socket.on('user_stop_typing', ({ conversationId }: { conversationId: string; userId: string }) => {
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
    });

    socket.on('conversation_deleted', ({ conversationId }: { conversationId: string }) => {
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      setSelectedConv(prev => (prev?.id === conversationId ? null : prev));
    });

    socket.on('join_new_conversation', ({ conversationId }: { conversationId: string }) => {
      socket.emit('join_conversation', conversationId);
      loadConversations();
    });

    socket.on('members_updated', ({ conversationId }: { conversationId: string }) => {
      // Reload conversations to get updated member list
      loadConversations();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;

    loadConversations().then(async (convs) => {
      const searchParams = new URLSearchParams(window.location.search);

      const convId = searchParams.get('conversationId');
      if (convId && convs.length > 0) {
        const target = convs.find((c: ConversationType) => c.id === convId);
        if (target) {
          setSelectedConv(target);
          setMobileView('chat');
        }
        return;
      }

      // ?user=<id> — "Message" from someone's profile. Open the direct chat
      // with them, creating it if this is the first time. Landing on the
      // conversation list and making them search for the person again is the
      // one thing this link exists to avoid.
      const targetUserId = searchParams.get('user');
      if (!targetUserId || targetUserId === user._id) return;

      try {
        const result = await createPrivateConversationAPI(targetUserId);
        const refreshed = await getConversationsAPI();
        setConversations(refreshed);
        const conv = refreshed.find((c: ConversationType) => c.id === result.id);
        if (conv) {
          setSelectedConv(conv);
          setMobileView('chat');
        }
      } catch (err) {
        console.error('Failed to open direct chat:', err);
      } finally {
        // Drop the param so a refresh doesn't re-run this.
        window.history.replaceState({}, '', '/chat');
      }
    });
  }, [user, loadConversations]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedConv) return;
    const loadMessages = async () => {
      setMessagesLoading(true);
      try {
        const data = await getMessagesAPI(selectedConv.id);
        setMessages(data);
        socketRef.current?.emit('join_conversation', selectedConv.id);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setMessagesLoading(false);
      }
    };
    const loadFiles = async () => {
      try {
        const data = await getSharedFilesAPI(selectedConv.id);
        setSharedFiles(data);
      } catch (err) {
        console.error('Failed to load shared files:', err);
      }
    };
    loadMessages();
    loadFiles();
  }, [selectedConv]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedConv]);

  // Filter conversations
  const filteredConversations = conversations.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedChats = filteredConversations.filter(c => c.isPinned);
  const privateChats = filteredConversations.filter(c => !c.isPinned && !c.isGroup);
  const groupChats = filteredConversations.filter(c => !c.isPinned && c.isGroup);

  // Get current conversation messages
  const chatMessages = selectedConv
    ? messages.filter(m => m.conversationId === selectedConv.id)
    : [];

  // Send message
  const handleSendMessage = async () => {
    if (!newMessageText.trim() || !selectedConv) return;
    const text = newMessageText;
    setNewMessageText('');
    try {
      await sendMessageAPI(selectedConv.id, text);
      socketRef.current?.emit('stop_typing', { conversationId: selectedConv.id });
    } catch (err) {
      console.error('Failed to send message:', err);
      setNewMessageText(text);
    }
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (!fileInputRef.current?.files?.length || !selectedConv) return;
    const file = fileInputRef.current.files[0];
    try {
      await sendFileMessageAPI(selectedConv.id, file);
    } catch (err) {
      console.error('Failed to send file:', err);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle typing indicator
  const handleTyping = () => {
    if (!selectedConv || !socketRef.current) return;
    socketRef.current.emit('typing', { conversationId: selectedConv.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', { conversationId: selectedConv.id });
    }, 2000);
  };

  // Search users for new chat
  const handleUserSearch = async (query: string) => {
    setUserSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const results = await searchUsersAPI(query);
      setSearchResults(results);
    } catch (err) {
      console.error('User search failed:', err);
    } finally {
      setSearchingUsers(false);
    }
  };

  // Start private chat
  const handleStartPrivateChat = async (otherUser: ChatUser) => {
    try {
      const result = await createPrivateConversationAPI(otherUser.id);
      setShowNewChatModal(false);
      setUserSearchQuery('');
      setSearchResults([]);
      const convs = await getConversationsAPI();
      setConversations(convs);
      const conv = convs.find((c: ConversationType) => c.id === result.id);
      if (conv) {
        setSelectedConv(conv);
        setMobileView('chat');
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  // Group search
  const handleGroupSearch = async (query: string) => {
    setGroupSearchQuery(query);
    if (!query.trim()) {
      setGroupSearchResults([]);
      return;
    }
    try {
      const results = await searchUsersAPI(query);
      setGroupSearchResults(results.filter((u: ChatUser) => !selectedGroupMembers.some(m => m.id === u.id)));
    } catch (err) {
      console.error('Group search failed:', err);
    }
  };

  // Create group
  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    try {
      await createGroupConversationAPI(groupName, selectedGroupMembers.map(m => m.id));
      setShowNewGroupModal(false);
      setGroupName('');
      setSelectedGroupMembers([]);
      setGroupSearchQuery('');
      setGroupSearchResults([]);
      await loadConversations();
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };

  // Pin/unpin conversation
  const handleTogglePin = async (convId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const result = await togglePinConversationAPI(convId);
      setConversations(prev =>
        prev.map(c => (c.id === convId ? { ...c, isPinned: result.isPinned } : c))
      );
      if (selectedConv?.id === convId) {
        setSelectedConv(prev => prev ? { ...prev, isPinned: result.isPinned } : null);
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async () => {
    if (!selectedConv) return;
    try {
      await deleteConversationAPI(selectedConv.id);
      setConversations(prev => prev.filter(c => c.id !== selectedConv.id));
      setSelectedConv(null);
      setShowDeleteConfirm(false);
      setMobileView('list');
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Add member search
  const handleAddMemberSearch = async (query: string) => {
    setAddMemberSearchQuery(query);
    if (!query.trim()) {
      setAddMemberSearchResults([]);
      return;
    }
    try {
      const results = await searchUsersAPI(query);
      // Filter out users who are already members or already selected
      const existingIds = selectedConv?.members.map(m => m.id) || [];
      const selectedIds = addMemberSelected.map(m => m.id);
      setAddMemberSearchResults(
        results.filter((u: ChatUser) => !existingIds.includes(u.id) && !selectedIds.includes(u.id))
      );
    } catch (err) {
      console.error('Add member search failed:', err);
    }
  };

  // Add members to group
  const handleAddMembersToGroup = async () => {
    if (!selectedConv || addMemberSelected.length === 0) return;
    setAddingMembers(true);
    try {
      const result = await addGroupMembersAPI(selectedConv.id, addMemberSelected.map(m => m.id));
      // Update selected conversation members
      setSelectedConv(prev => prev ? { ...prev, members: result.members } : null);
      setConversations(prev =>
        prev.map(c => c.id === selectedConv.id ? { ...c, members: result.members } : c)
      );
      setShowAddMemberModal(false);
      setAddMemberSelected([]);
      setAddMemberSearchQuery('');
      setAddMemberSearchResults([]);
    } catch (err: any) {
      console.error('Failed to add members:', err);
      alert(err?.response?.data?.message || 'Failed to add members');
    } finally {
      setAddingMembers(false);
    }
  };

  // Remove member from group
  const handleRemoveMember = async (memberId: string) => {
    if (!selectedConv) return;
    try {
      const result = await removeGroupMemberAPI(selectedConv.id, memberId);
      setSelectedConv(prev => prev ? { ...prev, members: result.members } : null);
      setConversations(prev =>
        prev.map(c => c.id === selectedConv.id ? { ...c, members: result.members } : c)
      );
      setShowRemoveConfirm(null);
    } catch (err: any) {
      console.error('Failed to remove member:', err);
      alert(err?.response?.data?.message || 'Failed to remove member');
    }
  };

  // Format time
  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Format day divider
  const formatDayDivider = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - msgDay.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Get role color — tonal chips within the editorial palette
  const getRoleColor = (role: string): string => {
    switch (role) {
      case 'Professor': return 'bg-[rgba(0,11,51,0.06)] text-[var(--color-navy)] border border-[rgba(0,11,51,0.14)]';
      case 'Researcher': return 'bg-[var(--color-accent-soft)] text-[var(--color-blue-secondary)] border border-[rgba(30,66,159,0.16)]';
      case 'Student': return 'bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] border border-[var(--color-border-light)]';
      case 'Doctor':
      default: return 'bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)] border border-[rgba(11,59,145,0.14)]';
    }
  };

  // Check if user is online
  const isUserOnline = (userId: string) => onlineUsers.includes(userId);

  // Get other user in private chat
  const getOtherUser = (conv: ConversationType) =>
    conv.members.find(m => m.id !== user?._id);

  // Handle save/download file
  const handleSaveToNotebook = (file: SharedFile) => {
    if (file.fileUrl) {
      window.open(resolveFileUrl(file.fileUrl), '_blank');
    }
  };

  // Stats
  const totalOnline = onlineUsers.length;
  const totalChats = privateChats.length + pinnedChats.filter(c => !c.isGroup).length;
  const totalGroups = groupChats.length + pinnedChats.filter(c => c.isGroup).length;

  // Render conversation item
  const renderConversationItem = (conv: ConversationType) => {
    const otherUser = !conv.isGroup ? getOtherUser(conv) : null;
    const isOnline = otherUser ? isUserOnline(otherUser.id) : false;
    const typing = typingUsers[conv.id];
    const isActive = selectedConv?.id === conv.id;

    return (
      <button
        key={conv.id}
        onClick={() => { setSelectedConv(conv); setMobileView('chat'); }}
        className={`w-full text-left px-4 py-3 transition-smooth group relative border-l-[3px] ${
          isActive
            ? 'bg-[var(--color-accent-soft)] border-[var(--color-blue-primary)]'
            : 'border-transparent hover:bg-[var(--color-surface-muted)]'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {conv.isGroup ? (
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white"
                style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}
              >
                <Users className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white shadow-sm">
                <UserAvatar userId={otherUser?.id || conv.id} name={otherUser?.name || conv.name} size={48} />
              </div>
            )}
            {!conv.isGroup && isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-0.5 gap-2">
              <h3 className="font-semibold text-[var(--color-text-primary)] truncate text-sm">{conv.name}</h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                {conv.lastMessage && (
                  <span className="text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">
                    {formatTime(conv.lastMessage.createdAt)}
                  </span>
                )}
                <button
                  onClick={(e) => handleTogglePin(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md hover:bg-white transition-smooth"
                  title={conv.isPinned ? 'Unpin' : 'Pin'}
                >
                  {conv.isPinned
                    ? <PinOff className="w-3 h-3 text-[var(--color-text-muted)]" />
                    : <Pin className="w-3 h-3 text-[var(--color-text-muted)]" />}
                </button>
              </div>
            </div>
            <div className="text-xs text-[var(--color-text-muted)] truncate min-h-[16px]">
              {typing ? (
                <span className="text-[var(--color-blue-primary)] italic font-medium inline-flex items-center gap-1.5">
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 bg-[var(--color-blue-primary)] rounded-full animate-pulse" />
                    <span className="w-1 h-1 bg-[var(--color-blue-primary)] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-[var(--color-blue-primary)] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                  typing
                </span>
              ) : conv.lastMessage?.text ? (
                <span>{conv.lastMessage.text}</span>
              ) : conv.lastMessage?.fileName ? (
                <span className="inline-flex items-center gap-1"><Paperclip className="w-3 h-3" />{conv.lastMessage.fileName}</span>
              ) : (
                <span className="italic opacity-70">No messages yet</span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-subtle">
        <div className="page-container">
          {/* Masthead skeleton */}
          <header className="relative mb-8 pb-8 border-b border-[var(--color-border-rule)]">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div className="flex-1 max-w-3xl">
                <div className="skeleton h-3 w-32 mb-5" />
                <div className="skeleton h-12 w-3/4 max-w-md mb-4" />
                <div className="skeleton h-3.5 w-2/3 max-w-sm" />
              </div>
              <div className="hidden md:flex items-end gap-8 shrink-0">
                {[0, 1, 2].map(i => (
                  <div key={i}>
                    <div className="skeleton h-2.5 w-12 mb-2" />
                    <div className="skeleton h-8 w-10" />
                  </div>
                ))}
              </div>
            </div>
          </header>

          {/* Workspace skeleton — mirrors the chat screen layout */}
          <div className="card workspace-shell rounded-3xl overflow-hidden flex h-[calc(100vh-280px)] min-h-[560px]">
            <div className="w-full lg:w-[340px] lg:border-r border-[var(--color-border-hairline)] bg-white flex flex-col shrink-0">
              <div className="p-4 border-b border-[var(--color-border-hairline)] space-y-3">
                <div className="skeleton h-11 w-full !rounded-[0.625rem]" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="skeleton h-9 !rounded-[0.625rem]" />
                  <div className="skeleton h-9 !rounded-[0.625rem]" />
                </div>
              </div>
              <div className="flex-1 p-4 space-y-5 overflow-hidden">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.16 }}>
                    <div className="skeleton skeleton-circle w-12 h-12 shrink-0" />
                    <div className="flex-1">
                      <div className="skeleton h-3 w-2/3 mb-2" />
                      <div className="skeleton h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden lg:flex flex-1 flex-col bg-[var(--color-bg-ivory)]">
              <div className="px-6 py-3.5 bg-white border-b border-[var(--color-border-hairline)] flex items-center gap-3">
                <div className="skeleton skeleton-circle w-11 h-11" />
                <div>
                  <div className="skeleton h-3 w-36 mb-2" />
                  <div className="skeleton h-2.5 w-20" />
                </div>
              </div>
              <div className="flex-1 px-6 py-5 flex flex-col justify-end space-y-3">
                {[64, 44, 56, 38].map((w, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                    <div className="skeleton h-10 !rounded-2xl" style={{ width: `${w}%`, maxWidth: '18rem', opacity: 0.4 + i * 0.15 }} />
                  </div>
                ))}
              </div>
              <div className="bg-white border-t border-[var(--color-border-hairline)] px-6 py-3">
                <div className="skeleton h-11 w-full !rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="page-container">
        {/* Editorial masthead — hidden on mobile when a conversation is open so chat fills the screen */}
        <header className={`relative mb-8 pb-8 border-b border-[var(--color-border-rule)] animate-section ${mobileView !== 'list' ? 'hidden lg:block' : ''}`}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="flex-1 max-w-3xl">
              <p className="label !mb-3">Correspondence</p>
              <h1 className="heading-hero mb-4">
                Private <span className="serif-accent">conversations</span>.
              </h1>
              <p className="body-lg max-w-xl text-[var(--color-text-secondary)]">
                One-on-one or in groups — share files, ask quick questions, keep work moving.
              </p>
            </div>

            {/* Stat chips — editorial ticker style */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 shrink-0">
              {[
                { label: 'Chats', value: totalChats },
                { label: 'Groups', value: totalGroups },
                { label: 'Online', value: totalOnline, accent: true },
              ].map(({ label, value, accent }) => (
                <div key={label} className="flex flex-col">
                  <span className={`text-[10px] uppercase tracking-[0.2em] font-semibold ${accent ? 'text-emerald-600' : 'text-[var(--color-text-soft)]'}`}>
                    {accent && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle animate-pulse" />}
                    {label}
                  </span>
                  <span
                    className="text-[var(--color-navy)] tabular-nums"
                    style={{
                      fontFamily: 'var(--font-fraunces), serif',
                      fontSize: '1.875rem',
                      fontWeight: 400,
                      lineHeight: 1,
                      letterSpacing: '-0.025em',
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Main Layout */}
        <div className="card workspace-shell rounded-3xl overflow-hidden flex flex-col lg:flex-row h-[calc(100vh-280px)] min-h-[560px]">
          {/* Left Sidebar — conversation list */}
          <ResizableSidebar side="left" defaultWidth={340} minWidth={260} maxWidth={480} responsive mobileVisible={mobileView === 'list'}>
            <aside className="w-full h-full bg-white lg:border-r border-[var(--color-border-light)] flex flex-col">
              {/* Search & Actions */}
              <div className="p-4 border-b border-[var(--color-border-light)] space-y-3 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input pl-10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowNewChatModal(true)} className="btn-primary text-sm flex items-center justify-center gap-1.5">
                    <Plus className="w-4 h-4" /> New Chat
                  </button>
                  <button onClick={() => setShowNewGroupModal(true)} className="btn-secondary text-sm flex items-center justify-center gap-1.5">
                    <Users className="w-4 h-4" /> Group
                  </button>
                </div>
              </div>

              {/* Conversations List */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {pinnedChats.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-4 py-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-muted)]/95 backdrop-blur border-b border-[var(--color-border-light)]">
                      <Pin className="w-3 h-3" /> Pinned
                    </div>
                    {pinnedChats.map(renderConversationItem)}
                  </div>
                )}

                {privateChats.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-4 py-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-muted)]/95 backdrop-blur border-b border-[var(--color-border-light)]">
                      <MessageCircle className="w-3 h-3" /> Direct Messages
                    </div>
                    {privateChats.map(renderConversationItem)}
                  </div>
                )}

                {groupChats.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-4 py-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-muted)]/95 backdrop-blur border-b border-[var(--color-border-light)]">
                      <Users className="w-3 h-3" /> Groups
                    </div>
                    {groupChats.map(renderConversationItem)}
                  </div>
                )}

                {filteredConversations.length === 0 && !loading && (
                  <div className="p-8 text-center">
                    <div className="empty-plate !w-14 !h-14 !mb-3.5">
                      <MessageCircle className="w-6 h-6" strokeWidth={1.25} />
                    </div>
                    <p className="text-sm font-semibold text-[var(--color-navy)] tracking-tight mb-1">
                      {searchQuery ? 'No matches' : 'No conversations yet'}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                      {searchQuery ? 'Try a different search term' : 'Start a new chat or create a group'}
                    </p>
                  </div>
                )}
              </div>
            </aside>
          </ResizableSidebar>

          {/* Center - Message Panel */}
          <main className={`flex-1 flex-col min-w-0 min-h-0 bg-[var(--color-bg-ivory)] ${mobileView === 'chat' ? 'flex' : 'hidden'} lg:flex`}>
            {selectedConv ? (
              <>
                {/* Chat Header */}
                <div className="px-3 md:px-6 py-3 md:py-3.5 bg-white border-b border-[var(--color-border-light)] flex items-center justify-between flex-shrink-0 gap-2">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                    <button
                      onClick={() => setMobileView('list')}
                      className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth flex-shrink-0"
                      title="Back to chats"
                      aria-label="Back to chats"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="relative flex-shrink-0">
                      {selectedConv.isGroup ? (
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white" style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}>
                          <Users className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-white shadow-sm">
                          <UserAvatar
                            userId={getOtherUser(selectedConv)?.id || selectedConv.id}
                            name={getOtherUser(selectedConv)?.name || selectedConv.name}
                            size={44}
                            // Only a real person has a profile to open — for a
                            // group this id is the conversation's.
                            linkToProfile={Boolean(getOtherUser(selectedConv))}
                          />
                        </div>
                      )}
                      {!selectedConv.isGroup && (() => {
                        const other = getOtherUser(selectedConv);
                        return other && isUserOnline(other.id) ? (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />
                        ) : null;
                      })()}
                    </div>
                    <div className="min-w-0">
                      {(() => {
                        const other = !selectedConv.isGroup ? getOtherUser(selectedConv) : null;
                        return other ? (
                          <Link
                            href={`/u/${other.id}`}
                            className="font-semibold text-[var(--color-text-primary)] truncate block hover:text-[var(--color-blue-primary)] transition-smooth"
                          >
                            {selectedConv.name}
                          </Link>
                        ) : (
                          <h2 className="font-semibold text-[var(--color-text-primary)] truncate">{selectedConv.name}</h2>
                        );
                      })()}
                      <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                        {selectedConv.isGroup ? (
                          <>
                            <Users className="w-3 h-3" />
                            {selectedConv.members.length} members
                          </>
                        ) : (() => {
                          const other = getOtherUser(selectedConv);
                          return other && isUserOnline(other.id) ? (
                            <><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Active now</>
                          ) : 'Offline';
                        })()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      // On mobile, route info to its own pane; on desktop, toggle the side panel.
                      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023.98px)').matches) {
                        setMobileView('info');
                      } else {
                        setShowChatInfo(!showChatInfo);
                      }
                    }}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-smooth flex-shrink-0 ${
                      showChatInfo
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-blue-primary)]'
                    }`}
                    title="Chat info"
                  >
                    <Info className="w-5 h-5" />
                  </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 md:px-6 py-4 md:py-5">
                  {messagesLoading ? (
                    <div className="h-full flex flex-col justify-end pb-2 space-y-3">
                      {[72, 56, 64].map((w, i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                          <div className="skeleton h-11 !rounded-2xl" style={{ width: `${w}%`, maxWidth: '20rem', opacity: 0.5 + i * 0.2 }} />
                        </div>
                      ))}
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center max-w-xs">
                        <div className="empty-plate">
                          <Sparkles className="w-7 h-7" strokeWidth={1.25} />
                        </div>
                        <p className="label justify-center !mb-2">A blank page</p>
                        <h3 className="heading-3 mb-2">Start the <span className="serif-accent">conversation</span></h3>
                        <p className="body-md">Say hi to {selectedConv.name} — your message will appear here.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {chatMessages.map((message, idx) => {
                        const isSentByMe = message.senderId === user?._id;
                        const prev = idx > 0 ? chatMessages[idx - 1] : null;
                        const next = idx < chatMessages.length - 1 ? chatMessages[idx + 1] : null;

                        const sameSenderAsPrev = !!prev && prev.senderId === message.senderId &&
                          (new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60_000;
                        const sameSenderAsNext = !!next && next.senderId === message.senderId &&
                          (new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime()) < 5 * 60_000;

                        const showSenderName = selectedConv.isGroup && !isSentByMe && !sameSenderAsPrev;

                        // Day divider
                        const showDayDivider = !prev ||
                          new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString();

                        return (
                          <div key={message.id}>
                            {showDayDivider && (
                              <div className="flex items-center gap-3 my-4">
                                <div className="flex-1 h-px bg-[var(--color-border-light)]" />
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] bg-white px-3 py-1 rounded-full border border-[var(--color-border-light)]">
                                  {formatDayDivider(message.createdAt)}
                                </span>
                                <div className="flex-1 h-px bg-[var(--color-border-light)]" />
                              </div>
                            )}
                            <div className={`flex ${isSentByMe ? 'justify-end' : 'justify-start'} ${sameSenderAsPrev ? 'mt-0.5' : 'mt-3'}`}>
                              <div className={`max-w-[78%] md:max-w-[65%] flex flex-col gap-1 ${isSentByMe ? 'items-end' : 'items-start'}`}>
                                {showSenderName && (
                                  <span className="text-[11px] font-semibold text-[var(--color-blue-primary)] ml-3">
                                    {message.senderName}
                                  </span>
                                )}
                                <div
                                  className={`px-4 py-2.5 shadow-sm ${isSentByMe ? 'message-sent' : 'message-received'}`}
                                  style={{
                                    borderTopRightRadius: isSentByMe && sameSenderAsPrev ? '0.5rem' : undefined,
                                    borderBottomRightRadius: isSentByMe && sameSenderAsNext ? '1rem' : (isSentByMe ? '0.25rem' : undefined),
                                    borderTopLeftRadius: !isSentByMe && sameSenderAsPrev ? '0.5rem' : undefined,
                                    borderBottomLeftRadius: !isSentByMe && sameSenderAsNext ? '1rem' : (!isSentByMe ? '0.25rem' : undefined),
                                  }}
                                >
                                  {message.text && <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>}

                                  {message.fileName && (
                                    <div className={`flex items-center gap-3 min-w-[240px] ${message.text ? 'mt-2 pt-2 border-t' : ''} ${isSentByMe ? 'border-white/20' : 'border-[var(--color-border-light)]'}`}>
                                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                        isSentByMe ? 'bg-white/20' : 'bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)]'
                                      }`}>
                                        {message.fileType === 'pdf' ? <FileText className="w-5 h-5" /> :
                                         message.fileType === 'image' ? <ImageIcon className="w-5 h-5" /> :
                                         <Paperclip className="w-5 h-5" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold truncate">{message.fileName}</div>
                                        {message.fileUrl && (
                                          <a
                                            href={resolveFileUrl(message.fileUrl)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`text-xs inline-flex items-center gap-1 hover:underline ${
                                              isSentByMe ? 'text-white/85' : 'text-[var(--color-blue-primary)]'
                                            }`}
                                          >
                                            <Download className="w-3 h-3" /> Download
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  <div className={`text-[10px] mt-1 flex items-center gap-1 ${isSentByMe ? 'text-white/70 justify-end' : 'text-[var(--color-text-muted)]'}`}>
                                    {formatTime(message.createdAt)}
                                    {isSentByMe && <CheckCheck className="w-3 h-3 ml-0.5" />}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Typing indicator */}
                      {selectedConv && typingUsers[selectedConv.id] && (
                        <div className="flex justify-start mt-3">
                          <div className="px-4 py-2.5 message-received inline-flex items-center gap-2">
                            <span className="flex gap-1">
                              <span className="w-1.5 h-1.5 bg-[var(--color-blue-primary)] rounded-full animate-pulse" />
                              <span className="w-1.5 h-1.5 bg-[var(--color-blue-primary)] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 bg-[var(--color-blue-primary)] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                            </span>
                            <span className="text-xs text-[var(--color-text-muted)] italic">{typingUsers[selectedConv.id]} is typing</span>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Message Composer */}
                <div className="bg-white border-t border-[var(--color-border-light)] px-3 sm:px-4 md:px-6 py-3 flex-shrink-0 mobile-safe-bottom">
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="icon-btn !w-10 !h-10 !rounded-full"
                      data-tip="Attach file"
                      aria-label="Attach file"
                    >
                      <Paperclip className="w-5 h-5" strokeWidth={1.75} />
                    </button>
                    <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
                    <textarea
                      value={newMessageText}
                      onChange={(e) => {
                        setNewMessageText(e.target.value);
                        handleTyping();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Write a message…"
                      className="input flex-1 resize-none !rounded-2xl py-2.5 leading-snug max-h-32"
                      rows={1}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!newMessageText.trim()}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 transition-smooth disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
                      style={{ background: 'var(--gradient-ink)', boxShadow: 'var(--shadow-btn), var(--shadow-inset)' }}
                      data-tip="Send"
                      aria-label="Send message"
                    >
                      <Send className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5 ml-12">
                    Press <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border-light)] text-[9px] font-mono">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border-light)] text-[9px] font-mono">Shift+Enter</kbd> for new line
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }} />
                <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-blue-soft) 0%, transparent 70%)' }} />

                <div className="relative z-10 text-center max-w-md px-6 fade-in-up">
                  <div className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center" style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}>
                    <MessageCircle className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="heading-2 mb-3">Welcome to Medzae Chat</h2>
                  <p className="body-md mb-6 max-w-sm mx-auto">Select a conversation from the sidebar — or start a new one to begin collaborating with colleagues.</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <button onClick={() => setShowNewChatModal(true)} className="btn-primary">
                      <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Start a Chat</span>
                    </button>
                    <button onClick={() => setShowNewGroupModal(true)} className="btn-secondary">
                      <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Create Group</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Right Panel - Chat Info */}
          {selectedConv && (showChatInfo || mobileView === 'info') && (
            <ResizableSidebar
              side="right"
              defaultWidth={320}
              minWidth={260}
              maxWidth={480}
              responsive
              mobileVisible={mobileView === 'info'}
            >
              <aside className="w-full h-full bg-white border-l border-[var(--color-border-light)] overflow-y-auto">
                {/* Mobile back-bar */}
                <div className="lg:hidden sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 bg-white border-b border-[var(--color-border-light)]">
                  <button
                    onClick={() => setMobileView('chat')}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth"
                    aria-label="Back to messages"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">Chat info</span>
                </div>

                {/* Hero */}
                <div className="relative px-6 pt-7 pb-5 text-center overflow-hidden border-b border-[var(--color-border-light)]" style={{ background: 'var(--gradient-bg)' }}>
                  <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }} />
                  <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 w-48 h-48 rounded-full opacity-30 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-blue-soft) 0%, transparent 70%)' }} />

                  <div className="relative z-10">
                    <div className="mb-3">
                      {selectedConv.isGroup ? (
                        <div className="w-24 h-24 mx-auto rounded-3xl flex items-center justify-center text-white" style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}>
                          <Users className="w-10 h-10" />
                        </div>
                      ) : (
                        <div className="w-24 h-24 mx-auto rounded-full overflow-hidden ring-4 ring-white shadow-premium-md">
                          <UserAvatar
                            userId={getOtherUser(selectedConv)?.id || selectedConv.id}
                            name={getOtherUser(selectedConv)?.name || selectedConv.name}
                            size={96}
                            linkToProfile={Boolean(getOtherUser(selectedConv))}
                          />
                        </div>
                      )}
                    </div>
                    {(() => {
                      const other = !selectedConv.isGroup ? getOtherUser(selectedConv) : null;
                      return other ? (
                        <Link href={`/u/${other.id}`} className="heading-3 mb-1 block hover:text-[var(--color-blue-primary)] transition-smooth">
                          {selectedConv.name}
                        </Link>
                      ) : (
                        <h2 className="heading-3 mb-1">{selectedConv.name}</h2>
                      );
                    })()}
                    <p className="body-sm">
                      {selectedConv.isGroup
                        ? `Group · ${selectedConv.members.length} members`
                        : getOtherUser(selectedConv)?.role || 'User'}
                    </p>

                    {(() => {
                      const other = !selectedConv.isGroup ? getOtherUser(selectedConv) : null;
                      return other ? (
                        <Link
                          href={`/u/${other.id}`}
                          className="btn-secondary !py-1.5 !px-3 text-[0.8125rem] inline-flex items-center gap-1.5 mt-3"
                        >
                          <UserCircle className="w-3.5 h-3.5" />
                          View profile
                        </Link>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div className="px-5 py-5 space-y-6">
                  {/* Members */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="label">{selectedConv.isGroup ? `Members · ${selectedConv.members.length}` : 'About'}</p>
                      {selectedConv.isGroup && selectedConv.isAdmin && (
                        <button
                          onClick={() => setShowAddMemberModal(true)}
                          className="flex items-center gap-1 text-xs font-semibold text-[var(--color-blue-primary)] bg-[var(--color-accent-soft)] hover:bg-[var(--color-accent-hover)] px-2.5 py-1.5 rounded-lg transition-smooth"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Add
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {selectedConv.members.map(member => (
                        <div key={member.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-surface-muted)] transition-smooth group">
                          <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-full overflow-hidden">
                              <UserAvatar userId={member.id} name={member.name} size={40} linkToProfile />
                            </div>
                            {isUserOnline(member.id) && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                              <Link href={`/u/${member.id}`} className="hover:text-[var(--color-blue-primary)] transition-smooth">
                                {member.name}
                              </Link>
                              {member.id === user?._id && <span className="text-[var(--color-text-muted)] font-normal"> (You)</span>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${getRoleColor(member.role)}`}>
                                {member.role}
                              </span>
                              {member.isAdmin && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 inline-flex items-center gap-0.5">
                                  <ShieldCheck className="w-2.5 h-2.5" /> Admin
                                </span>
                              )}
                            </div>
                          </div>
                          {selectedConv.isGroup && selectedConv.isAdmin && member.id !== user?._id && (
                            showRemoveConfirm === member.id ? (
                              <div className="flex items-center gap-1 flex-shrink-0 fade-in">
                                <button onClick={() => handleRemoveMember(member.id)} className="text-[10px] uppercase tracking-[0.08em] px-2.5 py-1.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-smooth">Remove</button>
                                <button onClick={() => setShowRemoveConfirm(null)} className="text-[10px] uppercase tracking-[0.08em] px-2.5 py-1.5 bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] border border-[var(--color-border-light)] rounded-lg font-bold hover:bg-[var(--color-accent-soft)] transition-smooth">Keep</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowRemoveConfirm(member.id)}
                                className="opacity-0 group-hover:opacity-100 icon-btn icon-btn-sm icon-btn-danger flex-shrink-0"
                                data-tip="Remove member"
                                aria-label="Remove member"
                              >
                                <UserMinus className="w-4 h-4" strokeWidth={1.75} />
                              </button>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shared Files */}
                  <div>
                    <p className="label mb-3">Shared Files {sharedFiles.length > 0 && <span className="text-[var(--color-text-muted)] font-normal normal-case tracking-normal">· {sharedFiles.length}</span>}</p>
                    <div className="space-y-2">
                      {sharedFiles.map(file => (
                        <div key={file.id} className="p-3 rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface-muted)] hover:bg-white hover:border-[var(--color-border-mid)] transition-smooth">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-[var(--color-blue-primary)]" style={{ background: 'var(--color-accent-soft)' }}>
                              {file.fileType === 'pdf' ? <FileText className="w-5 h-5" /> :
                               file.fileType === 'image' ? <ImageIcon className="w-5 h-5" /> :
                               <Paperclip className="w-5 h-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{file.fileName}</div>
                              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">By {file.senderName}</p>
                              <button onClick={() => handleSaveToNotebook(file)} className="text-xs font-semibold text-[var(--color-blue-primary)] hover:underline mt-1 inline-flex items-center gap-1">
                                <Download className="w-3 h-3" /> Download
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {sharedFiles.length === 0 && (
                        <div className="text-center py-6 border border-dashed border-[var(--color-border-light)] rounded-xl">
                          <Paperclip className="w-6 h-6 text-[var(--color-text-muted)] mx-auto mb-1.5 opacity-50" />
                          <p className="text-xs text-[var(--color-text-muted)]">No shared files yet</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2 pt-2 border-t border-[var(--color-border-light)]">
                    <button onClick={() => handleTogglePin(selectedConv.id)} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                      {selectedConv.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      {selectedConv.isPinned ? 'Unpin Chat' : 'Pin Chat'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full py-2.5 px-4 rounded-xl bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 transition-smooth flex items-center justify-center gap-2 border border-red-100"
                    >
                      <Trash2 className="w-4 h-4" />
                      {selectedConv.isGroup ? 'Delete Group' : 'Delete Chat'}
                    </button>
                  </div>
                </div>
              </aside>
            </ResizableSidebar>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div
          onClick={() => { setShowNewChatModal(false); setUserSearchQuery(''); setSearchResults([]); }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card rounded-3xl w-full max-w-md shadow-premium-xl overflow-hidden fade-in-up relative"
          >
            <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }} />

            <div className="relative z-10 px-6 pt-6 pb-4 border-b border-[var(--color-border-light)] flex items-start justify-between gap-4">
              <div>
                <p className="label mb-1">Messaging</p>
                <h2 className="heading-3">New Conversation</h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">Search for a colleague by name or email.</p>
              </div>
              <button
                onClick={() => { setShowNewChatModal(false); setUserSearchQuery(''); setSearchResults([]); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative z-10 px-6 py-5">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={userSearchQuery}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  className="input pl-10"
                  autoFocus
                />
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {searchingUsers && (
                  <div className="space-y-2 py-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="flex items-center gap-3 p-3" style={{ opacity: 1 - i * 0.25 }}>
                        <div className="skeleton skeleton-circle w-10 h-10 shrink-0" />
                        <div className="flex-1">
                          <div className="skeleton h-3 w-32 mb-2" />
                          <div className="skeleton h-2.5 w-44" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!searchingUsers && searchResults.length === 0 && userSearchQuery && (
                  <div className="text-center py-6">
                    <p className="text-sm text-[var(--color-text-muted)]">No users found for &ldquo;{userSearchQuery}&rdquo;</p>
                  </div>
                )}
                {!searchingUsers && !userSearchQuery && (
                  <div className="text-center py-6">
                    <Search className="w-6 h-6 text-[var(--color-text-muted)] mx-auto mb-2 opacity-50" />
                    <p className="text-sm text-[var(--color-text-muted)]">Start typing to search</p>
                  </div>
                )}
                {searchResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleStartPrivateChat(u)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-surface-muted)] border border-transparent hover:border-[var(--color-border-light)] transition-smooth"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden">
                        <UserAvatar userId={u.id} name={u.name} size={40} />
                      </div>
                      {isUserOnline(u.id) && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                      )}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-semibold text-sm text-[var(--color-text-primary)] truncate">{u.name}</div>
                      <div className="text-xs text-[var(--color-text-muted)] truncate">{u.email}</div>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${getRoleColor(u.role)}`}>{u.role}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {showNewGroupModal && (
        <div
          onClick={() => { setShowNewGroupModal(false); setGroupName(''); setSelectedGroupMembers([]); setGroupSearchQuery(''); setGroupSearchResults([]); }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card rounded-3xl w-full max-w-md shadow-premium-xl overflow-hidden fade-in-up relative max-h-[90vh] flex flex-col"
          >
            <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }} />

            <div className="relative z-10 px-6 pt-6 pb-4 border-b border-[var(--color-border-light)] flex items-start justify-between gap-4 flex-shrink-0">
              <div>
                <p className="label mb-1">Messaging</p>
                <h2 className="heading-3">Create Group</h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">Name your group and invite colleagues.</p>
              </div>
              <button
                onClick={() => { setShowNewGroupModal(false); setGroupName(''); setSelectedGroupMembers([]); setGroupSearchQuery(''); setGroupSearchResults([]); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative z-10 px-6 py-5 overflow-y-auto flex-1">
              <label className="label block mb-1.5">Group Name</label>
              <input
                type="text"
                placeholder="e.g. Cardiology Residents 2026"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="input mb-4"
                autoFocus
              />

              {selectedGroupMembers.length > 0 && (
                <div className="mb-4">
                  <p className="label mb-2">Selected · {selectedGroupMembers.length}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedGroupMembers.map(m => (
                      <div key={m.id} className="flex items-center gap-1.5 bg-[var(--color-accent-soft)] rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--color-blue-primary)]">
                        <span className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0">
                          <UserAvatar userId={m.id} name={m.name} size={16} />
                        </span>
                        {m.name}
                        <button onClick={() => setSelectedGroupMembers(prev => prev.filter(p => p.id !== m.id))} className="hover:text-red-500 transition-smooth">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="label block mb-1.5">Add Members</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={groupSearchQuery}
                  onChange={(e) => handleGroupSearch(e.target.value)}
                  className="input pl-10"
                />
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1">
                {groupSearchResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedGroupMembers(prev => [...prev, u]);
                      setGroupSearchResults(prev => prev.filter(p => p.id !== u.id));
                      setGroupSearchQuery('');
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-surface-muted)] border border-transparent hover:border-[var(--color-border-light)] transition-smooth"
                  >
                    <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                      <UserAvatar userId={u.id} name={u.name} size={36} />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-semibold text-sm text-[var(--color-text-primary)] truncate">{u.name}</div>
                      <div className="text-xs text-[var(--color-text-muted)] truncate">{u.email}</div>
                    </div>
                    <UserPlus className="w-4 h-4 text-[var(--color-blue-primary)] flex-shrink-0" />
                  </button>
                ))}
                {groupSearchQuery && groupSearchResults.length === 0 && (
                  <p className="text-sm text-[var(--color-text-muted)] text-center py-3">No users found</p>
                )}
              </div>
            </div>

            <div className="relative z-10 px-6 py-4 border-t border-[var(--color-border-light)] bg-white/80 backdrop-blur flex gap-3 flex-shrink-0">
              <button
                onClick={() => { setShowNewGroupModal(false); setGroupName(''); setSelectedGroupMembers([]); setGroupSearchQuery(''); setGroupSearchResults([]); }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Group ({selectedGroupMembers.length + 1})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedConv && (
        <div
          onClick={() => setShowDeleteConfirm(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card rounded-3xl w-full max-w-sm shadow-premium-xl overflow-hidden fade-in-up relative"
          >
            <div className="px-6 pt-7 pb-5 text-center">
              <div className="w-14 h-14 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" strokeWidth={1.5} />
              </div>
              <p className="label justify-center !mb-2">Confirm delete</p>
              <h2 className="heading-3 mb-2.5">Are you <span className="serif-accent">sure</span>?</h2>
              <p className="text-sm text-[var(--color-text-body)] leading-relaxed">
                This will permanently delete {selectedConv.isGroup ? <>the group <span className="font-semibold text-[var(--color-navy)]">&ldquo;{selectedConv.name}&rdquo;</span></> : <>your chat with <span className="font-semibold text-[var(--color-navy)]">{selectedConv.name}</span></>} and all messages. This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border-hairline)] bg-[var(--color-surface-elevated)] flex gap-2.5">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConversation}
                className="flex-1 bg-red-600 text-white py-2.5 px-4 rounded-[0.625rem] font-semibold text-[0.8125rem] hover:bg-red-700 transition-smooth shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && selectedConv?.isGroup && (
        <div
          onClick={() => { setShowAddMemberModal(false); setAddMemberSelected([]); setAddMemberSearchQuery(''); setAddMemberSearchResults([]); }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card rounded-3xl w-full max-w-md shadow-premium-xl overflow-hidden fade-in-up relative max-h-[90vh] flex flex-col"
          >
            <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }} />

            <div className="relative z-10 px-6 pt-6 pb-4 border-b border-[var(--color-border-light)] flex items-start justify-between gap-4 flex-shrink-0">
              <div>
                <p className="label mb-1">Group settings</p>
                <h2 className="heading-3">Add Members</h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">Invite users to &ldquo;{selectedConv.name}&rdquo;.</p>
              </div>
              <button
                onClick={() => { setShowAddMemberModal(false); setAddMemberSelected([]); setAddMemberSearchQuery(''); setAddMemberSearchResults([]); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative z-10 px-6 py-5 overflow-y-auto flex-1">
              {addMemberSelected.length > 0 && (
                <div className="mb-4">
                  <p className="label mb-2">Selected · {addMemberSelected.length}</p>
                  <div className="flex flex-wrap gap-2">
                    {addMemberSelected.map(m => (
                      <span key={m.id} className="flex items-center gap-1.5 bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)] px-2.5 py-1 rounded-lg text-xs font-medium">
                        <span className="w-4 h-4 rounded-full overflow-hidden">
                          <UserAvatar userId={m.id} name={m.name} size={16} />
                        </span>
                        {m.name}
                        <button onClick={() => setAddMemberSelected(prev => prev.filter(p => p.id !== m.id))} className="hover:text-red-500 transition-smooth">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={addMemberSearchQuery}
                  onChange={(e) => handleAddMemberSearch(e.target.value)}
                  className="input pl-10"
                  autoFocus
                />
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1">
                {addMemberSearchResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setAddMemberSelected(prev => [...prev, u]);
                      setAddMemberSearchResults(prev => prev.filter(p => p.id !== u.id));
                      setAddMemberSearchQuery('');
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-surface-muted)] border border-transparent hover:border-[var(--color-border-light)] transition-smooth"
                  >
                    <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                      <UserAvatar userId={u.id} name={u.name} size={36} />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-semibold text-sm text-[var(--color-text-primary)] truncate">{u.name}</div>
                      <div className="text-xs text-[var(--color-text-muted)] truncate">{u.email}</div>
                    </div>
                    <UserPlus className="w-4 h-4 text-[var(--color-blue-primary)] flex-shrink-0" />
                  </button>
                ))}
                {addMemberSearchQuery && addMemberSearchResults.length === 0 && (
                  <p className="text-sm text-[var(--color-text-muted)] text-center py-3">No users found</p>
                )}
              </div>
            </div>

            <div className="relative z-10 px-6 py-4 border-t border-[var(--color-border-light)] bg-white/80 backdrop-blur flex-shrink-0">
              <button
                onClick={handleAddMembersToGroup}
                disabled={addMemberSelected.length === 0 || addingMembers}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {addingMembers ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Add {addMemberSelected.length} Member{addMemberSelected.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
