'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  Bot, BookOpen, FileText, BarChart3, Lightbulb, MessageCircle, Save, Target,
  Send, Trash2, X, Upload, Loader2, Image, Table, File, Presentation,
  CheckCircle2, AlertCircle, Sparkles, Paperclip, ArrowRight, ArrowLeft, Library
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import FolderChoice from '@/components/FolderChoice';
import ResizableSidebar from '@/components/ResizableSidebar';
import MarkdownMessage from '@/components/MarkdownMessage';
import { markdownToBlocks } from '@/lib/markdownToBlocks';
import {
  getDocumentsAPI,
  uploadDocumentAPI,
  deleteDocumentAPI,
  aiChatAPI,
  aiSummarizeAPI,
  getAiMessagesAPI,
  saveAiMessageAPI,
  clearAiMessagesAPI,
  getSubjectsAPI,
} from '@/lib/api';

// Type definitions
type Sender = 'user' | 'assistant';

interface AssistantMessage {
  id: string;
  sender: Sender;
  text: string;
  createdAt: string;
  relatedDocumentId?: string;
}

interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  summary?: string;
  size?: string;
}

// File type detection
const getFileType = (fileName: string, mimeType: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['csv'].includes(ext)) return 'csv';
  if (['xls', 'xlsx'].includes(ext)) return 'excel';
  return 'other';
};

// File icon component (now returns icon + bg color combo)
const getFileIconConfig = (type: string) => {
  switch (type) {
    case 'pdf': return { Icon: FileText, color: 'text-red-600', bg: 'bg-red-50' };
    case 'ppt': return { Icon: Presentation, color: 'text-orange-600', bg: 'bg-orange-50' };
    case 'image': return { Icon: Image, color: 'text-[var(--color-blue-primary)]', bg: 'bg-[var(--color-accent-soft)]' };
    case 'csv':
    case 'excel': return { Icon: Table, color: 'text-emerald-600', bg: 'bg-emerald-50' };
    case 'doc': return { Icon: FileText, color: 'text-[var(--color-blue-primary)]', bg: 'bg-[var(--color-accent-soft)]' };
    default: return { Icon: File, color: 'text-slate-500', bg: 'bg-slate-100' };
  }
};

const FileIconBadge = ({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' | 'lg' }) => {
  const { Icon, color, bg } = getFileIconConfig(type);
  const sizes = {
    sm: { wrap: 'w-8 h-8 rounded-lg', icon: 'w-4 h-4' },
    md: { wrap: 'w-10 h-10 rounded-xl', icon: 'w-5 h-5' },
    lg: { wrap: 'w-12 h-12 rounded-2xl', icon: 'w-6 h-6' },
  }[size];
  return (
    <div className={`${sizes.wrap} ${bg} ${color} flex items-center justify-center flex-shrink-0`}>
      <Icon className={sizes.icon} />
    </div>
  );
};

// Accepted file types
const ACCEPTED_FILE_TYPES = '.pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.csv,.xls,.xlsx';

export default function AssistantPage() {
  const { addNote } = useApp();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const WELCOME_MESSAGE: AssistantMessage = {
    id: 'm1',
    sender: 'assistant',
    text: '👋 Hello! I\'m your **Medzae AI Assistant**.\n\nI can help you with:\n• Answering medical questions\n• Summarizing uploaded documents (PDF, PPT, Images, CSV & more)\n• Explaining complex concepts\n• Providing study tips\n\nUpload a document to get started, or ask me anything!',
    createdAt: new Date().toISOString(),
  };

  const [messages, setMessages] = useState<AssistantMessage[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<UploadedDocument | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [showClearChat, setShowClearChat] = useState(false);
  // Saving a response to the notebook: which message, and the folder it lands in.
  const [saveTarget, setSaveTarget] = useState<AssistantMessage | null>(null);
  const [notebookFolders, setNotebookFolders] = useState<string[]>([]);
  const [saveFolder, setSaveFolder] = useState('AI Assistant');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Mobile-only view switcher: 'chat' shows the conversation, 'library' shows the document library.
  // Desktop ignores this (panels render side-by-side via lg: classes).
  const [mobileView, setMobileView] = useState<'chat' | 'library'>('chat');
  // Tracks the <lg breakpoint so JSX can adapt (shorter placeholder copy, view switching).
  const [isMobile, setIsMobile] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Watch the mobile breakpoint (same cutoff as the lg: layout classes)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023.98px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Auto-grow the composer with its content, capped by max-h-40 (160px)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputText]);

  // Load chat history from database on mount
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const saved = await getAiMessagesAPI();
        if (saved && saved.length > 0) {
          const mapped: AssistantMessage[] = saved.map((m: any) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            createdAt: m.createdAt,
            relatedDocumentId: m.relatedDocumentId || undefined,
          }));
          setMessages([WELCOME_MESSAGE, ...mapped]);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      } finally {
        setIsLoadingMessages(false);
      }
    };
    fetchMessages();
  }, []);

  // Load documents from database on mount
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const docs = await getDocumentsAPI('assistant');
        const mapped: UploadedDocument[] = docs.map((d: any) => ({
          id: d._id,
          name: d.name,
          type: d.type,
          uploadedAt: d.createdAt,
          size: d.size ? `${(d.size / 1024).toFixed(1)} KB` : undefined,
        }));
        setDocuments(mapped);
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setIsLoadingDocs(false);
      }
    };
    fetchDocuments();
  }, []);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    if (file.size > 250 * 1024 * 1024) {
      showToast('File is too large. Maximum size is 250MB.', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      const fileType = getFileType(file.name, file.type);

      const savedDoc = await uploadDocumentAPI({
        name: file.name,
        type: fileType,
        file: file,
        source: 'assistant',
      });

      const newDoc: UploadedDocument = {
        id: savedDoc._id,
        name: savedDoc.name,
        type: savedDoc.type,
        uploadedAt: savedDoc.createdAt,
        size: `${(file.size / 1024).toFixed(1)} KB`,
      };

      setDocuments(prev => [...prev, newDoc]);
      setSelectedDocument(newDoc);

      const uploadMsg: AssistantMessage = {
        id: `m${Date.now()}`,
        sender: 'assistant',
        text: `⏳ **"${file.name}" uploaded successfully!** Generating summary...`,
        createdAt: new Date().toISOString(),
        relatedDocumentId: newDoc.id,
      };
      setMessages(prev => [...prev, uploadMsg]);

      try {
        const summaryData = await aiSummarizeAPI(savedDoc._id);
        const summaryMsg: AssistantMessage = {
          id: `m${Date.now() + 1}`,
          sender: 'assistant',
          text: `📄 **Summary of "${file.name}"**\n\n${summaryData.summary}`,
          createdAt: new Date().toISOString(),
          relatedDocumentId: newDoc.id,
        };
        setMessages(prev => [
          ...prev.filter(m => m.id !== uploadMsg.id),
          summaryMsg,
        ]);
        newDoc.summary = summaryData.summary;

        // Persist summary message
        saveAiMessageAPI({
          sender: 'assistant',
          text: summaryMsg.text,
          relatedDocumentId: newDoc.id,
        }).catch(console.error);
      } catch (summaryErr) {
        console.error('Summary failed:', summaryErr);
        const errorMsg: AssistantMessage = {
          id: `m${Date.now() + 1}`,
          sender: 'assistant',
          text: `✅ **"${file.name}" uploaded and saved!**\n\nThe document has been stored in your library. You can now ask me questions about it!\n\n💡 Try selecting the document and asking specific questions about its content.`,
          createdAt: new Date().toISOString(),
          relatedDocumentId: newDoc.id,
        };
        setMessages(prev => [
          ...prev.filter(m => m.id !== uploadMsg.id),
          errorMsg,
        ]);

        // Persist fallback message
        saveAiMessageAPI({
          sender: 'assistant',
          text: errorMsg.text,
          relatedDocumentId: newDoc.id,
        }).catch(console.error);
      }

    } catch (err: any) {
      console.error('Upload failed:', err);
      const uploadErrorText = err?.response?.status === 413
        ? `**"${file.name}" is too large to upload.** Please try a smaller file.`
        : `**The upload for "${file.name}" didn't go through.** Please check your connection and try again.`;
      const errorMsg: AssistantMessage = {
        id: `m${Date.now()}`,
        sender: 'assistant',
        text: uploadErrorText,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle send message
  const handleSendMessage = async () => {
    if (!inputText.trim() || isProcessing) return;

    const userText = inputText;
    const userMessage: AssistantMessage = {
      id: `m${Date.now()}`,
      sender: 'user',
      text: userText,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    // Save user message to DB
    saveAiMessageAPI({ sender: 'user', text: userText }).then(saved => {
      if (saved?.id) {
        setMessages(prev => prev.map(m => m.id === userMessage.id ? { ...m, id: saved.id } : m));
      }
    }).catch(console.error);

    try {
      const chatHistory = messages
        .filter(m => m.id !== 'm1')
        .slice(-10)
        .map(m => ({ sender: m.sender, text: m.text }));

      const documentIds = selectedDocument
        ? [selectedDocument.id]
        : documents.map(d => d.id);

      const data = await aiChatAPI({
        message: userText,
        documentIds: documentIds.length > 0 ? documentIds : undefined,
        chatHistory,
      });

      const aiResponse: AssistantMessage = {
        id: `m${Date.now() + 1}`,
        sender: 'assistant',
        text: data.response,
        createdAt: new Date().toISOString(),
        relatedDocumentId: selectedDocument?.id,
      };

      setMessages(prev => [...prev, aiResponse]);

      // Save AI response to DB
      saveAiMessageAPI({
        sender: 'assistant',
        text: data.response,
        relatedDocumentId: selectedDocument?.id,
      }).then(saved => {
        if (saved?.id) {
          setMessages(prev => prev.map(m => m.id === aiResponse.id ? { ...m, id: saved.id } : m));
        }
      }).catch(console.error);
    } catch (err: any) {
      console.error('Chat error:', err);
      // Whatever went wrong, keep the message human — no status codes,
      // provider names, or raw API errors in the chat.
      const status = err?.response?.status;
      let errorText = 'I couldn\'t finish answering that just now. Please try asking again in a moment.';
      if (status === 429) {
        errorText = 'I\'m getting a lot of questions right now. Give me a minute to catch up, then ask again.';
      } else if (err?.code === 'ECONNABORTED') {
        errorText = 'That one took longer than expected, so I stopped waiting. Please try again — shorter questions usually come back faster.';
      } else if (!err?.response) {
        errorText = 'I couldn\'t reach the server — it may just be waking up. Please try again in a few seconds.';
      }
      const errorMsg: AssistantMessage = {
        id: `m${Date.now() + 1}`,
        sender: 'assistant',
        text: errorText,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Find the user question that preceded this assistant message
  const findUserQuestion = (message: AssistantMessage): string => {
    const msgIndex = messages.findIndex(m => m.id === message.id);
    if (msgIndex > 0) {
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (messages[i].sender === 'user') {
          const q = messages[i].text;
          return q.length > 80 ? q.substring(0, 77) + '...' : q;
        }
      }
    }
    return `AI Response - ${new Date().toLocaleDateString()}`;
  };

  // Ask where the response should be filed before saving it.
  const handleSaveToNotebook = async (message: AssistantMessage) => {
    setSaveTarget(message);
    setSaveFolder('AI Assistant');
    setLoadingFolders(true);
    try {
      const folders = await getSubjectsAPI();
      setNotebookFolders(folders || []);
    } catch (err) {
      console.error('Failed to load notebook folders:', err);
      setNotebookFolders([]);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Save to notebook via API, into the folder picked in the dialog.
  const confirmSaveToNotebook = async () => {
    const folder = saveFolder.trim();
    if (!saveTarget || !folder) return;
    setSavingNote(true);
    try {
      await addNote({
        subject: folder,
        title: findUserQuestion(saveTarget),
        blocks: markdownToBlocks(saveTarget.text),
        tags: ['AI Assistant'],
      });
      // A folder that didn't exist does now — keep it for the next save.
      setNotebookFolders(prev => (prev.includes(folder) ? prev : [...prev, folder]));
      setSaveTarget(null);
      showToast(`Saved to “${folder}” in your Notebook!`, 'success');
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Failed to save to notebook.', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  // Delete document from database
  const handleDeleteDocument = async (docId: string) => {
    try {
      await deleteDocumentAPI(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
      if (selectedDocument?.id === docId) {
        setSelectedDocument(null);
      }
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete document.', 'error');
    } finally {
      setDeleteDocId(null);
    }
  };

  // Clear entire chat history
  const handleClearChat = async () => {
    try {
      await clearAiMessagesAPI();
      setMessages([WELCOME_MESSAGE]);
    } catch (err) {
      console.error('Failed to clear chat:', err);
      showToast('Failed to clear chat history.', 'error');
    } finally {
      setShowClearChat(false);
    }
  };

  // Format time
  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Quick prompt suggestions for the welcome state — concrete asks so the
  // first reply is a real answer, not a "which topic?" counter-question.
  const quickPrompts = [
    { icon: BookOpen, text: 'Explain the RAAS and where each drug class acts on it' },
    { icon: FileText, text: 'Summarize my uploaded document' },
    { icon: Lightbulb, text: 'Build me a 7-day study plan for cardiology' },
    { icon: Sparkles, text: 'Quiz me with 5 USMLE-style pharmacology questions' },
  ];

  // Stats
  const questionsAsked = messages.filter(m => m.sender === 'user').length;
  const aiResponses = messages.filter(m => m.sender === 'assistant' && m.id !== 'm1').length;
  const onlyWelcome = messages.length === 1 && messages[0].id === 'm1';

  return (
    <div className="min-h-screen gradient-subtle">
      {/* Custom Toast Notification */}
      {toast && (
        <div className="toast" data-type={toast.type} role="status">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#7ba3e8]" strokeWidth={1.75} />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#fca5a5]" strokeWidth={1.75} />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      )}

      <div className="page-container">
        {/* Editorial masthead — hidden on mobile so chat fills the screen */}
        <header className="relative mb-8 pb-8 border-b border-[var(--color-border-rule)] animate-section hidden lg:block">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="flex-1 max-w-3xl">
              <div className="flex items-center gap-3 mb-3">
                <p className="label !mb-0 inline-flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> The AI</p>
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-emerald-600 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> online
                </span>
              </div>
              <h1 className="heading-hero mb-4">
                A studious <span className="serif-accent">companion</span>.
              </h1>
              <p className="body-lg max-w-xl text-[var(--color-text-secondary)]">
                Upload documents, ask questions, summarize papers — built to think alongside you.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-x-7 gap-y-3 shrink-0">
              {[
                { label: 'Documents', value: documents.length },
                { label: 'Questions', value: questionsAsked },
                { label: 'Replies', value: aiResponses },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--color-text-soft)]">{label}</span>
                  <span
                    className="text-[var(--color-navy)] tabular-nums"
                    style={{
                      fontFamily: 'var(--font-fraunces), serif',
                      fontSize: '1.75rem',
                      fontWeight: 400,
                      lineHeight: 1,
                      letterSpacing: '-0.025em',
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
              {!onlyWelcome && (
                <button
                  onClick={() => setShowClearChat(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-smooth self-end"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Layout */}
        <div className="card workspace-shell rounded-3xl overflow-hidden flex flex-col lg:flex-row h-[calc(100vh-280px)] min-h-[560px]">
          {/* Left Sidebar - Documents */}
          <ResizableSidebar side="left" defaultWidth={340} minWidth={260} maxWidth={480} responsive mobileVisible={mobileView === 'library'}>
            <aside className="w-full h-full bg-white lg:border-r border-[var(--color-border-light)] flex flex-col">
              {/* Mobile back-bar */}
              <div className="lg:hidden flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border-light)] bg-white">
                <button
                  onClick={() => setMobileView('chat')}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth"
                  aria-label="Back to chat"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">Library</span>
              </div>

              {/* Upload Zone */}
              <div className="p-4 border-b border-[var(--color-border-light)] flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="label inline-flex items-center gap-1.5"><BookOpen className="w-3 h-3" /> Library</p>
                  <span className="text-[10px] font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-muted)] px-2 py-0.5 rounded-full">{documents.length} files</span>
                </div>
                <label className={`relative block w-full rounded-2xl border-2 border-dashed transition-smooth cursor-pointer overflow-hidden group ${
                  isProcessing
                    ? 'border-[var(--color-blue-primary)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border-mid)] hover:border-[var(--color-blue-primary)] hover:bg-[var(--color-accent-soft)]/50 bg-[var(--color-surface-muted)]'
                }`}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isProcessing}
                  />
                  <div className="px-4 py-5 text-center">
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-7 h-7 mx-auto mb-2 text-[var(--color-blue-primary)] animate-spin" />
                        <p className="text-sm font-semibold text-[var(--color-blue-primary)]">Processing...</p>
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">This may take a moment</p>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 mx-auto mb-2 rounded-2xl flex items-center justify-center transition-smooth group-hover:scale-105" style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}>
                          <Upload className="w-5 h-5 text-white" />
                        </div>
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">Upload Document</p>
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">PDF · PPT · DOC · Image · CSV · Excel</p>
                      </>
                    )}
                  </div>
                </label>
              </div>

              {/* Documents List */}
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
                {isLoadingDocs ? (
                  <div className="space-y-2 px-1 py-2">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="flex gap-3 p-3" style={{ opacity: 1 - i * 0.25 }}>
                        <div className="skeleton w-10 h-10 !rounded-xl shrink-0" />
                        <div className="flex-1 pt-1">
                          <div className="skeleton h-3 w-3/4 mb-2" />
                          <div className="skeleton h-2.5 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="empty-plate !w-14 !h-14 !mb-3.5">
                      <FileText className="w-6 h-6" strokeWidth={1.25} />
                    </div>
                    <p className="text-sm font-semibold text-[var(--color-navy)] tracking-tight mb-1">No documents yet</p>
                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">Upload a file to start chatting with your library.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {documents.map(doc => {
                      const isActive = selectedDocument?.id === doc.id;
                      return (
                        <div
                          key={doc.id}
                          onClick={() => {
                            setSelectedDocument(isActive ? null : doc);
                            // On mobile, return to the chat view so the user sees the active doc badge.
                            if (isMobile) setMobileView('chat');
                          }}
                          className={`group relative rounded-2xl p-3 cursor-pointer transition-smooth border ${
                            isActive
                              ? 'bg-[var(--color-accent-soft)] border-[var(--color-blue-primary)] shadow-premium'
                              : 'bg-white border-[var(--color-border-light)] hover:border-[var(--color-border-mid)] hover:shadow-premium'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <FileIconBadge type={doc.type} />
                            <div className="flex-1 min-w-0">
                              <h3 className={`font-semibold text-sm truncate ${isActive ? 'text-[var(--color-blue-primary)]' : 'text-[var(--color-text-primary)]'}`}>
                                {doc.name}
                              </h3>
                              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                                {doc.size && `${doc.size} · `}{doc.type?.toUpperCase()} · {formatTime(doc.uploadedAt)}
                              </p>
                              <div className="flex items-center gap-3 mt-2">
                                {isActive && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-blue-primary)] bg-white px-1.5 py-0.5 rounded">
                                    <Target className="w-2.5 h-2.5" /> Active
                                  </span>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteDocId(doc.id); }}
                                  className="text-[11px] font-medium text-red-600 hover:text-red-700 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-smooth ml-auto"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Document Indicator */}
              {selectedDocument && (
                <div className="p-4 border-t border-[var(--color-border-light)] flex-shrink-0 relative overflow-hidden" style={{ background: 'var(--gradient-bg)' }}>
                  <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }} />
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
                        <Target className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="label">Chatting about</p>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <FileIconBadge type={selectedDocument.type} size="sm" />
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{selectedDocument.name}</p>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mb-2">AI responses will use this document as context.</p>
                    <button
                      onClick={() => setSelectedDocument(null)}
                      className="text-xs text-[var(--color-blue-primary)] hover:underline font-semibold inline-flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Deselect
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </ResizableSidebar>

          {/* Center - Chat Interface */}
          <main className={`flex-1 flex-col bg-[var(--color-bg-ivory)] min-w-0 min-h-0 transition-all duration-300 ${mobileView === 'chat' ? 'flex' : 'hidden'} lg:flex`}>
            {/* Mobile-only top bar — gives Library access and visual identity on phones */}
            <div className="lg:hidden flex items-center justify-between gap-2 px-3 py-2.5 bg-white border-b border-[var(--color-border-light)]">
              <button
                onClick={() => setMobileView('library')}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border-light)] text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-blue-primary)] transition-smooth"
                aria-label="Open library"
              >
                <Library className="w-4 h-4" />
                <span className="text-xs font-semibold">Library</span>
                {documents.length > 0 && (
                  <span className="text-[10px] font-bold bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)] px-1.5 py-0.5 rounded-full">{documents.length}</span>
                )}
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">Medzae AI</span>
              </div>
              {!onlyWelcome && (
                <button
                  onClick={() => setShowClearChat(true)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-smooth"
                  aria-label="Clear chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 md:px-8 py-4 md:py-6">
              {isLoadingMessages ? (
                <div className="max-w-3xl mx-auto h-full flex flex-col justify-end pb-4 space-y-4">
                  {[64, 48, 72].map((w, i) => (
                    <div key={i} className={`flex ${i % 2 === 1 ? 'justify-end' : 'justify-start'}`}>
                      <div className="skeleton h-14 !rounded-2xl" style={{ width: `${w}%`, maxWidth: '24rem', opacity: 0.45 + i * 0.2 }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-6">
                  {/* Welcome / Hero block - shown only when only welcome message exists */}
                  {onlyWelcome && (
                    <div className="relative card rounded-3xl p-6 md:p-8 overflow-hidden fade-in-up">
                      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }} />
                      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 w-56 h-56 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-blue-soft) 0%, transparent 70%)' }} />

                      <div className="relative z-10 text-center max-w-md mx-auto">
                        <div className="w-20 h-20 mx-auto mb-5 rounded-3xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}>
                          <Bot className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="heading-2 mb-2">Hi {user?.name?.split(' ')[0] || 'there'}!</h2>
                        <p className="body-md mb-6">I&apos;m your Medzae AI Assistant. Ask me anything — or upload a document for instant analysis.</p>
                      </div>

                      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl mx-auto">
                        {quickPrompts.map((prompt, i) => {
                          const Icon = prompt.icon;
                          return (
                            <button
                              key={i}
                              onClick={() => setInputText(prompt.text)}
                              className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-[var(--color-border-light)] hover:border-[var(--color-blue-primary)] hover:shadow-premium transition-smooth text-left group"
                            >
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-smooth group-hover:scale-105" style={{ background: 'var(--color-accent-soft)' }}>
                                <Icon className="w-4 h-4 text-[var(--color-blue-primary)]" />
                              </div>
                              <span className="text-sm font-medium text-[var(--color-text-primary)] flex-1">{prompt.text}</span>
                              <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-blue-primary)] group-hover:translate-x-0.5 transition-smooth" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  {!onlyWelcome && messages.map(message => {
                    const isUser = message.sender === 'user';
                    return (
                      <div key={message.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {isUser ? (
                            <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-white shadow-sm">
                              <UserAvatar userId={user?._id || 'current-user'} name={user?.name || 'You'} avatarUrl={user?.avatarUrl} size={36} />
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-full flex items-center justify-center relative" style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}>
                              <Bot className="w-5 h-5 text-white" />
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                            </div>
                          )}
                        </div>

                        {/* min-w-0 + max-w caps keep wide content (tables, code) from
                            forcing the bubble past the viewport on phones — the inner
                            overflow-x-auto wrappers scroll instead. */}
                        <div className={`flex flex-col gap-1 min-w-0 max-w-full sm:max-w-[85%] lg:max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
                          {/* Sender + time */}
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="font-semibold text-[var(--color-text-primary)]">
                              {isUser ? 'You' : 'Medzae AI'}
                            </span>
                            <span className="text-[var(--color-text-muted)]">·</span>
                            <span className="text-[var(--color-text-muted)]">{formatTime(message.createdAt)}</span>
                          </div>

                          {/* Message bubble */}
                          <div className={`px-4 py-3 min-w-0 max-w-full ${isUser ? 'user-prompt-bubble shadow-sm' : 'ai-response-card'}`}>
                            {isUser ? (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
                            ) : (
                              <MarkdownMessage text={message.text} />
                            )}
                          </div>

                          {/* Actions for assistant messages (skip the welcome) */}
                          {!isUser && message.id !== 'm1' && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              <button
                                onClick={() => handleSaveToNotebook(message)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-blue-primary)] bg-[var(--color-accent-soft)] hover:bg-[var(--color-accent-hover)] px-2.5 py-1.5 rounded-lg transition-smooth"
                              >
                                <Save className="w-3 h-3" /> Save to Notebook
                              </button>
                              {message.relatedDocumentId && (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] bg-white border border-[var(--color-border-light)] px-2.5 py-1.5 rounded-lg">
                                  <Paperclip className="w-3 h-3" /> From document
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Processing Indicator */}
                  {isProcessing && (
                    <div className="flex gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}>
                          <Bot className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-start">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-semibold text-[var(--color-text-primary)]">Medzae AI</span>
                          <span className="text-[var(--color-text-muted)]">·</span>
                          <span className="text-[var(--color-text-muted)]">thinking</span>
                        </div>
                        <div className="ai-response-card px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex gap-1">
                              <span className="w-2 h-2 bg-[var(--color-blue-primary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-2 h-2 bg-[var(--color-blue-primary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-2 h-2 bg-[var(--color-blue-primary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="border-t border-[var(--color-border-light)] bg-white px-3 sm:px-4 md:px-6 py-3 md:py-4 flex-shrink-0 mobile-safe-bottom">
              <div className="max-w-3xl mx-auto">
                {selectedDocument && (
                  <div className="mb-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-accent-soft)] border border-[var(--color-border-mid)] max-w-full">
                    <FileIconBadge type={selectedDocument.type} size="sm" />
                    <span className="text-xs font-medium text-[var(--color-blue-primary)] truncate min-w-0 sm:max-w-[240px]">
                      Asking about: {selectedDocument.name}
                    </span>
                    <button
                      onClick={() => setSelectedDocument(null)}
                      className="ml-1 flex-shrink-0 text-[var(--color-blue-primary)] hover:text-red-500 transition-smooth"
                      title="Deselect"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="icon-btn !w-10 !h-10 !rounded-full flex-shrink-0 disabled:opacity-50"
                    data-tip="Upload a document"
                    aria-label="Upload a document"
                  >
                    <Paperclip className="w-5 h-5" strokeWidth={1.75} />
                  </button>
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      selectedDocument
                        ? isMobile ? 'Ask about this document…' : `Ask about "${selectedDocument.name}"...`
                        : isMobile ? 'Ask a medical question…' : 'Ask a medical question, request a summary, or paste an idea...'
                    }
                    className="input flex-1 min-w-0 resize-none py-2.5 leading-snug max-h-40"
                    rows={1}
                    disabled={isProcessing}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isProcessing}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 transition-smooth disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
                    style={{ background: 'var(--gradient-ink)', boxShadow: 'var(--shadow-btn), var(--shadow-inset)' }}
                    data-tip="Send"
                    aria-label="Send message"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={1.75} />}
                  </button>
                </div>
                {/* Keyboard hint is desktop-only — soft keyboards make it noise on phones */}
                <p className="hidden sm:block text-[10px] text-[var(--color-text-muted)] mt-1.5 ml-12">
                  Press <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border-light)] text-[9px] font-mono">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-muted)] border border-[var(--color-border-light)] text-[9px] font-mono">Shift+Enter</kbd> for new line
                </p>
              </div>
            </div>
          </main>

          {/* Right Sidebar - Info & Tips (desktop only) */}
          <ResizableSidebar side="right" defaultWidth={320} minWidth={260} maxWidth={480} responsive mobileVisible={false}>
            <aside className="w-full h-full bg-white border-l border-[var(--color-border-light)] overflow-y-auto">
              {/* Hero */}
              <div className="relative px-6 pt-6 pb-5 overflow-hidden border-b border-[var(--color-border-light)]" style={{ background: 'var(--gradient-bg)' }}>
                <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }} />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}>
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="label">Session</p>
                    <h2 className="heading-3">Your Activity</h2>
                  </div>
                </div>
              </div>

              <div className="px-5 py-5 space-y-6">
                {/* Stats */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--color-surface-muted)] border border-[var(--color-border-light)]">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
                      <FileText className="w-5 h-5 text-[var(--color-blue-primary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="label">Documents</p>
                      <p className="text-xs text-[var(--color-text-muted)]">In your library</p>
                    </div>
                    <span className="text-[var(--color-navy)] tabular-nums" style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.5rem', fontWeight: 500 }}>{documents.length}</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--color-surface-muted)] border border-[var(--color-border-light)]">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
                      <MessageCircle className="w-5 h-5 text-[var(--color-blue-primary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="label">Questions</p>
                      <p className="text-xs text-[var(--color-text-muted)]">Asked this session</p>
                    </div>
                    <span className="text-[var(--color-navy)] tabular-nums" style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.5rem', fontWeight: 500 }}>{questionsAsked}</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--color-surface-muted)] border border-[var(--color-border-light)]">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
                      <Bot className="w-5 h-5 text-[var(--color-blue-primary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="label">Responses</p>
                      <p className="text-xs text-[var(--color-text-muted)]">From AI assistant</p>
                    </div>
                    <span className="text-[var(--color-navy)] tabular-nums" style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.5rem', fontWeight: 500 }}>{aiResponses}</span>
                  </div>
                </div>

                {/* Capabilities */}
                <div className="relative rounded-2xl p-4 overflow-hidden" style={{ background: 'var(--gradient-primary)' }}>
                  <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-2xl bg-white" />
                  <div className="relative z-10 text-white">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4" />
                      <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">What I can do</p>
                    </div>
                    <ul className="space-y-1.5 text-xs text-white/90">
                      <li className="flex gap-2"><span className="opacity-60">•</span><span>Answer medical questions</span></li>
                      <li className="flex gap-2"><span className="opacity-60">•</span><span>Summarize uploaded files</span></li>
                      <li className="flex gap-2"><span className="opacity-60">•</span><span>Explain complex concepts</span></li>
                      <li className="flex gap-2"><span className="opacity-60">•</span><span>Suggest study strategies</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </aside>
          </ResizableSidebar>
        </div>
      </div>

      {/* Delete Document Confirmation */}
      <ConfirmModal
        open={!!deleteDocId}
        title="Delete Document?"
        message="This document will be permanently removed. Related summaries will remain in chat."
        confirmLabel="Delete"
        onConfirm={() => deleteDocId && handleDeleteDocument(deleteDocId)}
        onCancel={() => setDeleteDocId(null)}
      />

      {/* Save to Notebook — choose the folder first */}
      {saveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,11,51,0.4)] backdrop-blur-sm p-4 fade-in"
          onClick={() => !savingNote && setSaveTarget(null)}
        >
          <div
            className="bg-[var(--color-surface-white)] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-[var(--color-border-hairline)]"
            style={{ boxShadow: 'var(--shadow-modal)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-7 pt-6 pb-5 border-b border-[var(--color-border-hairline)] flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <p className="label !mb-2">Save to notebook</p>
                <h3
                  className="text-[var(--color-navy)] truncate"
                  style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.375rem', fontWeight: 500, letterSpacing: '-0.025em' }}
                >
                  {findUserQuestion(saveTarget)}
                </h3>
                <p className="text-[0.8125rem] text-[var(--color-text-muted)] mt-1.5">
                  The response is saved as a page, formatted as blocks.
                </p>
              </div>
              <button
                onClick={() => setSaveTarget(null)}
                disabled={savingNote}
                className="text-[var(--color-text-soft)] hover:text-[var(--color-navy)] hover:bg-[var(--color-surface-elevated)] p-2 rounded-md transition shrink-0 disabled:opacity-50"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            <div className="px-7 py-5 overflow-y-auto">
              {loadingFolders ? (
                <div className="flex flex-wrap gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="skeleton h-7 w-24 rounded-full" style={{ opacity: 1 - i * 0.25 }} />
                  ))}
                </div>
              ) : (
                <FolderChoice
                  folders={notebookFolders}
                  value={saveFolder}
                  onChange={setSaveFolder}
                  hint={
                    saveFolder.trim() && !notebookFolders.includes(saveFolder.trim())
                      ? `“${saveFolder.trim()}” will be created in your notebook.`
                      : undefined
                  }
                />
              )}
            </div>

            <div className="px-7 py-4 border-t border-[var(--color-border-hairline)] flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={() => setSaveTarget(null)}
                disabled={savingNote}
                className="px-4 py-2 rounded-md text-[0.8125rem] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-navy)] hover:bg-[var(--color-surface-elevated)] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveToNotebook}
                disabled={savingNote || !saveFolder.trim()}
                className="px-4 py-2 rounded-md text-[0.8125rem] font-semibold flex items-center gap-2 gradient-ink text-white hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ boxShadow: 'var(--shadow-btn), var(--shadow-inset)' }}
              >
                {savingNote
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> Saving…</>
                  : <><Save className="w-3.5 h-3.5" strokeWidth={2} /> Save page</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Chat Confirmation */}
      <ConfirmModal
        open={showClearChat}
        title="Clear Chat History?"
        message="This will permanently delete all chat messages. This action cannot be undone."
        confirmLabel="Clear All"
        variant="warning"
        onConfirm={handleClearChat}
        onCancel={() => setShowClearChat(false)}
      />
    </div>
  );
}
