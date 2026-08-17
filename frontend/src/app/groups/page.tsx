'use client';

import { useState, useEffect, useRef } from 'react';
import ResizableSidebar from '@/components/ResizableSidebar';
import { useAuth } from '@/context/AuthContext';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  MessageCircle, Users, Plus, Pin, ChevronUp, ChevronDown, Flame, Clock, Trophy,
  X, Search, Loader2, FileText, Download, Upload, UserPlus, UserMinus, Settings,
  ArrowLeft, Send, BookOpen, PinOff, Heart, Brain, Stethoscope,
  Syringe, Hospital, GraduationCap, Microscope, BookOpenCheck,
  Scissors, type LucideIcon,
} from 'lucide-react';
import {
  getCommunitiesAPI, createCommunityAPI, joinCommunityAPI, leaveCommunityAPI,
  getCommunityMembersAPI, addCommunityMembersAPI, removeCommunityMemberAPI,
  getThreadsAPI, createThreadAPI, voteThreadAPI, togglePinThreadAPI,
  getThreadRepliesAPI, createThreadReplyAPI,
  getCommunityResourcesAPI, uploadCommunityResourceAPI, downloadCommunityResourceAPI,
  searchUsersAPI,
} from '@/lib/api';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

// Cloud (absolute) file URLs are used as-is; legacy /uploads/... paths are served by our backend.
const resolveFileUrl = (url?: string | null) => {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `${BACKEND_URL}${url}`;
};

type SortMode = 'hot' | 'new' | 'top';

interface Community {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  membersCount: number;
  threadsCount: number;
  creatorId: string;
  creatorName: string;
  isJoined: boolean;
  myRole: string | null;
  createdAt: string;
}

interface ThreadItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  isPinned: boolean;
  authorName: string;
  authorRole: string;
  authorId: string;
  repliesCount: number;
  score: number;
  myVote: number;
  createdAt: string;
}

interface Reply {
  id: string;
  content: string;
  authorName: string;
  authorRole: string;
  authorId: string;
  createdAt: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  memberRole: string;
  joinedAt: string;
}

interface Resource {
  id: string;
  name: string;
  fileUrl: string;
  fileType: string;
  downloads: number;
  createdAt: string;
}

const CATEGORY_OPTIONS = ['General', 'Exam Prep', 'Cases', 'Specialty', 'Research'];

const ICON_OPTIONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: 'message-circle', icon: MessageCircle, label: 'Discussion' },
  { key: 'book-open', icon: BookOpen, label: 'Study' },
  { key: 'heart', icon: Heart, label: 'Cardiology' },
  { key: 'brain', icon: Brain, label: 'Neurology' },
  { key: 'scissors', icon: Scissors, label: 'Surgery' },
  { key: 'graduation-cap', icon: GraduationCap, label: 'Education' },
  { key: 'microscope', icon: Microscope, label: 'Research' },
  { key: 'book-open-check', icon: BookOpenCheck, label: 'Resources' },
  { key: 'search', icon: Search, label: 'Diagnosis' },
  { key: 'stethoscope', icon: Stethoscope, label: 'Clinical' },
  { key: 'syringe', icon: Syringe, label: 'Procedures' },
  { key: 'hospital', icon: Hospital, label: 'Hospital' },
];

function getCommunityIcon(iconKey: string) {
  return ICON_OPTIONS.find(o => o.key === iconKey)?.icon || MessageCircle;
}

function getTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getCategoryColor(cat: string) {
  const map: Record<string, string> = {
    'Exam Prep': 'bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)] border-[rgba(11,59,145,0.14)]',
    'Cases': 'bg-rose-50 text-rose-700 border-rose-100',
    'Specialty': 'bg-[rgba(0,11,51,0.05)] text-[var(--color-navy)] border-[rgba(0,11,51,0.12)]',
    'Research': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'General': 'bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] border-[var(--color-border-light)]',
  };
  return map[cat] || map['General'];
}

function CategoryChip({ category, className = '' }: { category: string; className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2 py-[3px] rounded-full text-[9.5px] font-bold uppercase tracking-[0.1em] border ${getCategoryColor(category)} ${className}`}>
      {category}
    </span>
  );
}

export default function GroupsPage() {
  const { user } = useAuth();

  // Data
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  // Mobile-only view switcher: 'list' = communities list, 'main' = community detail / thread.
  // Desktop ignores this (panels render side-by-side via lg: classes).
  const [mobileView, setMobileView] = useState<'list' | 'main'>('list');
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('hot');

  // Thread detail / replies
  const [selectedThread, setSelectedThread] = useState<ThreadItem | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loadingReplies, setLoadingReplies] = useState(false);

  // Loading
  const [loading, setLoading] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(false);

  // Modals
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [showAllResources, setShowAllResources] = useState(false);

  // Create community form
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityDesc, setNewCommunityDesc] = useState('');
  const [newCommunityCategory, setNewCommunityCategory] = useState('General');
  const [newCommunityEmoji, setNewCommunityEmoji] = useState('message-circle');

  // Create thread form
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadContent, setNewThreadContent] = useState('');
  const [newThreadTags, setNewThreadTags] = useState('');

  // Add member search
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);

  const [creating, setCreating] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load communities ──────────────────────────────────
  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    try {
      const data = await getCommunitiesAPI();
      setCommunities(data);
    } catch (err) {
      console.error('Failed to load communities:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Load threads when community or sort changes ───────
  useEffect(() => {
    if (selectedCommunity) {
      loadThreads();
      loadResources();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity?.id, sortMode]);

  const loadThreads = async () => {
    if (!selectedCommunity) return;
    setLoadingThreads(true);
    try {
      const data = await getThreadsAPI(selectedCommunity.id, sortMode);
      setThreads(data);
    } catch (err) {
      console.error('Failed to load threads:', err);
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadResources = async () => {
    if (!selectedCommunity) return;
    try {
      const data = await getCommunityResourcesAPI(selectedCommunity.id);
      setResources(data);
    } catch (err) {
      console.error('Failed to load resources:', err);
    }
  };

  // ── Handlers ──────────────────────────────────────────
  const handleSelectCommunity = (c: Community) => {
    setSelectedCommunity(c);
    setSelectedThread(null);
    setReplies([]);
    setReplyText('');
    setMobileView('main');
  };

  const handleCreateCommunity = async () => {
    if (!newCommunityName.trim() || !newCommunityDesc.trim()) return;
    setCreating(true);
    try {
      const created = await createCommunityAPI({
        name: newCommunityName,
        description: newCommunityDesc,
        category: newCommunityCategory,
        emoji: newCommunityEmoji,
      });
      setCommunities(prev => [created, ...prev]);
      setSelectedCommunity(created);
      setShowCreateCommunity(false);
      setNewCommunityName('');
      setNewCommunityDesc('');
      setNewCommunityCategory('General');
      setNewCommunityEmoji('message-circle');
      showToast('Community created successfully!');
    } catch (err: any) {
      console.error('Failed to create community:', err);
      showToast(err?.response?.data?.message || 'Failed to create community', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinLeave = async (community: Community) => {
    try {
      if (community.isJoined) {
        const res = await leaveCommunityAPI(community.id);
        setCommunities(prev => prev.map(c => c.id === community.id ? { ...c, isJoined: false, myRole: null, membersCount: res.membersCount } : c));
        if (selectedCommunity?.id === community.id) {
          setSelectedCommunity(prev => prev ? { ...prev, isJoined: false, myRole: null, membersCount: res.membersCount } : null);
        }
      } else {
        const res = await joinCommunityAPI(community.id);
        setCommunities(prev => prev.map(c => c.id === community.id ? { ...c, isJoined: true, myRole: 'member', membersCount: res.membersCount } : c));
        if (selectedCommunity?.id === community.id) {
          setSelectedCommunity(prev => prev ? { ...prev, isJoined: true, myRole: 'member', membersCount: res.membersCount } : null);
        }
      }
    } catch (err) {
      console.error('Join/leave failed:', err);
      showToast('Failed to update membership', 'error');
    }
  };

  const handleCreateThread = async () => {
    if (!newThreadTitle.trim() || !selectedCommunity) return;
    try {
      const tags = newThreadTags.split(',').map(t => t.trim()).filter(Boolean);
      const thread = await createThreadAPI(selectedCommunity.id, {
        title: newThreadTitle,
        content: newThreadContent,
        tags,
      });
      setThreads(prev => [thread, ...prev]);
      setShowNewThread(false);
      setNewThreadTitle('');
      setNewThreadContent('');
      setNewThreadTags('');
    } catch (err) {
      console.error('Failed to create thread:', err);
      showToast('Failed to create thread', 'error');
    }
  };

  const handleVote = async (threadId: string, value: number) => {
    try {
      const res = await voteThreadAPI(threadId, value);
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, score: res.score, myVote: res.myVote } : t));
      if (selectedThread?.id === threadId) {
        setSelectedThread(prev => prev ? { ...prev, score: res.score, myVote: res.myVote } : null);
      }
    } catch (err) {
      console.error('Vote failed:', err);
    }
  };

  const handlePinThread = async (threadId: string) => {
    try {
      const res = await togglePinThreadAPI(threadId);
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, isPinned: res.isPinned } : t));
    } catch (err) {
      console.error('Pin failed:', err);
    }
  };

  const handleOpenThread = async (thread: ThreadItem) => {
    setSelectedThread(thread);
    setLoadingReplies(true);
    try {
      const data = await getThreadRepliesAPI(thread.id);
      setReplies(data);
    } catch (err) {
      console.error('Failed to load replies:', err);
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThread) return;
    try {
      const reply = await createThreadReplyAPI(selectedThread.id, replyText);
      setReplies(prev => [...prev, reply]);
      setReplyText('');
      setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, repliesCount: t.repliesCount + 1 } : t));
      setSelectedThread(prev => prev ? { ...prev, repliesCount: prev.repliesCount + 1 } : null);
    } catch (err) {
      console.error('Reply failed:', err);
    }
  };

  // ── Member management ─────────────────────────────────
  const handleOpenManageMembers = async () => {
    if (!selectedCommunity) return;
    setShowManageMembers(true);
    try {
      const data = await getCommunityMembersAPI(selectedCommunity.id);
      setMembers(data);
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  };

  const handleSearchUsers = async (query: string) => {
    setMemberSearchQuery(query);
    if (query.length < 2) { setMemberSearchResults([]); return; }
    setSearchingMembers(true);
    try {
      const results = await searchUsersAPI(query);
      const memberIds = new Set(members.map(m => m.id));
      setMemberSearchResults(results.filter((u: any) => !memberIds.has(u.id)));
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchingMembers(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedCommunity) return;
    try {
      await addCommunityMembersAPI(selectedCommunity.id, [userId]);
      const data = await getCommunityMembersAPI(selectedCommunity.id);
      setMembers(data);
      setMemberSearchResults(prev => prev.filter(u => u.id !== userId));
      setCommunities(prev => prev.map(c => c.id === selectedCommunity.id ? { ...c, membersCount: data.length } : c));
      setSelectedCommunity(prev => prev ? { ...prev, membersCount: data.length } : null);
    } catch (err) {
      console.error('Add member failed:', err);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedCommunity) return;
    try {
      await removeCommunityMemberAPI(selectedCommunity.id, userId);
      setMembers(prev => prev.filter(m => m.id !== userId));
      setCommunities(prev => prev.map(c => c.id === selectedCommunity.id ? { ...c, membersCount: c.membersCount - 1 } : c));
      setSelectedCommunity(prev => prev ? { ...prev, membersCount: prev.membersCount - 1 } : null);
    } catch (err) {
      console.error('Remove member failed:', err);
    }
  };

  // ── Resource handling ─────────────────────────────────
  const handleUploadResource = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !selectedCommunity) return;
    try {
      const resource = await uploadCommunityResourceAPI(selectedCommunity.id, e.target.files[0]);
      setResources(prev => [resource, ...prev]);
    } catch (err) {
      console.error('Upload failed:', err);
      showToast('Failed to upload resource', 'error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadResource = async (resource: Resource) => {
    try {
      await downloadCommunityResourceAPI(resource.id);
      window.open(resolveFileUrl(resource.fileUrl), '_blank');
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const isAdmin = selectedCommunity?.myRole === 'creator' || selectedCommunity?.myRole === 'admin';

  // ── RENDER ────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-subtle">
      {/* Toast */}
      {toast && (
        <div className="toast" data-type={toast.type} role="status">
          <span className="toast-dot" />
          {toast.message}
        </div>
      )}
      <div className="page-container">
        {/* Editorial masthead — hidden on mobile when a community is open */}
        <header className={`relative mb-8 pb-8 border-b border-[var(--color-border-rule)] animate-section ${mobileView === 'main' ? 'hidden lg:block' : ''}`}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="flex-1 max-w-3xl">
              <p className="label !mb-3">Communities</p>
              <h1 className="heading-hero mb-4">
                Smaller <span className="serif-accent">circles</span>, deeper talk.
              </h1>
              <p className="body-lg max-w-xl text-[var(--color-text-secondary)]">
                Join groups around your specialty, exam prep, or research. Discuss cases, share resources, and find your people.
              </p>
            </div>
          </div>
        </header>

        <div className="card workspace-shell rounded-3xl overflow-hidden flex flex-col lg:flex-row h-[calc(100vh-280px)] min-h-[560px]">
      {/* Left Sidebar — Communities List */}
      <ResizableSidebar side="left" defaultWidth={280} minWidth={240} maxWidth={360} className="bg-[var(--color-surface-muted)] lg:border-r border-[var(--color-border-light)]" responsive mobileVisible={mobileView === 'list'}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-[var(--color-border-hairline)]">
            <p className="label !mb-3">Your circles</p>
            <button onClick={() => setShowCreateCommunity(true)} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
              <Plus className="w-4 h-4" strokeWidth={2} /> Create Community
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-4">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3" style={{ opacity: 1 - i * 0.2 }}>
                    <div className="skeleton w-9 h-9 !rounded-lg shrink-0" />
                    <div className="flex-1 pt-0.5">
                      <div className="skeleton h-3 w-3/4 mb-2" />
                      <div className="skeleton h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : communities.length === 0 ? (
              <div className="text-center py-10 px-4">
                <p className="text-[0.8125rem] text-[var(--color-text-soft)] serif-accent">
                  No communities yet — found the first one.
                </p>
              </div>
            ) : (
              communities.map(c => {
                const active = selectedCommunity?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCommunity(c)}
                    className={`relative w-full text-left p-4 border-b border-[var(--color-border-hairline)] transition-smooth group ${
                      active ? 'bg-[var(--color-accent-soft)]/70' : 'hover:bg-[var(--color-surface-elevated)]'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-blue-primary)] transition-opacity ${
                        active ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'
                      }`}
                    />
                    <div className="flex items-start gap-3">
                      {(() => {
                        const Icon = getCommunityIcon(c.emoji);
                        return (
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border transition-colors ${
                            active
                              ? 'bg-[var(--color-surface-white)] border-[rgba(11,59,145,0.16)]'
                              : 'bg-[var(--color-accent-soft)] border-transparent'
                          }`}>
                            <Icon className="w-[18px] h-[18px] text-[var(--color-blue-primary)]" strokeWidth={1.75} />
                          </div>
                        );
                      })()}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm truncate tracking-tight ${active ? 'font-bold text-[var(--color-navy)]' : 'font-semibold text-[var(--color-text-primary)]'}`}>
                            {c.name}
                          </span>
                          {c.isJoined && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Joined" />
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2 leading-relaxed">{c.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <CategoryChip category={c.category} />
                          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-soft)]">
                            {c.membersCount.toLocaleString()} members
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </ResizableSidebar>

      {/* Main Content */}
      <div className={`flex-1 flex-col overflow-hidden ${mobileView === 'main' ? 'flex' : 'hidden'} lg:flex`}>
        {/* Mobile back-bar (only when a community is selected) */}
        {selectedCommunity && (
          <div className="lg:hidden flex items-center gap-2 px-3 py-2.5 bg-white border-b border-[var(--color-border-light)]">
            <button
              onClick={() => { setMobileView('list'); }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth"
              aria-label="Back to communities"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--color-text-primary)] truncate">{selectedCommunity.name}</span>
            {/* The right info sidebar is desktop-only; on phones the shared
                library stays reachable through the existing resources modal. */}
            <button
              onClick={() => setShowAllResources(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border-light)] text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth shrink-0"
              aria-label="Open shared library"
            >
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-semibold">Library</span>
              {resources.length > 0 && (
                <span className="text-[10px] font-bold bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)] px-1.5 py-0.5 rounded-full">{resources.length}</span>
              )}
            </button>
          </div>
        )}
        {!selectedCommunity ? (
          <div className="flex-1 flex items-center justify-center relative">
            <div aria-hidden className="absolute inset-0 dot-grid opacity-30" />
            <div className="text-center relative px-6">
              <div className="empty-plate">
                <Users className="w-7 h-7" strokeWidth={1.25} />
              </div>
              <p className="label justify-center !mb-2">Communities</p>
              <h2 className="heading-3 mb-2">Find your <span className="serif-accent">circle</span></h2>
              <p className="body-sm max-w-xs mx-auto">Select a community from the sidebar, or create a new one for your specialty.</p>
            </div>
          </div>
        ) : selectedThread ? (
          /* ── Thread detail view ─────────────────────── */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-[var(--color-border-hairline)] bg-[var(--color-surface-white)]">
              <button
                onClick={() => { setSelectedThread(null); setReplies([]); setReplyText(''); }}
                className="btn-ghost inline-flex items-center gap-1.5 !px-2 -ml-2 mb-3 text-[0.8125rem]"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to threads
              </button>
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="vote-pill">
                  <button
                    onClick={() => handleVote(selectedThread.id, 1)}
                    className="vote-btn"
                    data-active={selectedThread.myVote === 1 ? 'up' : undefined}
                    aria-label="Upvote"
                  >
                    <ChevronUp className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <span className="vote-score">{selectedThread.score}</span>
                  <button
                    onClick={() => handleVote(selectedThread.id, -1)}
                    className="vote-btn"
                    data-active={selectedThread.myVote === -1 ? 'down' : undefined}
                    aria-label="Downvote"
                  >
                    <ChevronDown className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  {selectedThread.isPinned && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-blue-primary)] bg-[var(--color-accent-soft)] border border-[rgba(11,59,145,0.14)] rounded-full px-2 py-[3px] mb-2">
                      <Pin className="w-2.5 h-2.5" /> Pinned
                    </span>
                  )}
                  <h2
                    className="text-[var(--color-navy)] break-words"
                    style={{
                      fontFamily: 'var(--font-fraunces), serif',
                      fontSize: '1.375rem',
                      fontWeight: 500,
                      letterSpacing: '-0.022em',
                      lineHeight: 1.2,
                    }}
                  >
                    {selectedThread.title}
                  </h2>
                  {selectedThread.content && (
                    <p className="text-[0.9375rem] text-[var(--color-text-body)] mt-2 whitespace-pre-wrap break-words leading-[1.7]">{selectedThread.content}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className="text-xs font-semibold text-[var(--color-navy)] tracking-tight">{selectedThread.authorName}</span>
                    <span className="w-[3px] h-[3px] rounded-full bg-[var(--color-border-strong)]" />
                    <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)]">{getTimeAgo(selectedThread.createdAt)}</span>
                    <span className="w-[3px] h-[3px] rounded-full bg-[var(--color-border-strong)]" />
                    <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)]">
                      {selectedThread.repliesCount} {selectedThread.repliesCount === 1 ? 'reply' : 'replies'}
                    </span>
                  </div>
                  {selectedThread.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {selectedThread.tags.map(tag => (
                        <span key={tag} className="chip !cursor-default">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Replies */}
            <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 space-y-3 bg-[var(--color-bg-paper)]">
              {loadingReplies ? (
                <div className="space-y-3">
                  {[0, 1].map(i => (
                    <div key={i} className="flex gap-3" style={{ opacity: 1 - i * 0.35 }}>
                      <div className="skeleton skeleton-circle w-8 h-8 shrink-0" />
                      <div className="flex-1 card-item p-4">
                        <div className="skeleton h-3 w-32 mb-2.5" />
                        <div className="skeleton h-2.5 w-full mb-1.5" />
                        <div className="skeleton h-2.5 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : replies.length === 0 ? (
                <p className="text-center text-[0.8125rem] text-[var(--color-text-soft)] py-10 serif-accent">
                  No replies yet — be the first to respond.
                </p>
              ) : (
                replies.map(reply => (
                  <div key={reply.id} className="flex gap-3">
                    <UserAvatar userId={reply.authorId} name={reply.authorName} size={32} linkToProfile className="mt-1 ring-1 ring-[var(--color-border-hairline)]" />
                    <div className="flex-1 min-w-0 card-item px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-semibold text-[0.8125rem] text-[var(--color-navy)] tracking-tight">{reply.authorName}</span>
                        <span className="text-[9.5px] uppercase tracking-[0.12em] font-bold text-[var(--color-text-soft)]">{reply.authorRole}</span>
                        <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-soft)] ml-auto">{getTimeAgo(reply.createdAt)}</span>
                      </div>
                      <p className="text-[0.8125rem] text-[var(--color-text-primary)] whitespace-pre-wrap break-words leading-relaxed">{reply.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Reply input */}
            {selectedCommunity.isJoined && (
              <div className="px-3 py-3 sm:px-6 sm:py-4 border-t border-[var(--color-border-hairline)] bg-[var(--color-surface-white)] mobile-safe-bottom">
                <div className="flex gap-2">
                  <input
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendReply()}
                    placeholder="Write a reply…"
                    className="input flex-1 !rounded-full !px-4"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim()}
                    className="btn-primary !rounded-full inline-flex items-center gap-2 !px-5 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" strokeWidth={1.75} /> Reply
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Community thread list ─────────────────── */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Community header */}
            <div className="bg-[var(--color-surface-white)] border-b border-[var(--color-border-hairline)] px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4 mb-4">
                <div className="flex items-center gap-4 min-w-0">
                  {(() => {
                    const Icon = getCommunityIcon(selectedCommunity.emoji);
                    return (
                      <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent-soft)] border border-[rgba(11,59,145,0.1)] flex items-center justify-center shrink-0 shadow-hairline">
                        <Icon className="w-6 h-6 text-[var(--color-blue-primary)]" strokeWidth={1.5} />
                      </div>
                    );
                  })()}
                  <div className="min-w-0">
                    <h1
                      className="text-[var(--color-navy)] truncate"
                      style={{
                        fontFamily: 'var(--font-fraunces), serif',
                        fontSize: '1.5rem',
                        fontWeight: 500,
                        letterSpacing: '-0.025em',
                        lineHeight: 1.15,
                      }}
                    >
                      {selectedCommunity.name}
                    </h1>
                    <p className="text-[0.8125rem] text-[var(--color-text-muted)] mt-1 line-clamp-1">{selectedCommunity.description}</p>
                    <div className="flex flex-wrap items-center gap-2.5 mt-2">
                      <CategoryChip category={selectedCommunity.category} />
                      <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)]">
                        {selectedCommunity.membersCount.toLocaleString()} members
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && (
                    <button onClick={handleOpenManageMembers} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
                      <Settings className="w-4 h-4" strokeWidth={1.75} /> Manage
                    </button>
                  )}
                  <button
                    onClick={() => handleJoinLeave(selectedCommunity)}
                    className={selectedCommunity.isJoined ? 'btn-secondary' : 'btn-primary'}
                  >
                    {selectedCommunity.isJoined ? 'Leave' : 'Join'}
                  </button>
                </div>
              </div>

              {/* Sort tabs + New Thread */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="seg">
                  {([
                    { key: 'hot' as SortMode, icon: Flame, label: 'Hot' },
                    { key: 'new' as SortMode, icon: Clock, label: 'New' },
                    { key: 'top' as SortMode, icon: Trophy, label: 'Top' },
                  ]).map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setSortMode(key)}
                      className="seg-btn"
                      data-active={sortMode === key}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> {label}
                    </button>
                  ))}
                </div>
                {selectedCommunity.isJoined && (
                  <button onClick={() => setShowNewThread(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
                    <Plus className="w-4 h-4" strokeWidth={2} /> New Thread
                  </button>
                )}
              </div>
            </div>

            {/* Threads list */}
            <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5 space-y-3 bg-[var(--color-bg-paper)]">
              {loadingThreads ? (
                <div className="space-y-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="card p-4 flex gap-4" style={{ opacity: 1 - i * 0.25 }}>
                      <div className="skeleton w-9 h-20 !rounded-full shrink-0" />
                      <div className="flex-1 pt-1">
                        <div className="skeleton h-3.5 w-2/3 mb-3" />
                        <div className="skeleton h-2.5 w-24 mb-2" />
                        <div className="skeleton h-2.5 w-40" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="text-center py-14 relative">
                  <div className="empty-plate">
                    <MessageCircle className="w-7 h-7" strokeWidth={1.25} />
                  </div>
                  <p className="label justify-center !mb-2">Open floor</p>
                  <h3 className="heading-3 mb-1.5">No threads <span className="serif-accent">yet</span></h3>
                  <p className="body-sm">Start the first discussion in this circle.</p>
                </div>
              ) : (
                threads.map(thread => (
                  <div
                    key={thread.id}
                    className="card hover-lift group"
                  >
                    <div className="flex items-start gap-3 p-3.5 sm:gap-4 sm:p-4">
                      {/* Vote column */}
                      <div className="vote-pill">
                        <button
                          onClick={() => handleVote(thread.id, 1)}
                          className="vote-btn"
                          data-active={thread.myVote === 1 ? 'up' : undefined}
                          aria-label="Upvote"
                        >
                          <ChevronUp className="w-4 h-4" strokeWidth={2} />
                        </button>
                        <span className="vote-score">{thread.score}</span>
                        <button
                          onClick={() => handleVote(thread.id, -1)}
                          className="vote-btn"
                          data-active={thread.myVote === -1 ? 'down' : undefined}
                          aria-label="Downvote"
                        >
                          <ChevronDown className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </div>

                      {/* Thread content */}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenThread(thread)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {thread.isPinned && (
                            <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-blue-primary)] bg-[var(--color-accent-soft)] border border-[rgba(11,59,145,0.14)] rounded-full px-2 py-[2px]">
                              <Pin className="w-2.5 h-2.5" /> Pinned
                            </span>
                          )}
                          <h3
                            className="min-w-0 break-words text-[var(--color-navy)] group-hover:text-[var(--color-blue-primary)] transition-colors duration-300"
                            style={{
                              fontFamily: 'var(--font-fraunces), serif',
                              fontSize: '1.0625rem',
                              fontWeight: 500,
                              letterSpacing: '-0.015em',
                              lineHeight: 1.3,
                            }}
                          >
                            {thread.title}
                          </h3>
                        </div>
                        {thread.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {thread.tags.map(tag => (
                              <span key={tag} className="chip !cursor-pointer">{tag}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2.5">
                          <span className="text-xs font-semibold text-[var(--color-text-secondary)] tracking-tight">{thread.authorName}</span>
                          <span className="w-[3px] h-[3px] rounded-full bg-[var(--color-border-strong)]" />
                          <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)]">{getTimeAgo(thread.createdAt)}</span>
                          <span className="w-[3px] h-[3px] rounded-full bg-[var(--color-border-strong)]" />
                          <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)] inline-flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" strokeWidth={1.75} />
                            {thread.repliesCount}
                          </span>
                        </div>
                      </div>

                      {/* Pin button for admins */}
                      {isAdmin && (
                        <button
                          onClick={() => handlePinThread(thread.id)}
                          className="icon-btn icon-btn-sm lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                          data-tip={thread.isPinned ? 'Unpin' : 'Pin'}
                          aria-label={thread.isPinned ? 'Unpin thread' : 'Pin thread'}
                        >
                          {thread.isPinned ? <PinOff className="w-4 h-4" strokeWidth={1.75} /> : <Pin className="w-4 h-4" strokeWidth={1.75} />}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar — Stats & Resources */}
      {selectedCommunity && !selectedThread && (
        <ResizableSidebar side="right" defaultWidth={300} minWidth={260} maxWidth={400} className="bg-[var(--color-surface-muted)] lg:border-l border-[var(--color-border-light)]" responsive mobileVisible={false}>
          <div className="p-5 space-y-5">
            {/* Group Stats */}
            <div className="card p-5">
              <p className="label !mb-4">At a glance</p>
              <div className="space-y-0">
                <div className="flex items-baseline justify-between py-2.5 border-b border-[var(--color-border-hairline)]">
                  <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-muted)]">Members</span>
                  <span
                    className="text-[var(--color-navy)] tabular-nums"
                    style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.25rem', fontWeight: 500 }}
                  >
                    {selectedCommunity.membersCount.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-baseline justify-between py-2.5 border-b border-[var(--color-border-hairline)]">
                  <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-muted)]">Active threads</span>
                  <span
                    className="text-[var(--color-navy)] tabular-nums"
                    style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.25rem', fontWeight: 500 }}
                  >
                    {threads.length}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-muted)]">Category</span>
                  <CategoryChip category={selectedCommunity.category} />
                </div>
              </div>
            </div>

            {/* Shared Resources */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="label !mb-0">Library</p>
                {isAdmin && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="icon-btn icon-btn-sm"
                    data-tip="Upload resource"
                    aria-label="Upload resource"
                  >
                    <Upload className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadResource} />

              {resources.length === 0 ? (
                <p className="text-[0.8125rem] text-[var(--color-text-soft)] text-center py-4 serif-accent">
                  Nothing shared yet.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {resources.slice(0, 3).map(r => (
                      <button
                        key={r.id}
                        onClick={() => handleDownloadResource(r)}
                        className="card-item w-full flex items-center gap-3 px-3 py-2.5 text-left hover:border-[var(--color-border-mid)] hover:bg-[var(--color-accent-soft)]/40 transition-smooth group"
                      >
                        <span className="w-8 h-8 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border-hairline)] flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[0.8125rem] font-semibold text-[var(--color-text-primary)] tracking-tight truncate">{r.name}</span>
                          <span className="block text-[9.5px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-soft)] mt-0.5">
                            {r.downloads} downloads
                          </span>
                        </span>
                        <Download className="w-3.5 h-3.5 text-[var(--color-text-soft)] group-hover:text-[var(--color-navy)] transition-colors shrink-0" strokeWidth={1.75} />
                      </button>
                    ))}
                  </div>
                  {resources.length > 3 && (
                    <button
                      onClick={() => setShowAllResources(true)}
                      className="w-full text-center text-[0.8125rem] font-semibold text-[var(--color-blue-primary)] hover:text-[var(--color-navy)] transition-colors mt-3"
                    >
                      View all resources →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </ResizableSidebar>
      )}

      {/* ── MODALS ───────────────────────────────────── */}

      {/* Create Community Modal */}
      {showCreateCommunity && (
        <div className="modal-overlay" onClick={() => setShowCreateCommunity(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head !border-b-0 !pb-0">
              <div>
                <p className="label !mb-1.5">New circle</p>
                <h3 className="modal-title">Create a community</h3>
              </div>
              <button onClick={() => setShowCreateCommunity(false)} className="icon-btn icon-btn-sm -mt-1 -mr-1" aria-label="Close">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="field-label">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_OPTIONS.map(({ key, icon: Icon, label }) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setNewCommunityEmoji(key)}
                      title={label}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-smooth ${
                        newCommunityEmoji === key
                          ? 'border-[var(--color-navy)] bg-[var(--color-accent-soft)] shadow-hairline'
                          : 'border-[var(--color-border-hairline)] hover:border-[var(--color-border-mid)] hover:bg-[var(--color-surface-elevated)]'
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px] text-[var(--color-blue-primary)]" strokeWidth={1.75} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label">Name</label>
                <input value={newCommunityName} onChange={e => setNewCommunityName(e.target.value)} placeholder="e.g. Cardiology Cases" className="input" />
              </div>
              <div>
                <label className="field-label">Description</label>
                <textarea value={newCommunityDesc} onChange={e => setNewCommunityDesc(e.target.value)} placeholder="What is this community about?" rows={3} className="input resize-none" />
              </div>
              <div>
                <label className="field-label">Category</label>
                <select value={newCommunityCategory} onChange={e => setNewCommunityCategory(e.target.value)} className="input">
                  {CATEGORY_OPTIONS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-foot">
              <button onClick={() => setShowCreateCommunity(false)} className="btn-secondary">Cancel</button>
              <button
                type="button"
                onClick={handleCreateCommunity}
                disabled={!newCommunityName.trim() || !newCommunityDesc.trim() || creating}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-40"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                {creating ? 'Creating…' : 'Create community'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Thread Modal */}
      {showNewThread && (
        <div className="modal-overlay" onClick={() => setShowNewThread(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head !border-b-0 !pb-0">
              <div>
                <p className="label !mb-1.5">Open a discussion</p>
                <h3 className="modal-title">New thread</h3>
              </div>
              <button onClick={() => setShowNewThread(false)} className="icon-btn icon-btn-sm -mt-1 -mr-1" aria-label="Close">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="field-label">Title</label>
                <input value={newThreadTitle} onChange={e => setNewThreadTitle(e.target.value)} placeholder="What's on your mind?" className="input" autoFocus />
              </div>
              <div>
                <label className="field-label">Content <span className="optional">(optional)</span></label>
                <textarea value={newThreadContent} onChange={e => setNewThreadContent(e.target.value)} placeholder="Add more details…" rows={4} className="input resize-none" />
              </div>
              <div>
                <label className="field-label">Tags <span className="optional">(comma separated)</span></label>
                <input value={newThreadTags} onChange={e => setNewThreadTags(e.target.value)} placeholder="e.g. resources, anatomy" className="input" />
              </div>
            </div>
            <div className="modal-foot">
              <button onClick={() => setShowNewThread(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreateThread} disabled={!newThreadTitle.trim()} className="btn-primary disabled:opacity-40">Post thread</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Members Modal */}
      {showManageMembers && (
        <div className="modal-overlay" onClick={() => { setShowManageMembers(false); setMemberSearchQuery(''); setMemberSearchResults([]); }}>
          <div className="modal-card !max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="modal-head !border-b-0 !pb-0">
              <div>
                <p className="label !mb-1.5">{selectedCommunity?.name}</p>
                <h3 className="modal-title">Manage members</h3>
              </div>
              <button
                onClick={() => { setShowManageMembers(false); setMemberSearchQuery(''); setMemberSearchResults([]); }}
                className="icon-btn icon-btn-sm -mt-1 -mr-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            {/* Add member search */}
            <div className="px-6 pt-5 pb-4 border-b border-[var(--color-border-hairline)]">
              <label className="field-label">Add members</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-soft)]" strokeWidth={1.75} />
                <input value={memberSearchQuery} onChange={e => handleSearchUsers(e.target.value)} placeholder="Search colleagues by name…" className="input !pl-10" />
              </div>
              {searchingMembers && (
                <div className="mt-2 space-y-1.5">
                  <div className="skeleton h-9 w-full" />
                </div>
              )}
              {memberSearchResults.length > 0 && (
                <div className="mt-2 max-h-[130px] overflow-y-auto space-y-0.5">
                  {memberSearchResults.map(u => (
                    <div key={u.id} className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-[var(--color-accent-soft)]/60 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar userId={u.id} name={u.name} size={28} />
                        <span className="text-sm font-semibold text-[var(--color-text-primary)] tracking-tight truncate">{u.name}</span>
                        <span className="text-[9.5px] uppercase tracking-[0.12em] font-bold text-[var(--color-text-soft)] shrink-0">{u.role}</span>
                      </div>
                      <button
                        onClick={() => handleAddMember(u.id)}
                        className="text-xs font-semibold text-[var(--color-blue-primary)] hover:bg-[var(--color-accent-soft)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0"
                      >
                        <UserPlus className="w-3 h-3" strokeWidth={2} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Current members list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="label !mb-3">Current members · {members.length}</p>
              <div className="space-y-1.5">
                {members.map(m => (
                  <div key={m.id} className="card-item flex items-center justify-between px-3 py-2.5 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar userId={m.id} name={m.name} size={32} linkToProfile className="ring-1 ring-[var(--color-border-hairline)]" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--color-text-primary)] tracking-tight truncate">{m.name}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-[2px] rounded-full border shrink-0 ${
                            m.memberRole === 'creator'
                              ? 'bg-[var(--color-navy)] text-white border-transparent'
                              : m.memberRole === 'admin'
                                ? 'bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)] border-[rgba(11,59,145,0.14)]'
                                : 'bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] border-[var(--color-border-light)]'
                          }`}>
                            {m.memberRole}
                          </span>
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-soft)]">{m.role}</span>
                      </div>
                    </div>
                    {m.memberRole !== 'creator' && m.id !== user?._id && (
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="icon-btn icon-btn-sm icon-btn-danger lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                        data-tip="Remove"
                        aria-label={`Remove ${m.name}`}
                      >
                        <UserMinus className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Resources Modal */}
      {showAllResources && (
        <div className="modal-overlay" onClick={() => setShowAllResources(false)}>
          <div className="modal-card !max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="modal-head !border-b-0 !pb-0">
              <div>
                <p className="label !mb-1.5">Library</p>
                <h3 className="modal-title">Shared resources</h3>
              </div>
              <button onClick={() => setShowAllResources(false)} className="icon-btn icon-btn-sm -mt-1 -mr-1" aria-label="Close">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5">
              {resources.length === 0 ? (
                <p className="text-center text-[0.8125rem] text-[var(--color-text-soft)] py-8 serif-accent">Nothing shared yet.</p>
              ) : (
                resources.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleDownloadResource(r)}
                    className="card-item w-full flex items-center gap-3 px-3.5 py-3 text-left hover:border-[var(--color-border-mid)] hover:bg-[var(--color-accent-soft)]/40 transition-smooth group"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border-hairline)] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[var(--color-text-primary)] tracking-tight truncate">{r.name}</span>
                      <span className="block text-[9.5px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-soft)] mt-0.5">
                        {r.downloads} downloads · {r.fileType.toUpperCase()} · {getTimeAgo(r.createdAt)}
                      </span>
                    </span>
                    <Download className="w-4 h-4 text-[var(--color-text-soft)] group-hover:text-[var(--color-navy)] transition-colors shrink-0" strokeWidth={1.75} />
                  </button>
                ))
              )}
            </div>
            {isAdmin && (
              <div className="modal-foot !justify-stretch">
                <button onClick={() => fileInputRef.current?.click()} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" strokeWidth={1.75} /> Upload resource
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
    </div>
  );
}
