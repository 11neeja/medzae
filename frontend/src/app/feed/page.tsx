'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ResizableSidebar from '@/components/ResizableSidebar';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Share2,
  Image as ImageIcon,
  Link as LinkIcon,
  TrendingUp,
  Newspaper,
  Calendar,
  Users,
  BookOpen,
  Loader2,
  X,
  Send,
  Trash2,
  MoreHorizontal,
  Smile,
  SendHorizonal,
} from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useAuth } from '@/context/AuthContext';
import {
  getPostsAPI,
  createPostAPI,
  toggleLikeAPI,
  toggleBookmarkAPI,
  addCommentAPI,
  deleteCommentAPI,
  repostAPI,
  deletePostAPI,
  createPrivateConversationAPI,
} from '@/lib/api';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

// Resolve a stored image URL. Cloudinary (and other cloud) URLs are absolute
// and used as-is; legacy /uploads/... paths are served by our backend.
const resolveImageUrl = (url?: string | null) => {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `${BACKEND_URL}${url}`;
};

type Role = 'Student' | 'Doctor' | 'Professor' | 'Researcher';

interface Author {
  _id: string;
  id: string;
  name: string;
  email: string;
  role?: string;
  avatarUrl?: string | null;
}

interface Comment {
  _id: string;
  content: string;
  createdAt: string;
  author: Author;
}

interface Post {
  _id: string;
  content: string;
  tags: string[];
  imageUrl?: string | null;
  linkUrl?: string | null;
  createdAt: string;
  author: Author;
  likes: { _id: string; name: string }[];
  commentsCount: number;
  repostsCount: number;
  comments: Comment[];
  repostedFrom?: Post | null;
  bookmarkedBy: string[];
}

const EMOJI_LIST = [
  '😀','😂','🥰','😍','🤔','👍','👏','🔥','❤️','💯',
  '🎉','✅','⚡','🧬','🩺','💉','🏥','📊','📝','🔬',
  '🧪','💊','🫀','🧠','👨‍⚕️','👩‍⚕️','🤝','💡','📚','🎓',
];

export default function FeedPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState<File | null>(null);
  const [newPostImagePreview, setNewPostImagePreview] = useState<string | null>(null);
  const [newPostLink, setNewPostLink] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [repostModal, setRepostModal] = useState<string | null>(null);
  const [repostContent, setRepostContent] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2600);
  };

  const currentUserId = user?._id || '';
  const currentUserName = user?.name || 'You';
  const currentUserAvatar = user?.avatarUrl ?? null;
  const currentUserHandle = `@${currentUserName.toLowerCase().replace(/\s+/g, '')}`;

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const data = await getPostsAPI();
        setPosts(data);
      } catch (err) {
        console.error('Failed to fetch posts:', err);
      } finally {
        setIsLoadingPosts(false);
      }
    };
    fetchPosts();
  }, []);

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPosts = filterTag
    ? posts.filter(post => post.tags?.includes(filterTag))
    : posts;

  // Compute trending topics from actual post tags
  const trendingTopics = (() => {
    const tagCount: Record<string, number> = {};
    posts.forEach(p => {
      (p.tags || []).forEach(t => {
        tagCount[t] = (tagCount[t] || 0) + 1;
      });
      if (p.repostedFrom?.tags) {
        p.repostedFrom.tags.forEach(t => {
          tagCount[t] = (tagCount[t] || 0) + 1;
        });
      }
    });
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, posts: `${count} post${count !== 1 ? 's' : ''}` }));
  })();

  // Extract hashtags
  const extractHashtags = (text: string): string[] => {
    const matches = text.match(/#(\w+)/g);
    return matches ? matches.map(tag => tag.slice(1).toLowerCase()) : [];
  };

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewPostImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setNewPostImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setNewPostImage(null);
    setNewPostImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Create post
  const handleCreatePost = async () => {
    if (!newPostContent.trim() && !newPostImage) return;
    setIsPosting(true);
    try {
      const tags = extractHashtags(newPostContent);
      const apiPost = await createPostAPI({
        content: newPostContent,
        tags,
        linkUrl: newPostLink || undefined,
        image: newPostImage || undefined,
      });
      setPosts([apiPost, ...posts]);
      setNewPostContent('');
      clearImage();
      setNewPostLink('');
      setShowLinkInput(false);
    } catch (err) {
      console.error('Failed to create post:', err);
    } finally {
      setIsPosting(false);
    }
  };

  // Like
  const handleLike = async (postId: string) => {
    try {
      const updated = await toggleLikeAPI(postId);
      setPosts(posts.map(p => (p._id === postId ? updated : p)));
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  };

  // Bookmark
  const handleBookmark = async (postId: string) => {
    try {
      const updated = await toggleBookmarkAPI(postId);
      setPosts(posts.map(p => (p._id === postId ? updated : p)));
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  };

  // Comment
  const toggleComments = (postId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const handleAddComment = async (postId: string) => {
    const text = commentTexts[postId]?.trim();
    if (!text) return;
    try {
      const updated = await addCommentAPI(postId, text);
      setPosts(posts.map(p => (p._id === postId ? updated : p)));
      setCommentTexts(prev => ({ ...prev, [postId]: '' }));
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    try {
      const updated = await deleteCommentAPI(postId, commentId);
      setPosts(posts.map(p => (p._id === postId ? updated : p)));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  // Repost
  const handleRepost = async (postId: string) => {
    try {
      const newRepost = await repostAPI(postId, repostContent);
      setPosts([newRepost, ...posts]);
      setRepostModal(null);
      setRepostContent('');
    } catch (err: any) {
      if (err?.response?.status === 400) {
        showToast('You already reposted this', 'error');
      }
      console.error('Failed to repost:', err);
      setRepostModal(null);
      setRepostContent('');
    }
  };

  // Share (copy link)
  const handleShare = (postId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/feed?post=${postId}`);
    showToast('Link copied to clipboard');
  };

  // Message user — create/get private conversation and navigate to chat
  const handleMessageUser = async (authorId: string) => {
    try {
      const conv = await createPrivateConversationAPI(authorId);
      router.push(`/chat?conversationId=${conv.id}`);
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  // Delete post
  const handleDeletePost = async (postId: string) => {
    try {
      await deletePostAPI(postId);
      setPosts(posts.filter(p => p._id !== postId));
      setMenuOpen(null);
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  };

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  const getRoleBadgeColor = (role: string): string => {
    switch (role) {
      case 'Professor': return 'bg-[rgba(0,11,51,0.06)] text-[var(--color-navy)] border-[rgba(0,11,51,0.14)]';
      case 'Researcher': return 'bg-[var(--color-accent-soft)] text-[var(--color-blue-secondary)] border-[rgba(30,66,159,0.16)]';
      case 'Student': return 'bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] border-[var(--color-border-light)]';
      case 'Doctor':
      default: return 'bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)] border-[rgba(11,59,145,0.14)]';
    }
  };

  const roleBadge = (role?: string) => (
    <span className={`inline-flex items-center px-2 py-[3px] rounded-full text-[9.5px] font-bold uppercase tracking-[0.1em] border ${getRoleBadgeColor(role || 'Doctor')}`}>
      {role || 'Doctor'}
    </span>
  );

  const renderPostContent = (content: string) => {
    // Render hashtags as clickable + detect URLs
    const parts = content.split(/(#\w+|https?:\/\/[^\s]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('#')) {
          const tag = part.slice(1).toLowerCase();
          return (
            <button key={i} onClick={() => setFilterTag(tag)} className="text-[var(--color-blue-primary)] font-semibold hover:underline">
              {part}
            </button>
          );
      }
      if (part.match(/^https?:\/\//)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--color-blue-primary)] font-medium hover:underline break-all">
            {part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Render a single post card (used for both main posts and reposted content)
  const renderPostCard = (post: Post, isRepost = false) => {
    const isLiked = post.likes?.some(l => l._id === currentUserId);
    const isBookmarked = post.bookmarkedBy?.includes(currentUserId);
    const commentsOpen = expandedComments.has(post._id);

    return (
      <article key={post._id} id={`post-${post._id}`} className={`card hover-lift transition-smooth ${isRepost ? '' : ''}`}>
        <div className="p-6">
          {/* Repost indicator */}
          {post.repostedFrom && (
            <div className="flex items-center gap-2 mb-4 text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-text-soft)]">
              <Repeat2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span><span className="text-[var(--color-navy)]">{post.author.name}</span> reposted</span>
              <span className="flex-1 h-px bg-[var(--color-border-hairline)]" />
            </div>
          )}

          {/* Post Header */}
          <div className="flex gap-3.5 mb-4">
            <UserAvatar
              userId={post.repostedFrom ? post.repostedFrom.author._id : post.author._id}
              name={post.repostedFrom ? post.repostedFrom.author.name : post.author.name}
              avatarUrl={post.repostedFrom ? post.repostedFrom.author.avatarUrl : post.author.avatarUrl}
              size={44}
              linkToProfile
              className="ring-1 ring-[var(--color-border-hairline)]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/u/${post.repostedFrom ? post.repostedFrom.author._id : post.author._id}`}
                  className="font-semibold text-[0.9375rem] tracking-tight text-[var(--color-navy)] hover:text-[var(--color-blue-primary)] transition-smooth"
                >
                  {post.repostedFrom ? post.repostedFrom.author.name : post.author.name}
                </Link>
                {roleBadge(post.repostedFrom ? post.repostedFrom.author.role : post.author.role)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-[var(--color-text-soft)] font-medium">
                  @{(post.repostedFrom ? post.repostedFrom.author.name : post.author.name).toLowerCase().replace(/\s+/g, '')}
                </span>
                <span className="w-[3px] h-[3px] rounded-full bg-[var(--color-border-strong)]" />
                <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)]">
                  {getTimeAgo(post.repostedFrom ? post.repostedFrom.createdAt : post.createdAt)}
                </span>
              </div>
            </div>
            {/* Message button (for other users' posts) */}
            {(post.repostedFrom ? post.repostedFrom.author._id : post.author._id) !== currentUserId && (
              <button
                onClick={() => handleMessageUser(post.repostedFrom ? post.repostedFrom.author.id : post.author.id)}
                className="icon-btn"
                data-tip="Message"
                aria-label="Message author"
              >
                <SendHorizonal className="w-[17px] h-[17px]" strokeWidth={1.75} />
              </button>
            )}
            {/* Post menu (delete for own posts) */}
            {post.author._id === currentUserId && !post.repostedFrom && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(menuOpen === post._id ? null : post._id)}
                  className="icon-btn"
                  aria-label="Post options"
                >
                  <MoreHorizontal className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </button>
                {menuOpen === post._id && (
                  <div className="nb-menu absolute right-0 mt-2 z-20 !min-w-[160px] py-1">
                    <button
                      onClick={() => handleDeletePost(post._id)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.8125rem] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} /> Delete post
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Repost quote content */}
          {post.repostedFrom && post.content && (
            <div className="mb-4">
              <p className="serif-accent text-[0.9375rem] text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed border-l-2 border-[var(--color-border-mid)] pl-4">
                {renderPostContent(post.content)}
              </p>
            </div>
          )}

          {/* Original Post Content */}
          <div className="mb-4">
            <p className="text-[0.9375rem] text-[var(--color-text-primary)] whitespace-pre-wrap leading-[1.7] tracking-[-0.003em]">
              {renderPostContent(post.repostedFrom ? post.repostedFrom.content : post.content)}
            </p>
          </div>

          {/* Post Image */}
          {(post.repostedFrom?.imageUrl || post.imageUrl) && (
            <div className="mb-4 rounded-xl overflow-hidden border border-[var(--color-border-hairline)] bg-[var(--color-surface-elevated)] flex items-center justify-center max-h-[480px] shadow-hairline">
              <img
                src={resolveImageUrl(post.repostedFrom?.imageUrl || post.imageUrl)}
                alt="Post image"
                className="max-w-full max-h-[480px] object-contain"
              />
            </div>
          )}

          {/* Link preview */}
          {(post.repostedFrom?.linkUrl || post.linkUrl) && (
            <a
              href={post.repostedFrom?.linkUrl || post.linkUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="card-item flex items-center gap-3 mb-4 px-4 py-3 hover:border-[var(--color-border-mid)] hover:bg-[var(--color-accent-soft)]/40 transition-smooth group"
            >
              <span className="w-8 h-8 rounded-lg bg-[var(--color-accent-soft)] border border-[rgba(11,59,145,0.1)] flex items-center justify-center shrink-0">
                <LinkIcon className="w-3.5 h-3.5 text-[var(--color-blue-primary)]" strokeWidth={2} />
              </span>
              <span className="text-[0.8125rem] font-medium text-[var(--color-blue-primary)] truncate group-hover:text-[var(--color-navy)] transition-colors">
                {post.repostedFrom?.linkUrl || post.linkUrl}
              </span>
            </a>
          )}

          {/* Tags */}
          {((post.repostedFrom?.tags || post.tags) ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(post.repostedFrom?.tags || post.tags || []).map(tag => (
                <button key={tag} onClick={() => setFilterTag(tag)} className="chip">
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Post Actions */}
          <div className="flex items-center gap-1 pt-3.5 border-t border-[var(--color-border-hairline)]">
            {/* Like */}
            <button
              onClick={() => handleLike(post._id)}
              data-tip={isLiked ? 'Unlike' : 'Like'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.8125rem] font-semibold tabular-nums transition-smooth ${
                isLiked
                  ? 'text-rose-600 bg-rose-50'
                  : 'text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Heart className={`w-[17px] h-[17px] ${isLiked ? 'fill-current heart-pop' : ''}`} strokeWidth={1.75} />
              <span>{post.likes?.length || 0}</span>
            </button>

            {/* Comment */}
            <button
              onClick={() => toggleComments(post._id)}
              data-tip="Comment"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.8125rem] font-semibold tabular-nums transition-smooth ${
                commentsOpen
                  ? 'text-[var(--color-blue-primary)] bg-[var(--color-accent-soft)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-blue-primary)] hover:bg-[var(--color-accent-soft)]'
              }`}
            >
              <MessageCircle className="w-[17px] h-[17px]" strokeWidth={1.75} />
              <span>{post.commentsCount || 0}</span>
            </button>

            {/* Repost */}
            <button
              onClick={() => setRepostModal(post.repostedFrom ? post.repostedFrom._id : post._id)}
              data-tip="Repost"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.8125rem] font-semibold tabular-nums text-[var(--color-text-muted)] hover:text-[var(--color-blue-primary)] hover:bg-[var(--color-accent-soft)] transition-smooth"
            >
              <Repeat2 className="w-[17px] h-[17px]" strokeWidth={1.75} />
              <span>{post.repostsCount || 0}</span>
            </button>

            {/* Bookmark */}
            <button
              onClick={() => handleBookmark(post._id)}
              data-tip={isBookmarked ? 'Unsave' : 'Save'}
              className={`ml-auto flex items-center px-3 py-1.5 rounded-full transition-smooth ${
                isBookmarked
                  ? 'text-[var(--color-blue-primary)] bg-[var(--color-accent-soft)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-blue-primary)] hover:bg-[var(--color-accent-soft)]'
              }`}
            >
              <Bookmark className={`w-[17px] h-[17px] ${isBookmarked ? 'fill-current' : ''}`} strokeWidth={1.75} />
            </button>

            {/* Share */}
            <button
              onClick={() => handleShare(post._id)}
              data-tip="Copy link"
              className="flex items-center px-3 py-1.5 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-navy)] hover:bg-[var(--color-accent-soft)] transition-smooth"
            >
              <Share2 className="w-[17px] h-[17px]" strokeWidth={1.75} />
            </button>
          </div>

          {/* Comments Section */}
          {commentsOpen && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border-hairline)]">
              {/* Existing comments */}
              <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto pr-1">
                {(post.comments || []).length === 0 ? (
                  <p className="text-[0.8125rem] text-[var(--color-text-soft)] text-center py-3 serif-accent">
                    No comments yet — be the first.
                  </p>
                ) : (
                  post.comments.map(comment => (
                    <div key={comment._id} className="flex gap-2.5 group">
                      <UserAvatar userId={comment.author._id} name={comment.author.name} avatarUrl={comment.author.avatarUrl} size={30} linkToProfile className="mt-0.5" />
                      <div className="flex-1 card-item px-3.5 py-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Link href={`/u/${comment.author._id}`} className="font-semibold text-[0.8125rem] text-[var(--color-navy)] tracking-tight hover:text-[var(--color-blue-primary)] transition-smooth">{comment.author.name}</Link>
                            <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-soft)]">{getTimeAgo(comment.createdAt)}</span>
                          </div>
                          {comment.author._id === currentUserId && (
                            <button
                              onClick={() => handleDeleteComment(post._id, comment._id)}
                              className="opacity-0 group-hover:opacity-100 icon-btn icon-btn-sm icon-btn-danger !w-6 !h-6"
                              aria-label="Delete comment"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>
                          )}
                        </div>
                        <p className="text-[0.8125rem] text-[var(--color-text-primary)] mt-1 leading-relaxed">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {/* Comment input */}
              <div className="flex gap-2.5 items-center">
                <UserAvatar userId={currentUserId} name={currentUserName} avatarUrl={currentUserAvatar} size={30} />
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={commentTexts[post._id] || ''}
                    onChange={e => setCommentTexts(prev => ({ ...prev, [post._id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddComment(post._id); }}
                    placeholder="Add to the discussion…"
                    className="input flex-1 !rounded-full !py-2 !px-4 text-sm"
                  />
                  <button
                    onClick={() => handleAddComment(post._id)}
                    disabled={!commentTexts[post._id]?.trim()}
                    className="btn-primary !rounded-full !p-0 w-9 h-9 shrink-0 inline-flex items-center justify-center disabled:opacity-40"
                    aria-label="Send comment"
                  >
                    <Send className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="page-container">
        {/* Editorial masthead */}
        <header className="relative mb-10 pb-10 border-b border-[var(--color-border-rule)] animate-section">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="flex-1 max-w-3xl">
              <div className="flex items-center gap-4 mb-5">
                <p className="label !mb-0">The Common Room</p>
                <span className="hidden md:inline text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-soft)] font-semibold">
                  {posts.length} posts · live
                </span>
              </div>
              <h1 className="heading-hero mb-4">
                Where colleagues <span className="serif-accent">speak</span>.
              </h1>
              <p className="body-lg max-w-xl text-[var(--color-text-secondary)]">
                Share cases, ideas, papers, and small wins — a feed by clinicians, for clinicians.
              </p>
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Sidebar */}
          <ResizableSidebar side="left" defaultWidth={280} minWidth={200} maxWidth={400} responsive>
            <aside className="w-full">
              <div className="card p-7 lg:sticky lg:top-24">
                <div className="text-center mb-6 pb-6 border-b border-[var(--color-border-hairline)]">
                  <div className="mx-auto mb-4 w-fit hover-scale transition-transform">
                    <UserAvatar userId={currentUserId} name={currentUserName} avatarUrl={currentUserAvatar} size={84} />
                  </div>
                  <h2
                    className="text-[var(--color-navy)] mb-1"
                    style={{
                      fontFamily: 'var(--font-fraunces), serif',
                      fontSize: '1.125rem',
                      fontWeight: 500,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {currentUserName}
                  </h2>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-soft)] font-semibold mb-3">
                    {currentUserHandle}
                  </p>
                  <span className="badge">{user?.role || 'Doctor'}</span>
                </div>
                <div className="flex items-baseline justify-between mb-7 px-1">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)] font-semibold">Posts</span>
                  <span
                    className="text-[var(--color-navy)] tabular-nums"
                    style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.5rem', fontWeight: 500 }}
                  >
                    {posts.filter(p => p.author._id === currentUserId).length}
                  </span>
                </div>
                <div className="space-y-0.5 -mx-2">
                  <p className="label !mb-2 px-2">Quick Access</p>
                  {[
                    { href: '/home', icon: Newspaper, label: 'News Feed' },
                    { href: '/events', icon: Calendar, label: 'Events' },
                    { href: '/groups', icon: Users, label: 'Groups' },
                    { href: '/notebook', icon: BookOpen, label: 'Notebook' },
                  ].map(({ href, icon: Icon, label }) => (
                    <a
                      key={href}
                      href={href}
                      className="flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-[var(--color-accent-soft)] transition-smooth text-sm text-[var(--color-text-body)] hover:text-[var(--color-navy)] group"
                    >
                      <Icon className="w-4 h-4 text-[var(--color-text-soft)] group-hover:text-[var(--color-navy)] transition" strokeWidth={1.5} />
                      <span className="font-medium">{label}</span>
                    </a>
                  ))}
                </div>
              </div>
            </aside>
          </ResizableSidebar>

          {/* Center - Main Feed */}
          <main className="flex-1 min-w-0">
            {/* Post Composer */}
            <div className="card p-6 mb-6 fade-in-up">
              <div className="flex gap-4">
                <UserAvatar userId={currentUserId} name={currentUserName} avatarUrl={currentUserAvatar} size={44} className="ring-1 ring-[var(--color-border-hairline)]" />
                <div className="flex-1 min-w-0">
                  <textarea
                    value={newPostContent}
                    onChange={e => setNewPostContent(e.target.value)}
                    placeholder="Share a case, a paper, a question — or a small win…"
                    className="w-full resize-none bg-transparent border-none outline-none text-[0.9375rem] text-[var(--color-text-primary)] leading-relaxed placeholder:text-[var(--color-text-soft)] pt-2"
                    rows={3}
                  />

                  {/* Image Preview */}
                  {newPostImagePreview && (
                    <div className="relative mt-3 inline-block">
                      <img src={newPostImagePreview} alt="Preview" className="max-h-48 rounded-xl border border-[var(--color-border-hairline)] shadow-hairline" />
                      <button
                        onClick={clearImage}
                        className="absolute top-2 right-2 bg-[rgba(0,11,51,0.66)] backdrop-blur-sm text-white rounded-full p-1.5 hover:bg-[rgba(0,11,51,0.85)] transition-colors"
                        aria-label="Remove image"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  )}

                  {/* Link Input */}
                  {showLinkInput && (
                    <div className="mt-3 flex gap-2 fade-in">
                      <input
                        type="url"
                        value={newPostLink}
                        onChange={e => setNewPostLink(e.target.value)}
                        placeholder="Paste a link (https://…)"
                        className="input flex-1 !py-2.5 text-sm"
                      />
                      <button
                        onClick={() => { setShowLinkInput(false); setNewPostLink(''); }}
                        className="icon-btn icon-btn-danger"
                        aria-label="Remove link"
                      >
                        <X className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-[var(--color-border-hairline)]">
                    <div className="flex gap-0.5">
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        className="icon-btn"
                        data-tip="Add image"
                        aria-label="Add image"
                      >
                        <ImageIcon className="w-[19px] h-[19px]" strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => setShowLinkInput(!showLinkInput)}
                        className="icon-btn"
                        data-active={showLinkInput}
                        data-tip="Add link"
                        aria-label="Add link"
                      >
                        <LinkIcon className="w-[19px] h-[19px]" strokeWidth={1.75} />
                      </button>
                      <div className="relative" ref={emojiRef}>
                        <button
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="icon-btn"
                          data-active={showEmojiPicker}
                          data-tip="Add emoji"
                          aria-label="Add emoji"
                        >
                          <Smile className="w-[19px] h-[19px]" strokeWidth={1.75} />
                        </button>
                        {showEmojiPicker && (
                          <div className="nb-menu absolute bottom-full left-0 mb-2 p-3 z-30 w-[300px]">
                            <p className="label !mb-2.5">Add emoji</p>
                            <div className="grid grid-cols-8 gap-0.5">
                              {EMOJI_LIST.map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => {
                                    setNewPostContent(prev => prev + emoji);
                                    setShowEmojiPicker(false);
                                  }}
                                  className="text-lg hover:bg-[var(--color-accent-soft)] rounded-md p-1 transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={handleCreatePost}
                      disabled={(!newPostContent.trim() && !newPostImage) || isPosting}
                      className="btn-primary inline-flex items-center gap-2 !px-6"
                    >
                      {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" strokeWidth={2} />}
                      {isPosting ? 'Publishing…' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Filter */}
            {filterTag && (
              <div className="mb-4 flex items-center gap-3 fade-in">
                <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-text-muted)]">Filtering by</span>
                <span className="chip !cursor-default">
                  #{filterTag}
                  <button
                    onClick={() => setFilterTag(null)}
                    className="ml-0.5 hover:text-[var(--color-navy)] transition-colors"
                    aria-label="Clear filter"
                  >
                    <X className="w-3 h-3" strokeWidth={2.25} />
                  </button>
                </span>
                <span className="flex-1 h-px bg-[var(--color-border-rule)]" />
              </div>
            )}

            {/* Posts Timeline */}
            <div className="space-y-4">
              {isLoadingPosts ? (
                <>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="card p-6" style={{ opacity: 1 - i * 0.25 }}>
                      <div className="flex gap-3.5 mb-5">
                        <div className="skeleton skeleton-circle w-11 h-11" />
                        <div className="flex-1 pt-1">
                          <div className="skeleton h-3.5 w-40 mb-2.5" />
                          <div className="skeleton h-2.5 w-24" />
                        </div>
                      </div>
                      <div className="space-y-2.5 mb-5">
                        <div className="skeleton h-3 w-full" />
                        <div className="skeleton h-3 w-[92%]" />
                        <div className="skeleton h-3 w-[60%]" />
                      </div>
                      <div className="flex gap-2 pt-4 border-t border-[var(--color-border-hairline)]">
                        <div className="skeleton h-7 w-16 !rounded-full" />
                        <div className="skeleton h-7 w-16 !rounded-full" />
                        <div className="skeleton h-7 w-16 !rounded-full" />
                      </div>
                    </div>
                  ))}
                </>
              ) : filteredPosts.length === 0 ? (
                <div className="card p-14 text-center relative overflow-hidden">
                  <div aria-hidden className="absolute inset-0 dot-grid opacity-40" />
                  <div className="relative">
                    <div className="empty-plate">
                      <Newspaper className="w-7 h-7" strokeWidth={1.25} />
                    </div>
                    <p className="label justify-center !mb-2">The floor is open</p>
                    <h3 className="heading-3 mb-2">Nothing here <span className="serif-accent">yet</span></h3>
                    <p className="body-md max-w-sm mx-auto">
                      {filterTag ? 'No posts match this tag — try clearing the filter.' : 'Share something with the community to kick things off.'}
                    </p>
                  </div>
                </div>
              ) : (
                filteredPosts.map(post => renderPostCard(post))
              )}
            </div>
          </main>

          {/* Right Sidebar */}
          <ResizableSidebar side="right" defaultWidth={280} minWidth={200} maxWidth={400} responsive>
            <aside className="w-full">
              <div className="lg:sticky lg:top-20 space-y-6">
                {/* Trending Topics */}
                <div className="card p-7">
                  <div className="flex items-baseline justify-between mb-5">
                    <div>
                      <p className="label !mb-1">In Circulation</p>
                      <h2 className="heading-3">Trending</h2>
                    </div>
                    <TrendingUp className="w-4 h-4 text-[var(--color-text-soft)]" strokeWidth={1.5} />
                  </div>
                  {trendingTopics.length === 0 ? (
                    <p className="text-[0.8125rem] text-[var(--color-text-soft)] text-center py-4 serif-accent">
                      Quiet for now — start a #hashtag.
                    </p>
                  ) : (
                    <ol className="-mx-2">
                      {trendingTopics.map((topic, index) => (
                        <li key={topic.tag}>
                          <button
                            onClick={() => setFilterTag(topic.tag)}
                            className="text-left w-full px-2 py-2.5 rounded-md transition-smooth hover:bg-[var(--color-accent-soft)] flex items-baseline gap-3 border-b border-[var(--color-border-hairline)] last:border-b-0 group"
                          >
                            <span
                              className="text-[var(--color-text-soft)] font-semibold tabular-nums shrink-0"
                              style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '0.9375rem', fontStyle: 'italic' }}
                            >
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm text-[var(--color-text-body)] group-hover:text-[var(--color-navy)] font-semibold tracking-tight truncate">
                                #{topic.tag}
                              </span>
                              <span className="block text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)] mt-0.5">
                                {topic.posts}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Saved Posts */}
                <div className="card p-7">
                  <div className="flex items-baseline justify-between mb-5">
                    <div>
                      <p className="label !mb-1">Your Shelf</p>
                      <h2 className="heading-3">Saved</h2>
                    </div>
                    <Bookmark className="w-4 h-4 text-[var(--color-text-soft)]" strokeWidth={1.5} />
                  </div>
                  {(() => {
                    const saved = posts.filter(p => p.bookmarkedBy?.includes(currentUserId));
                    if (saved.length === 0) {
                      return (
                        <p className="text-[0.8125rem] text-[var(--color-text-soft)] text-center py-4 serif-accent">
                          Bookmark posts to keep them here.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-1 -mx-2">
                        {saved.slice(0, 5).map(p => (
                          <button
                            key={p._id}
                            onClick={() => {
                              document.getElementById(`post-${p._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            className="w-full text-left hover:bg-[var(--color-accent-soft)] px-2 py-2.5 rounded-md transition-smooth group"
                          >
                            <div className="flex items-start gap-2.5">
                              <UserAvatar userId={p.author._id} name={p.author.name} avatarUrl={p.author.avatarUrl} size={28} className="mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-[var(--color-navy)] tracking-tight truncate">{p.author.name}</div>
                                <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-0.5 leading-relaxed">{p.content || '(Repost)'}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                        {saved.length > 5 && (
                          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)] text-center pt-2">
                            +{saved.length - 5} more saved
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Quick Tips */}
                <div className="card p-7">
                  <p className="label !mb-1">House Notes</p>
                  <h3 className="heading-3 mb-4">Make it count</h3>
                  <ul className="space-y-0">
                    {[
                      'Upload images of research, cases, or achievements',
                      'Share medical articles with the link button',
                      'Use hashtags to join conversations',
                      'Repost interesting work to your colleagues',
                    ].map((tip, i) => (
                      <li
                        key={i}
                        className="flex gap-3 py-2.5 text-[0.8125rem] leading-relaxed text-[var(--color-text-body)] border-b border-[var(--color-border-hairline)] last:border-b-0"
                      >
                        <span
                          className="text-[var(--color-text-soft)] shrink-0"
                          style={{ fontFamily: 'var(--font-fraunces), serif', fontStyle: 'italic', fontSize: '0.8125rem' }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>
          </ResizableSidebar>
        </div>
      </div>

      {/* Repost Modal */}
      {repostModal && (
        <div className="modal-overlay" onClick={() => { setRepostModal(null); setRepostContent(''); }}>
          <div className="modal-card max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-head !border-b-0 !pb-0">
              <div>
                <p className="label !mb-1.5">Amplify</p>
                <h3 className="modal-title">Repost to your feed</h3>
              </div>
              <button
                onClick={() => { setRepostModal(null); setRepostContent(''); }}
                className="icon-btn icon-btn-sm -mt-1 -mr-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <div className="modal-body">
              <textarea
                value={repostContent}
                onChange={e => setRepostContent(e.target.value)}
                placeholder="Add your thoughts (optional)…"
                className="input w-full resize-none"
                rows={3}
                autoFocus
              />
            </div>
            <div className="modal-foot">
              <button
                onClick={() => { setRepostModal(null); setRepostContent(''); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRepost(repostModal)}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Repeat2 className="w-4 h-4" strokeWidth={1.75} />
                Repost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast" data-type={toast.type} role="status">
          <span className="toast-dot" />
          {toast.message}
        </div>
      )}
    </div>
  );
}
