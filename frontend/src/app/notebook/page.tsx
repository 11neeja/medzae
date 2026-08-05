'use client';

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import {
  FolderOpen, Folder, FileText, Search, Trash2, CheckSquare, BookOpen,
  Upload, Eye, X, Inbox, PenLine, Bot, Tag, Heading, Type, List, Minus,
  Paperclip, Presentation, FileEdit, Calendar, Loader2, Plus, FolderPlus,
  Image, Table, File, Pencil, ChevronUp, ChevronDown, Download,
  ArrowLeft, Wrench, Share2, Users, Lock
} from 'lucide-react';
import { getNotesAPI, createNoteAPI, updateNoteAPI, deleteNoteAPI, getTasksAPI, createTaskAPI, toggleTaskAPI, deleteTaskAPI, getSubjectsAPI, createSubjectAPI, renameSubjectAPI, deleteSubjectAPI, getDocumentsAPI, uploadDocumentAPI, downloadDocumentAPI, deleteDocumentAPI, getAiMessagesAPI, reorderNotesAPI, getSharedFoldersAPI, shareSubjectAPI, getSubjectSharesAPI, revokeSubjectShareAPI, searchUsersAPI, type SharedFolder, type FolderPermission, type FolderShareEntry } from '@/lib/api';
import ResizableSidebar from '@/components/ResizableSidebar';
import ConfirmModal from '@/components/ConfirmModal';
import { markdownToBlocks } from '@/lib/markdownToBlocks';

// Type definitions
type BlockType = 'heading' | 'text' | 'checklist' | 'bullet' | 'divider';

interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
}

interface NotePage {
  id: string;
  title: string;
  subject: string;
  blocks: Block[];
  position: number;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  /** Folder this task is filed under; null for legacy tasks created before folders. */
  subject: string | null;
}

interface UploadedFile {
  id: string;
  name: string;
  type: 'pdf' | 'ppt' | 'doc' | 'image' | 'csv' | 'excel' | 'other';
  uploadedAt: string;
  subject: string | null;
  url?: string;
  mimeType?: string;
}

// Mock data - Initial pages organized by subject
const initialPages: NotePage[] = [];

// Muted, on-brand accent colors assigned deterministically per subject name.
const SUBJECT_ACCENTS = [
  { dot: '#0B3B91', soft: '#E6F0FF' }, // blue
  { dot: '#047857', soft: '#E7F6F0' }, // emerald
  { dot: '#B45309', soft: '#FBF0DD' }, // amber
  { dot: '#6D28D9', soft: '#F1E9FB' }, // violet
  { dot: '#BE123C', soft: '#FBE6EA' }, // rose
  { dot: '#0F766E', soft: '#E2F4F2' }, // teal
];

const accentForSubject = (subject: string) => {
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = (hash * 31 + subject.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_ACCENTS[hash % SUBJECT_ACCENTS.length];
};

// CSV Preview component
function CsvPreview({ url }: { url: string }) {
  const [rows, setRows] = useState<string[][]>([]);

  useEffect(() => {
    fetch(url)
      .then(res => res.text())
      .then(text => {
        const parsed = text.split('\n').map(line =>
          line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
        );
        setRows(parsed.filter(r => r.some(c => c.length > 0)));
      })
      .catch(console.error);
  }, [url]);

  if (rows.length === 0) {
    return (
      <div className="h-full p-6 space-y-3">
        <div className="skeleton h-8 w-full" />
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton h-6 w-full" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full p-4">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            {rows[0]?.map((cell, i) => (
              <th key={i} className="border border-[var(--color-border-light)] bg-[var(--color-blue-soft)] px-3 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              {row.map((cell, ci) => (
                <td key={ci} className="border border-[var(--color-border-light)] px-3 py-2 text-[var(--color-text-primary)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// useLayoutEffect warns during SSR; the editor only ever measures in the browser.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Editor field that grows to fit its content instead of hiding the overflow
 * behind an inner scrollbar. Re-measures when the pane is resized, so text
 * stays fully visible at any sidebar width or screen size.
 */
function AutoGrowTextarea({
  value,
  onChange,
  className = '',
  placeholder,
  singleLine = false,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  /** Titles, headings and list items wrap but never take a hard line break. */
  singleLine?: boolean;
  /** View-only shared folders render their text without letting you edit it. */
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fitToContent = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useIsomorphicLayoutEffect(fitToContent, [value, fitToContent]);

  // The sidebars are resizable and the pane is hidden on mobile until the
  // editor view opens — both change the wrap point without touching the value.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width === lastWidth) return;
      lastWidth = width;
      fitToContent();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitToContent]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(e) => { if (!readOnly) onChange(e.target.value); }}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={`nb-textarea ${className}`}
    />
  );
}

export default function NotebookPage() {
  const [pages, setPages] = useState<NotePage[]>([]);
  const [selectedPage, setSelectedPage] = useState<NotePage | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [showNewSubjectInput, setShowNewSubjectInput] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [renamingSubject, setRenamingSubject] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [previewDocument, setPreviewDocument] = useState<UploadedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteSubjectTarget, setDeleteSubjectTarget] = useState<string | null>(null);
  const [deletePageTarget, setDeletePageTarget] = useState<NotePage | null>(null);
  const [showAiPicker, setShowAiPicker] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ id: string; sender: string; text: string; createdAt: string; question: string }[]>([]);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  // Mobile-only view switcher: 'list' = subjects/pages, 'editor' = page editor, 'tools' = tasks/documents.
  // Desktop ignores this (panels render side-by-side via lg: classes).
  const [mobileView, setMobileView] = useState<'list' | 'editor' | 'tools'>('list');
  // Tasks & documents belong to a folder. 'folder' shows only the open folder's
  // items; 'all' shows every one, including legacy items with no folder.
  const [toolScope, setToolScope] = useState<'folder' | 'all'>('folder');

  // ─── Folder sharing ──────────────────────────────────────────────
  // Folders other people shared with me, and the one currently open (null while
  // I'm browsing my own folders). Shared content lives in its own arrays so it
  // never collides by name with a folder of mine.
  const [sharedFolders, setSharedFolders] = useState<SharedFolder[]>([]);
  const [activeShare, setActiveShare] = useState<SharedFolder | null>(null);
  const [sharedPages, setSharedPages] = useState<NotePage[]>([]);
  const [sharedTasks, setSharedTasks] = useState<Task[]>([]);
  const [sharedFiles, setSharedFiles] = useState<UploadedFile[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);
  // Whether the open folder may be written to (my own folders always; shared ones
  // only with edit permission).
  const canEdit = !activeShare || activeShare.permission === 'edit';

  // Share dialog: which of my folders is being shared, and its draft state.
  const [shareTarget, setShareTarget] = useState<string | null>(null);
  const [sharePermission, setSharePermission] = useState<FolderPermission>('view');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [existingShares, setExistingShares] = useState<FolderShareEntry[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  // Pick the recipient from a live user search, like the chat "new message" flow.
  const [shareSearchQuery, setShareSearchQuery] = useState('');
  const [shareSearchResults, setShareSearchResults] = useState<{ id: string; name: string; email: string; role?: string }[]>([]);
  const [shareSearching, setShareSearching] = useState(false);

  // Route note/task/document state updates to the shared arrays while a shared
  // folder is open, and to my own arrays otherwise.
  const patchPages = (fn: (prev: NotePage[]) => NotePage[]) =>
    activeShare ? setSharedPages(fn) : setPages(fn);
  const patchTasks = (fn: (prev: Task[]) => Task[]) =>
    activeShare ? setSharedTasks(fn) : setTasks(fn);
  const patchFiles = (fn: (prev: UploadedFile[]) => UploadedFile[]) =>
    activeShare ? setSharedFiles(fn) : setUploadedFiles(fn);

  // Helper to map API note to frontend NotePage shape
  const mapAPINote = (apiNote: any): NotePage => ({
    id: apiNote._id,
    title: apiNote.title,
    subject: apiNote.subject,
    blocks: (apiNote.blocks || []).map((b: any) => ({
      id: b._id || `b${Date.now()}-${Math.random()}`,
      type: b.type,
      text: b.text,
      checked: b.checked,
    })),
    position: apiNote.position ?? 0,
    createdAt: apiNote.createdAt,
    updatedAt: apiNote.updatedAt,
    tags: apiNote.tags,
  });

  // Helper to map API task
  const mapAPITask = (apiTask: any): Task => ({
    id: apiTask._id,
    title: apiTask.title,
    completed: apiTask.completed,
    subject: apiTask.subject ?? null,
  });

  // Fetch notes, tasks, subjects, and documents from database on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [notesData, tasksData, subjectsData, documentsData, sharedData] = await Promise.all([
          getNotesAPI(),
          getTasksAPI(),
          getSubjectsAPI(),
          getDocumentsAPI('notebook'),
          getSharedFoldersAPI().catch(() => [] as SharedFolder[]),
        ]);
        setSharedFolders(sharedData || []);
        const mappedNotes = notesData
          .filter((n: any) => n.title !== '__subject_placeholder__')
          .map(mapAPINote);
        setPages(mappedNotes);
        setTasks(tasksData.map(mapAPITask));
        setSubjects(subjectsData || []);
        // Map backend documents to frontend shape
        const mappedDocs: UploadedFile[] = documentsData.map((d: any) => ({
          id: d._id,
          name: d.name,
          type: d.type,
          uploadedAt: new Date(d.createdAt).toISOString().split('T')[0],
          subject: d.subject ?? null,
        }));
        setUploadedFiles(mappedDocs);
        if (mappedNotes.length > 0) {
          setSelectedPage(mappedNotes[0]);
          setSelectedSubject(mappedNotes[0].subject);
        } else if (subjectsData?.length > 0) {
          // No pages yet — still open a folder so new tasks and documents are filed.
          setSelectedSubject(subjectsData[0]);
        }
      } catch (err) {
        console.error('Failed to fetch notebook data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter pages by search query
  const filteredPages = pages.filter(page =>
    page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Pages shown in the open folder. A shared folder draws from its own content;
  // my own folders filter the full list by the open subject.
  const matchesSearch = (page: NotePage) =>
    page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
  const subjectPages = (activeShare ? sharedPages.filter(matchesSearch) : filteredPages)
    .filter(page => activeShare || page.subject === selectedSubject)
    .sort((a, b) => a.position - b.position);

  // Tasks and documents live inside a folder. A shared folder shows only its own;
  // with no folder open there is nothing to scope to, so everything is shown.
  const isFolderScoped = !!activeShare || (toolScope === 'folder' && !!selectedSubject);
  const visibleTasks = activeShare
    ? sharedTasks
    : isFolderScoped
      ? tasks.filter(t => t.subject === selectedSubject)
      : tasks;
  const visibleFiles = activeShare
    ? sharedFiles
    : isFolderScoped
      ? uploadedFiles.filter(f => f.subject === selectedSubject)
      : uploadedFiles;

  // Open one of my own folders (leaving any shared folder I was viewing).
  const openOwnedFolder = (subject: string) => {
    setActiveShare(null);
    setSelectedSubject(subject);
  };

  // Open a folder someone shared with me — loads its notes/tasks/documents into
  // the shared arrays after the backend confirms my access.
  const openSharedFolder = async (sf: SharedFolder) => {
    setActiveShare(sf);
    setSelectedSubject(sf.subject);
    setSelectedPage(null);
    setToolScope('folder');
    setLoadingShared(true);
    try {
      const [notesData, tasksData, docsData] = await Promise.all([
        getNotesAPI({ ownerId: sf.ownerId, subject: sf.subject }),
        getTasksAPI({ ownerId: sf.ownerId, subject: sf.subject }),
        getDocumentsAPI('notebook', { ownerId: sf.ownerId, subject: sf.subject }),
      ]);
      const mappedNotes = notesData
        .filter((n: any) => n.title !== '__subject_placeholder__')
        .map(mapAPINote);
      setSharedPages(mappedNotes);
      setSharedTasks(tasksData.map(mapAPITask));
      setSharedFiles(
        docsData.map((d: any) => ({
          id: d._id,
          name: d.name,
          type: d.type,
          uploadedAt: new Date(d.createdAt).toISOString().split('T')[0],
          subject: d.subject ?? null,
        }))
      );
      if (mappedNotes.length > 0) setSelectedPage(mappedNotes[0]);
    } catch (err) {
      console.error('Failed to open shared folder:', err);
    } finally {
      setLoadingShared(false);
    }
  };

  // ─── Share dialog ────────────────────────────────────────────────
  const openShareDialog = async (subject: string) => {
    setShareTarget(subject);
    setSharePermission('view');
    setShareError('');
    setShareSearchQuery('');
    setShareSearchResults([]);
    setExistingShares([]);
    setLoadingShares(true);
    try {
      setExistingShares(await getSubjectSharesAPI(subject));
    } catch (err) {
      console.error('Failed to load folder shares:', err);
    } finally {
      setLoadingShares(false);
    }
  };

  // Live search of MediHub users to pick a recipient (mirrors the chat flow).
  const handleShareSearch = async (query: string) => {
    setShareSearchQuery(query);
    setShareError('');
    if (!query.trim()) {
      setShareSearchResults([]);
      return;
    }
    setShareSearching(true);
    try {
      setShareSearchResults(await searchUsersAPI(query));
    } catch (err) {
      console.error('User search failed:', err);
    } finally {
      setShareSearching(false);
    }
  };

  // Share with a picked user at the currently selected permission.
  const shareWithUser = async (user: { id: string; name: string; email: string }) => {
    if (!shareTarget) return;
    setShareBusy(true);
    setShareError('');
    try {
      const entry = await shareSubjectAPI(shareTarget, user.id, sharePermission);
      // Replace any existing entry for this user, then append.
      setExistingShares(prev => [...prev.filter(s => s.user.id !== entry.user.id), entry]);
      setShareSearchQuery('');
      setShareSearchResults([]);
    } catch (err: any) {
      setShareError(err?.response?.data?.message || 'Could not share this folder');
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShare = async (userId: string) => {
    if (!shareTarget) return;
    try {
      await revokeSubjectShareAPI(shareTarget, userId);
      setExistingShares(prev => prev.filter(s => s.user.id !== userId));
    } catch (err) {
      console.error('Failed to revoke share:', err);
    }
  };

  // Update page title (auto-saves to database)
  const updatePageTitle = (newTitle: string) => {
    if (!selectedPage || !canEdit) return;

    patchPages(prev => prev.map(p =>
      p.id === selectedPage.id
        ? { ...p, title: newTitle, updatedAt: new Date().toISOString() }
        : p
    ));
    setSelectedPage({ ...selectedPage, title: newTitle });

    // Save to database (debounced effect would be ideal, but simple save here)
    updateNoteAPI(selectedPage.id, { title: newTitle }).catch(console.error);
  };

  // Update block text (auto-saves to database)
  const updateBlockText = (blockId: string, newText: string) => {
    if (!selectedPage || !canEdit) return;

    const updatedBlocks = selectedPage.blocks.map(b =>
      b.id === blockId ? { ...b, text: newText } : b
    );

    const updatedPage = { ...selectedPage, blocks: updatedBlocks, updatedAt: new Date().toISOString() };

    patchPages(prev => prev.map(p => p.id === selectedPage.id ? updatedPage : p));
    setSelectedPage(updatedPage);

    // Save blocks to database
    updateNoteAPI(selectedPage.id, { blocks: updatedBlocks }).catch(console.error);
  };

  // Toggle checklist (auto-saves to database)
  const toggleChecklist = (blockId: string) => {
    if (!selectedPage || !canEdit) return;

    const updatedBlocks = selectedPage.blocks.map(b =>
      b.id === blockId ? { ...b, checked: !b.checked } : b
    );

    const updatedPage = { ...selectedPage, blocks: updatedBlocks, updatedAt: new Date().toISOString() };

    patchPages(prev => prev.map(p => p.id === selectedPage.id ? updatedPage : p));
    setSelectedPage(updatedPage);

    updateNoteAPI(selectedPage.id, { blocks: updatedBlocks }).catch(console.error);
  };

  // Add new block (saved to database)
  const addBlock = (type: BlockType) => {
    if (!selectedPage || !canEdit) return;

    const newBlock: Block = {
      id: `b${Date.now()}`,
      type,
      text: type === 'divider' ? '' : `New ${type}...`,
      checked: type === 'checklist' ? false : undefined,
    };

    const updatedBlocks = [...selectedPage.blocks, newBlock];
    const updatedPage = {
      ...selectedPage,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };

    patchPages(prev => prev.map(p => p.id === selectedPage.id ? updatedPage : p));
    setSelectedPage(updatedPage);
    setShowBlockMenu(false);

    updateNoteAPI(selectedPage.id, { blocks: updatedBlocks }).catch(console.error);
  };

  // Delete block (saved to database)
  const deleteBlock = (blockId: string) => {
    if (!selectedPage || !canEdit) return;

    const updatedBlocks = selectedPage.blocks.filter(b => b.id !== blockId);
    const updatedPage = { ...selectedPage, blocks: updatedBlocks, updatedAt: new Date().toISOString() };

    patchPages(prev => prev.map(p => p.id === selectedPage.id ? updatedPage : p));
    setSelectedPage(updatedPage);

    updateNoteAPI(selectedPage.id, { blocks: updatedBlocks }).catch(console.error);
  };

  // Create new page (saved to database)
  const createNewPage = async () => {
    if (!canEdit) return;
    // No folder yet — send the user to folder creation first
    if (!selectedSubject) {
      setMobileView('list');
      setShowNewSubjectInput(true);
      return;
    }
    try {
      const apiNote = await createNoteAPI({
        title: 'Untitled Page',
        subject: selectedSubject,
        blocks: [
          { type: 'heading', text: 'New Page' },
          { type: 'text', text: 'Start writing...' },
        ],
        tags: [],
        // In a shared folder, file the new page under its owner.
        ...(activeShare ? { ownerId: activeShare.ownerId } : {}),
      });
      const newPage = mapAPINote(apiNote);
      patchPages(prev => [...prev, newPage]);
      setSelectedPage(newPage);
      setMobileView('editor');
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  // Add task to the open folder (saved to database)
  const addTask = async () => {
    if (!newTaskTitle.trim() || !canEdit) return;
    try {
      const apiTask = await createTaskAPI(newTaskTitle, selectedSubject || undefined, activeShare?.ownerId);
      patchTasks(prev => [...prev, mapAPITask(apiTask)]);
      setNewTaskTitle('');
      // A task filed elsewhere would vanish from the current view — show it.
      if (selectedSubject && !activeShare) setToolScope('folder');
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  // Toggle task (saved to database)
  const toggleTask = async (taskId: string) => {
    if (!canEdit) return;
    try {
      const updated = await toggleTaskAPI(taskId);
      patchTasks(prev => prev.map(t => t.id === taskId ? mapAPITask(updated) : t));
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  // Delete task (from database)
  const deleteTask = async (taskId: string) => {
    if (!canEdit) return;
    try {
      await deleteTaskAPI(taskId);
      patchTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  // Handle file upload - stores permanently in database
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !canEdit) return;
    setIsUploading(true);

    const files = Array.from(e.target.files);

    for (const file of files) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase();
        let type: 'pdf' | 'ppt' | 'doc' | 'image' | 'csv' | 'excel' | 'other' = 'other';
        if (ext === 'pdf') type = 'pdf';
        else if (ext === 'ppt' || ext === 'pptx') type = 'ppt';
        else if (ext === 'doc' || ext === 'docx') type = 'doc';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) type = 'image';
        else if (ext === 'csv') type = 'csv';
        else if (['xls', 'xlsx'].includes(ext || '')) type = 'excel';

        const saved = await uploadDocumentAPI({
          name: file.name,
          type,
          file: file,
          source: 'notebook',
          subject: selectedSubject || undefined,
          // In a shared folder, file the upload under its owner.
          ...(activeShare ? { ownerId: activeShare.ownerId } : {}),
        });

        const newFile: UploadedFile = {
          id: saved._id,
          name: saved.name,
          type: saved.type,
          uploadedAt: new Date(saved.createdAt).toISOString().split('T')[0],
          subject: saved.subject ?? null,
        };
        patchFiles(prev => [...prev, newFile]);
      } catch (err) {
        console.error('Failed to upload document:', err);
      }
    }
    setIsUploading(false);
    // Uploads land in the open folder — make sure that's what's on screen.
    if (selectedSubject && !activeShare) setToolScope('folder');
    // Reset the file input
    e.target.value = '';
  };

  // Helper: convert base64 + mimeType to a blob URL
  const base64ToBlobUrl = (base64: string, mimeType: string): string => {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  };

  // Get file icon
  const getFileIcon = (type: string): React.ReactNode => {
    switch (type) {
      case 'pdf': return <FileText className="w-6 h-6 text-red-500" />;
      case 'ppt': return <Presentation className="w-6 h-6 text-orange-500" />;
      case 'doc': return <FileEdit className="w-6 h-6 text-blue-500" />;
      case 'image': return <Image className="w-6 h-6 text-green-500" />;
      case 'csv': return <Table className="w-6 h-6 text-emerald-600" />;
      case 'excel': return <Table className="w-6 h-6 text-green-700" />;
      default: return <File className="w-6 h-6 text-slate-400" />;
    }
  };

  // Open document preview - fetches file data from backend and creates blob URL
  const openDocumentPreview = async (file: UploadedFile) => {
    try {
      const data = await downloadDocumentAPI(file.id);
      const blobUrl = base64ToBlobUrl(data.fileData, data.mimeType);
      setPreviewDocument({ ...file, url: blobUrl, mimeType: data.mimeType });
    } catch (err) {
      console.error('Failed to load document:', err);
    }
  };

  // Close document preview & revoke blob URL
  const closeDocumentPreview = () => {
    if (previewDocument?.url) {
      URL.revokeObjectURL(previewDocument.url);
    }
    setPreviewDocument(null);
  };

  // Move page up within subject
  const movePageUp = async (page: NotePage, index: number) => {
    if (index === 0) return;
    const currentSubjectPages = pages.filter(p => p.subject === page.subject && p.title !== '__subject_placeholder__');
    const sorted = [...currentSubjectPages].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex(p => p.id === page.id);
    if (idx <= 0) return;
    [sorted[idx - 1], sorted[idx]] = [sorted[idx], sorted[idx - 1]];
    const newIds = sorted.map(p => p.id);
    // Update positions locally
    const updatedPages = pages.map(p => {
      const newPos = newIds.indexOf(p.id);
      if (newPos !== -1) return { ...p, position: newPos } as NotePage;
      return p;
    });
    setPages(updatedPages);
    try {
      await reorderNotesAPI(newIds);
    } catch (err) {
      console.error('Failed to reorder:', err);
    }
  };

  // Move page down within subject
  const movePageDown = async (page: NotePage, index: number, total: number) => {
    if (index >= total - 1) return;
    const currentSubjectPages = pages.filter(p => p.subject === page.subject && p.title !== '__subject_placeholder__');
    const sorted = [...currentSubjectPages].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex(p => p.id === page.id);
    if (idx < 0 || idx >= sorted.length - 1) return;
    [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
    const newIds = sorted.map(p => p.id);
    const updatedPages = pages.map(p => {
      const newPos = newIds.indexOf(p.id);
      if (newPos !== -1) return { ...p, position: newPos } as NotePage;
      return p;
    });
    setPages(updatedPages);
    try {
      await reorderNotesAPI(newIds);
    } catch (err) {
      console.error('Failed to reorder:', err);
    }
  };

  // Open AI picker modal - fetches latest AI messages
  const openAiPicker = async () => {
    setShowAiPicker(true);
    setIsLoadingAi(true);
    try {
      const saved = await getAiMessagesAPI();
      if (saved && saved.length > 0) {
        // Map and pair each assistant message with its preceding user question
        const mapped = saved.map((m: any, idx: number) => {
          let question = '';
          if (m.sender === 'assistant') {
            // Look backwards for the user question
            for (let i = idx - 1; i >= 0; i--) {
              if (saved[i].sender === 'user') {
                const q = saved[i].text;
                question = q.length > 80 ? q.substring(0, 77) + '...' : q;
                break;
              }
            }
          }
          return {
            id: m._id || m.id,
            sender: m.sender,
            text: m.text,
            createdAt: m.createdAt,
            question,
          };
        });
        // Only show assistant messages
        setAiMessages(mapped.filter((m: any) => m.sender === 'assistant'));
      } else {
        setAiMessages([]);
      }
    } catch (err) {
      console.error('Failed to fetch AI messages:', err);
      setAiMessages([]);
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Save a specific AI message as a notebook note
  const addNoteFromAI = async (message: { question: string; text: string }) => {
    try {
      const parsedBlocks = markdownToBlocks(message.text);
      const title = message.question || `AI Response - ${new Date().toLocaleDateString()}`;

      // Ensure 'AI Assistant' subject exists in sidebar
      if (!subjects.includes('AI Assistant')) {
        try {
          await createSubjectAPI('AI Assistant');
        } catch (_) {
          // Subject may already exist in DB — that's fine
        }
        // Always add to local state so it shows in sidebar
        setSubjects(prev => prev.includes('AI Assistant') ? prev : [...prev, 'AI Assistant']);
      }

      const apiNote = await createNoteAPI({
        title,
        subject: 'AI Assistant',
        blocks: parsedBlocks,
        tags: ['AI Assistant'],
      });

      const newPage = mapAPINote(apiNote);
      setPages(prev => [...prev, newPage]);
      setActiveShare(null);
      setSelectedSubject('AI Assistant');
      setSelectedPage(newPage);
      setMobileView('editor');
      setShowAiPicker(false);
    } catch (err) {
      console.error('Failed to save AI note:', err);
      alert('Failed to save AI note.');
    }
  };

  // On desktop the page is an app shell: it fills the viewport below the 4rem
  // navbar and the workspace takes whatever height the masthead leaves, so the
  // panes never spill past the fold or stop short of it.
  return (
    <div className="min-h-screen lg:min-h-0 lg:h-[calc(100dvh-4rem)] gradient-subtle">
      <div className="page-container lg:h-full lg:flex lg:flex-col lg:!pt-8 lg:!pb-6">
        {/* Editorial masthead — hidden on mobile when editing so the editor fills the screen */}
        <header className={`relative mb-6 pb-6 border-b border-[var(--color-border-rule)] animate-section lg:shrink-0 ${mobileView !== 'list' ? 'hidden lg:block' : ''}`}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="flex-1 max-w-3xl">
              <p className="label !mb-3">Workspace</p>
              <h1 className="heading-hero mb-4">
                Your <span className="serif-accent">study</span>, kept close.
              </h1>
              <p className="body-lg max-w-xl text-[var(--color-text-secondary)]">
                Notes, tasks, and reference documents — organized by subject, ready when you are.
              </p>
            </div>
          </div>
        </header>

        {/* Main Layout — calm three-pane workspace */}
        <div className="workspace-shell rounded-2xl overflow-hidden flex flex-col lg:flex-row h-[calc(100dvh-9rem)] lg:h-auto lg:flex-1 lg:min-h-[26rem] bg-[var(--color-surface-white)] border border-[var(--color-border-hairline)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        {/* Left Sidebar */}
        <ResizableSidebar side="left" defaultWidth={272} minWidth={210} maxWidth={420} viewportShare={0.2} className="lg:border-r border-[var(--color-border-hairline)] bg-[var(--color-surface-elevated)]" responsive mobileVisible={mobileView === 'list'}>
        <aside className="w-full h-full flex flex-col">
          {/* Search — quiet bar */}
          <div className="px-4 pt-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-soft)]" strokeWidth={1.75} />
              <input
                type="text"
                placeholder="Search pages…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-[0.8125rem] rounded-md bg-[var(--color-surface-white)] border border-[var(--color-border-hairline)] outline-none focus:border-[var(--color-navy)] transition-colors"
              />
            </div>
          </div>

          {/* Subjects & Pages */}
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            <div className="flex items-center justify-between px-3 mb-2 mt-1">
              <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-text-soft)]">Workspace</span>
              <button
                onClick={() => setShowNewSubjectInput(!showNewSubjectInput)}
                className="text-[var(--color-text-soft)] hover:text-[var(--color-navy)] p-1 rounded hover:bg-[var(--color-accent-soft)] transition"
                title="Add new subject"
              >
                <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>

              {/* New Subject Input — slides in */}
              {showNewSubjectInput && (
                <div className="mb-2 px-2 fade-in">
                  <div className="flex gap-1 items-center bg-[var(--color-surface-white)] border border-[var(--color-navy)] rounded-md px-2 py-1.5">
                    <FolderPlus className="w-3.5 h-3.5 text-[var(--color-text-soft)] shrink-0" strokeWidth={1.75} />
                    <input
                      type="text"
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newSubjectName.trim()) {
                          try {
                            await createSubjectAPI(newSubjectName.trim());
                            setSubjects([...subjects, newSubjectName.trim()]);
                            setActiveShare(null);
                            setSelectedSubject(newSubjectName.trim());
                            setNewSubjectName('');
                            setShowNewSubjectInput(false);
                          } catch (err: any) {
                            console.error('Failed to create subject:', err);
                            alert(err?.response?.data?.message || 'Failed to create subject');
                          }
                        } else if (e.key === 'Escape') {
                          setNewSubjectName('');
                          setShowNewSubjectInput(false);
                        }
                      }}
                      placeholder="New subject"
                      className="flex-1 bg-transparent border-none outline-none text-[0.8125rem] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-soft)]"
                      autoFocus
                    />
                    <button
                      onClick={() => { setNewSubjectName(''); setShowNewSubjectInput(false); }}
                      className="text-[var(--color-text-soft)] hover:text-red-500 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {subjects.map(subject => {
                const subjectPageCount = filteredPages.filter(p => p.subject === subject).length;
                const isExpanded = selectedSubject === subject;
                const isRenaming = renamingSubject === subject;
                const accent = accentForSubject(subject);
                const accentVars = { '--nb-accent': accent.dot, '--nb-accent-soft': accent.soft } as React.CSSProperties;

                return (
                  <div key={subject} className="mb-2" style={accentVars}>
                    {isRenaming ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--color-surface-white)] rounded-xl border" style={{ borderColor: accent.dot }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent.dot }} />
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && renameValue.trim() && renameValue.trim() !== subject) {
                              try {
                                await renameSubjectAPI(subject, renameValue.trim());
                                const newName = renameValue.trim();
                                setSubjects(subjects.map(s => s === subject ? newName : s));
                                setPages(pages.map(p => p.subject === subject ? { ...p, subject: newName } : p));
                                setTasks(prev => prev.map(t => t.subject === subject ? { ...t, subject: newName } : t));
                                setUploadedFiles(prev => prev.map(f => f.subject === subject ? { ...f, subject: newName } : f));
                                if (selectedSubject === subject) setSelectedSubject(newName);
                                if (selectedPage?.subject === subject) setSelectedPage({ ...selectedPage, subject: newName });
                                setRenamingSubject(null);
                              } catch (err: any) {
                                alert(err?.response?.data?.message || 'Failed to rename subject');
                              }
                            } else if (e.key === 'Enter' && renameValue.trim() === subject) {
                              setRenamingSubject(null);
                            } else if (e.key === 'Escape') {
                              setRenamingSubject(null);
                            }
                          }}
                          onBlur={async () => {
                            if (renameValue.trim() && renameValue.trim() !== subject) {
                              try {
                                await renameSubjectAPI(subject, renameValue.trim());
                                const newName = renameValue.trim();
                                setSubjects(subjects.map(s => s === subject ? newName : s));
                                setPages(pages.map(p => p.subject === subject ? { ...p, subject: newName } : p));
                                setTasks(prev => prev.map(t => t.subject === subject ? { ...t, subject: newName } : t));
                                setUploadedFiles(prev => prev.map(f => f.subject === subject ? { ...f, subject: newName } : f));
                                if (selectedSubject === subject) setSelectedSubject(newName);
                                if (selectedPage?.subject === subject) setSelectedPage({ ...selectedPage, subject: newName });
                              } catch (err: any) {
                                console.error('Failed to rename subject:', err);
                              }
                            }
                            setRenamingSubject(null);
                          }}
                          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[0.8125rem] font-semibold text-[var(--color-text-primary)]"
                        />
                      </div>
                    ) : (
                    <div className="nb-card group/subject" data-active={isExpanded && !activeShare}>
                      <div onClick={() => openOwnedFolder(subject)} className="nb-card-head">
                        <span className="nb-card-icon">
                          {isExpanded && !activeShare
                            ? <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                            : <Folder className="w-3.5 h-3.5" strokeWidth={1.75} />}
                        </span>
                        <span className="nb-card-title">{subject}</span>
                        <span className="nb-card-actions">
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openShareDialog(subject);
                            }}
                            className="nb-handle-btn"
                            title="Share folder"
                          >
                            <Share2 className="w-3 h-3" strokeWidth={1.75} />
                          </span>
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingSubject(subject);
                              setRenameValue(subject);
                              setTimeout(() => renameInputRef.current?.focus(), 50);
                            }}
                            className="nb-handle-btn"
                            title="Rename"
                          >
                            <Pencil className="w-3 h-3" strokeWidth={1.75} />
                          </span>
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteSubjectTarget(subject);
                            }}
                            className="nb-handle-btn hover:!text-red-500"
                            title="Delete"
                          >
                            <X className="w-3 h-3" strokeWidth={1.75} />
                          </span>
                        </span>
                        <span className="nb-card-count group-hover/subject:hidden">{subjectPageCount}</span>
                        <ChevronDown className="nb-card-chev w-3.5 h-3.5" data-expanded={isExpanded} strokeWidth={2} />
                      </div>

                      {/* Pages under this subject */}
                      {isExpanded && !activeShare && (
                        <div className="nb-card-body fade-in">
                          {subjectPages.map((page, idx) => {
                            const isPageActive = selectedPage?.id === page.id;
                            return (
                            <div
                              key={page.id}
                              onClick={() => { setSelectedPage(page); setMobileView('editor'); }}
                              data-active={isPageActive}
                              className="nb-row group/page"
                            >
                              <FileText className="w-3.5 h-3.5 text-[var(--color-text-soft)] shrink-0" strokeWidth={1.5} />
                              <span className="text-[0.8125rem] truncate flex-1 tracking-tight">
                                {page.title || 'Untitled'}
                              </span>
                              <span className="nb-row-actions">
                                <span
                                  role="button"
                                  onClick={(e) => { e.stopPropagation(); movePageUp(page, idx); }}
                                  className={`nb-handle-btn ${idx === 0 ? 'pointer-events-none opacity-30' : ''}`}
                                  title="Move up"
                                >
                                  <ChevronUp className="w-3 h-3" strokeWidth={2} />
                                </span>
                                <span
                                  role="button"
                                  onClick={(e) => { e.stopPropagation(); movePageDown(page, idx, subjectPages.length); }}
                                  className={`nb-handle-btn ${idx === subjectPages.length - 1 ? 'pointer-events-none opacity-30' : ''}`}
                                  title="Move down"
                                >
                                  <ChevronDown className="w-3 h-3" strokeWidth={2} />
                                </span>
                                <span
                                  role="button"
                                  onClick={(e) => { e.stopPropagation(); setDeletePageTarget(page); }}
                                  className="nb-handle-btn hover:!text-red-500"
                                  title="Delete page"
                                >
                                  <X className="w-3 h-3" strokeWidth={2} />
                                </span>
                              </span>
                            </div>
                            );
                          })}

                          {subjectPages.length === 0 && (
                            <p className="px-2 py-1.5 text-[11px] text-[var(--color-text-soft)] italic" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                              No pages yet.
                            </p>
                          )}

                          <div
                            onClick={createNewPage}
                            className="nb-row text-[var(--color-text-soft)] hover:text-[var(--color-navy)]"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                            <span className="text-[0.8125rem] italic" style={{ fontFamily: 'var(--font-fraunces), serif' }}>New page</span>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}

              {/* Loading skeleton while folders fetch */}
              {isLoading && subjects.length === 0 && (
                <div className="px-2 space-y-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="skeleton h-9 w-full rounded-xl" style={{ opacity: 1 - i * 0.25 }} />
                  ))}
                </div>
              )}

              {/* Empty state — no folders yet */}
              {!isLoading && subjects.length === 0 && !showNewSubjectInput && (
                <button
                  onClick={() => setShowNewSubjectInput(true)}
                  className="w-full mt-1 px-4 py-6 rounded-xl border border-dashed border-[var(--color-border-hairline)] flex flex-col items-center gap-2 text-[var(--color-text-soft)] hover:border-[var(--color-navy)] hover:text-[var(--color-navy)] hover:bg-[var(--color-accent-soft)] transition-all group/empty"
                >
                  <FolderPlus className="w-5 h-5 transition-transform group-hover/empty:scale-110" strokeWidth={1.5} />
                  <span className="text-[0.8125rem] font-semibold tracking-tight">Create your first folder</span>
                  <span className="text-[11px] italic leading-relaxed max-w-[180px]" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                    Organise your notes by subject — Anatomy, Pathology, anything you like.
                  </span>
                </button>
              )}

              {/* Shared with me — folders other users gave me access to */}
              {sharedFolders.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--color-border-hairline)]">
                  <div className="flex items-center gap-1.5 px-3 mb-2">
                    <Users className="w-3 h-3 text-[var(--color-text-soft)]" strokeWidth={1.75} />
                    <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-text-soft)]">Shared with me</span>
                  </div>
                  {sharedFolders.map(sf => {
                    const isActive = activeShare?.ownerId === sf.ownerId && activeShare?.subject === sf.subject;
                    const accent = accentForSubject(sf.subject);
                    const accentVars = { '--nb-accent': accent.dot, '--nb-accent-soft': accent.soft } as React.CSSProperties;
                    return (
                      <div key={`${sf.ownerId}:${sf.subject}`} className="mb-2" style={accentVars}>
                        <div className="nb-card" data-active={isActive}>
                          <div onClick={() => openSharedFolder(sf)} className="nb-card-head">
                            <span className="nb-card-icon">
                              {isActive
                                ? <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                                : <Folder className="w-3.5 h-3.5" strokeWidth={1.75} />}
                            </span>
                            <span className="nb-card-title">{sf.subject}</span>
                            <span
                              className="nb-chip shrink-0 inline-flex items-center gap-1"
                              title={sf.permission === 'edit' ? 'You can edit this folder' : 'View only'}
                            >
                              {sf.permission === 'edit'
                                ? <Pencil className="w-2.5 h-2.5" strokeWidth={2} />
                                : <Lock className="w-2.5 h-2.5" strokeWidth={2} />}
                              {sf.permission === 'edit' ? 'Edit' : 'View'}
                            </span>
                            <ChevronDown className="nb-card-chev w-3.5 h-3.5" data-expanded={isActive} strokeWidth={2} />
                          </div>

                          {isActive && (
                            <div className="nb-card-body fade-in">
                              <div className="px-2 pb-1.5 text-[11px] text-[var(--color-text-soft)] truncate">
                                Shared by {sf.ownerName}
                              </div>
                              {loadingShared ? (
                                <div className="px-2 space-y-1.5 py-1">
                                  {[0, 1].map(i => (
                                    <div key={i} className="skeleton h-6 w-full rounded" style={{ opacity: 1 - i * 0.3 }} />
                                  ))}
                                </div>
                              ) : (
                                <>
                                  {subjectPages.map(page => {
                                    const isPageActive = selectedPage?.id === page.id;
                                    return (
                                      <div
                                        key={page.id}
                                        onClick={() => { setSelectedPage(page); setMobileView('editor'); }}
                                        data-active={isPageActive}
                                        className="nb-row group/page"
                                      >
                                        <FileText className="w-3.5 h-3.5 text-[var(--color-text-soft)] shrink-0" strokeWidth={1.5} />
                                        <span className="text-[0.8125rem] truncate flex-1 tracking-tight">
                                          {page.title || 'Untitled'}
                                        </span>
                                        {canEdit && (
                                          <span className="nb-row-actions">
                                            <span
                                              role="button"
                                              onClick={(e) => { e.stopPropagation(); setDeletePageTarget(page); }}
                                              className="nb-handle-btn hover:!text-red-500"
                                              title="Delete page"
                                            >
                                              <X className="w-3 h-3" strokeWidth={2} />
                                            </span>
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {subjectPages.length === 0 && (
                                    <p className="px-2 py-1.5 text-[11px] text-[var(--color-text-soft)] italic" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                                      No pages yet.
                                    </p>
                                  )}

                                  {canEdit && (
                                    <div
                                      onClick={createNewPage}
                                      className="nb-row text-[var(--color-text-soft)] hover:text-[var(--color-navy)]"
                                    >
                                      <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                                      <span className="text-[0.8125rem] italic" style={{ fontFamily: 'var(--font-fraunces), serif' }}>New page</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>

          {/* Add Note from AI Button — refined inline */}
          <div className="px-3 pb-4 pt-3 border-t border-[var(--color-border-hairline)] space-y-2">
            <button
              onClick={openAiPicker}
              className="w-full px-3 py-2.5 rounded-md text-[0.8125rem] font-semibold flex items-center justify-center gap-2 transition-all gradient-ink text-white hover:brightness-110"
              style={{ boxShadow: 'var(--shadow-btn), var(--shadow-inset)' }}
            >
              <Bot className="w-3.5 h-3.5" strokeWidth={1.75} /> Add note from AI
            </button>
            {/* Mobile-only shortcut to tasks/documents pane */}
            <button
              onClick={() => setMobileView('tools')}
              className="lg:hidden w-full px-3 py-2 rounded-md text-[0.8125rem] font-semibold flex items-center justify-center gap-2 bg-[var(--color-surface-white)] border border-[var(--color-border-hairline)] text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-navy)] transition-smooth"
            >
              <Wrench className="w-3.5 h-3.5" strokeWidth={1.75} /> Tasks & documents
            </button>
          </div>
        </aside>
        </ResizableSidebar>

        {/* Main Editor Area — calm paper canvas */}
        <main className={`flex-1 min-w-0 overflow-y-auto bg-[var(--color-surface-white)] ${mobileView === 'editor' ? 'block' : 'hidden'} lg:block`}>
          {/* Mobile back-bar */}
          <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2.5 bg-white/95 backdrop-blur border-b border-[var(--color-border-hairline)]">
            <button
              onClick={() => setMobileView('list')}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-navy)] transition-smooth"
              aria-label="Back to pages"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate flex-1 text-center px-2">
              {selectedPage?.title || 'Untitled'}
            </span>
            <button
              onClick={() => setMobileView('tools')}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-navy)] transition-smooth"
              aria-label="Tasks and documents"
              title="Tasks & documents"
            >
              <Wrench className="w-4 h-4" />
            </button>
          </div>
          {selectedPage ? (
            <div className="nb-canvas fade-in">
              {/* Editable Page Title */}
              <AutoGrowTextarea
                value={selectedPage.title}
                onChange={updatePageTitle}
                className="nb-title mb-3 placeholder:opacity-40"
                placeholder="Untitled"
                singleLine
                readOnly={!canEdit}
              />

              {/* Metadata — quiet editorial spec */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-10 pb-6 border-b border-[var(--color-border-hairline)] text-[11px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)]">
                <span className="flex items-center gap-1.5">
                  <Folder className="w-3 h-3" strokeWidth={1.75} /> {selectedPage.subject}
                </span>
                <span className="w-1 h-1 rounded-full bg-[var(--color-border-strong)]" />
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" strokeWidth={1.75} /> Updated {new Date(selectedPage.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {activeShare && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[var(--color-border-strong)]" />
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3 h-3" strokeWidth={1.75} /> Shared by {activeShare.ownerName} · {canEdit ? 'Can edit' : 'View only'}
                    </span>
                  </>
                )}
                {selectedPage.tags && selectedPage.tags.length > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[var(--color-border-strong)]" />
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3 h-3" strokeWidth={1.75} /> {selectedPage.tags.join(' · ')}
                    </span>
                  </>
                )}
              </div>

              {/* Blocks — Notion-style with hover handles */}
              <div className="space-y-1">
                {selectedPage.blocks.map((block) => (
                  <div key={block.id} className="nb-block">
                    {canEdit && (
                      <div className="nb-handle">
                        <span
                          role="button"
                          onClick={() => deleteBlock(block.id)}
                          className="nb-handle-btn hover:!text-red-500"
                          title="Delete block"
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                        </span>
                      </div>
                    )}

                    {block.type === 'heading' && (
                      <AutoGrowTextarea
                        value={block.text}
                        onChange={(text) => updateBlockText(block.id, text)}
                        className="nb-h"
                        placeholder="Heading"
                        singleLine
                        readOnly={!canEdit}
                      />
                    )}

                    {block.type === 'text' && (
                      <AutoGrowTextarea
                        value={block.text}
                        onChange={(text) => updateBlockText(block.id, text)}
                        className="nb-body"
                        placeholder="Type ‘/’ or just start writing…"
                        readOnly={!canEdit}
                      />
                    )}

                    {block.type === 'checklist' && (
                      <div className="flex items-start gap-3 py-0.5">
                        <input
                          type="checkbox"
                          checked={block.checked || false}
                          onChange={() => toggleChecklist(block.id)}
                          disabled={!canEdit}
                          className="nb-checkbox mt-[0.3125rem]"
                        />
                        <AutoGrowTextarea
                          value={block.text}
                          onChange={(text) => updateBlockText(block.id, text)}
                          className={`nb-body flex-1 min-w-0 ${block.checked ? 'line-through text-[var(--color-text-soft)]' : ''}`}
                          placeholder="To-do"
                          singleLine
                          readOnly={!canEdit}
                        />
                      </div>
                    )}

                    {block.type === 'bullet' && (
                      <div className="flex items-start gap-3 py-0.5">
                        <span className="text-[var(--color-text-muted)] font-bold leading-none mt-[0.4375rem] shrink-0">·</span>
                        <AutoGrowTextarea
                          value={block.text}
                          onChange={(text) => updateBlockText(block.id, text)}
                          className="nb-body flex-1 min-w-0"
                          placeholder="List item"
                          singleLine
                          readOnly={!canEdit}
                        />
                      </div>
                    )}

                    {block.type === 'divider' && (
                      <div className="my-5 flex items-center justify-center" aria-hidden>
                        <span className="text-[var(--color-text-soft)] text-xs tracking-[0.4em] select-none">· · ·</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Block Menu — slash-command vibe (hidden on view-only shared folders) */}
              {canEdit && (
              <div className="mt-8 relative">
                <button
                  onClick={() => setShowBlockMenu(!showBlockMenu)}
                  className="text-[var(--color-text-soft)] hover:text-[var(--color-navy)] text-sm flex items-center gap-2 py-2 px-2 -mx-2 rounded-md hover:bg-[var(--color-surface-elevated)] transition group/add"
                >
                  <span className="w-5 h-5 rounded border border-[var(--color-border-rule)] flex items-center justify-center group-hover/add:border-[var(--color-navy)] transition">
                    <Plus className="w-3 h-3" strokeWidth={2.25} />
                  </span>
                  <span className="text-[0.8125rem]">Add a block</span>
                  <kbd className="nb-kbd ml-1">/</kbd>
                </button>

                {showBlockMenu && (
                  <div className="absolute left-0 top-full mt-2 nb-menu z-10 fade-in">
                    <div className="px-3 py-2 border-b border-[var(--color-border-hairline)]">
                      <p className="label !mb-0">Basic blocks</p>
                    </div>
                    {[
                      { type: 'heading' as const, label: 'Heading', desc: 'Section title', Icon: Heading, kbd: 'H' },
                      { type: 'text' as const, label: 'Text', desc: 'Plain paragraph', Icon: Type, kbd: 'T' },
                      { type: 'checklist' as const, label: 'To-do list', desc: 'Track tasks', Icon: CheckSquare, kbd: '☐' },
                      { type: 'bullet' as const, label: 'Bullet list', desc: 'Simple list', Icon: List, kbd: '·' },
                      { type: 'divider' as const, label: 'Divider', desc: 'Visual break', Icon: Minus, kbd: '—' },
                    ].map(({ type, label, desc, Icon, kbd }) => (
                      <button
                        key={type}
                        onClick={() => addBlock(type)}
                        className="nb-menu-item"
                      >
                        <span className="nb-menu-icon">
                          <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[0.8125rem] font-semibold text-[var(--color-navy)] tracking-tight">{label}</span>
                          <span className="block text-[11px] text-[var(--color-text-soft)]">{desc}</span>
                        </span>
                        <kbd className="nb-kbd">{kbd}</kbd>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          ) : (
            <div className="max-w-md mx-auto px-6 py-24 text-center fade-in">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full border border-[var(--color-border-rule)] flex items-center justify-center dot-grid">
                <PenLine className="w-6 h-6 text-[var(--color-text-muted)]" strokeWidth={1.25} />
              </div>
              <h2
                className="mb-2 text-[var(--color-navy)]"
                style={{
                  fontFamily: 'var(--font-fraunces), serif',
                  fontSize: '1.5rem',
                  fontWeight: 500,
                  letterSpacing: '-0.025em',
                }}
              >
                A <span className="serif-accent">blank</span> page awaits.
              </h2>
              <p className="body-md mb-7 max-w-xs mx-auto">
                {canEdit
                  ? 'Pick a page from the side, or start something new — your study, organized.'
                  : 'Pick a page from the side to read it.'}
              </p>
              {canEdit && (
                <button onClick={createNewPage} className="btn-primary inline-flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                  New page
                </button>
              )}
            </div>
          )}
        </main>

        {/* Right Sidebar — Tasks & Uploads */}
        <ResizableSidebar side="right" defaultWidth={320} minWidth={230} maxWidth={500} viewportShare={0.23} className="lg:border-l border-[var(--color-border-hairline)] bg-[var(--color-surface-elevated)]" responsive mobileVisible={mobileView === 'tools'}>
        <aside className="w-full h-full flex flex-col overflow-y-auto">
          {/* Mobile back-bar */}
          <div className="lg:hidden sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border-hairline)]">
            <button
              onClick={() => setMobileView(selectedPage ? 'editor' : 'list')}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] bg-[var(--color-surface-white)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-navy)] transition-smooth border border-[var(--color-border-hairline)]"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Tasks & documents</span>
          </div>

          {/* Folder scope — tasks and documents are kept per folder */}
          <div className="px-5 pt-5 pb-4 border-b border-[var(--color-border-hairline)]">
            <p className="label !mb-2">Filing</p>
            <div className="flex items-center gap-2 mb-1 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: selectedSubject ? accentForSubject(selectedSubject).dot : 'var(--color-border-strong)' }}
              />
              <span className="text-[0.8125rem] font-semibold text-[var(--color-text-primary)] truncate tracking-tight">
                {selectedSubject || 'No folder open'}
              </span>
            </div>
            {activeShare ? (
              <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-soft)] mb-1">
                <Users className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                <span className="truncate">Shared by {activeShare.ownerName} · {canEdit ? 'Can edit' : 'View only'}</span>
              </p>
            ) : (
              <div className="nb-scope mt-2" role="group" aria-label="Filter tasks and documents">
                <button
                  type="button"
                  onClick={() => setToolScope('folder')}
                  data-active={toolScope === 'folder'}
                  disabled={!selectedSubject}
                  className="nb-scope-btn"
                >
                  This folder
                </button>
                <button
                  type="button"
                  onClick={() => setToolScope('all')}
                  data-active={toolScope === 'all' || !selectedSubject}
                  className="nb-scope-btn"
                >
                  All folders
                </button>
              </div>
            )}
          </div>

          {/* Tasks Section */}
          <div className="px-5 pt-5 pb-6 border-b border-[var(--color-border-hairline)]">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="label !mb-0.5">{isFolderScoped ? 'This folder' : 'Everything'}</p>
                <h2
                  className="text-[var(--color-navy)]"
                  style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.125rem', fontWeight: 500, letterSpacing: '-0.02em' }}
                >
                  Tasks
                </h2>
              </div>
              <span
                className="text-[var(--color-text-soft)] tabular-nums shrink-0"
                style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '0.9375rem', fontStyle: 'italic' }}
              >
                {visibleTasks.filter(t => !t.completed).length}/{visibleTasks.length}
              </span>
            </div>

            {/* Task List */}
            <div className="space-y-1 mb-4">
              {visibleTasks.length === 0 ? (
                <p className="text-[0.8125rem] text-[var(--color-text-soft)] italic px-1 py-2" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                  {isFolderScoped ? `Nothing to do in ${selectedSubject} — yet.` : 'Nothing to do — yet.'}
                </p>
              ) : (
                visibleTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-2.5 group py-1 px-1 -mx-1 rounded-md hover:bg-[var(--color-surface-white)] transition">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task.id)}
                      disabled={!canEdit}
                      className="nb-checkbox mt-[0.1875rem]"
                    />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[0.8125rem] tracking-tight break-words ${task.completed ? 'line-through text-[var(--color-text-soft)]' : 'text-[var(--color-text-primary)]'}`}>
                        {task.title}
                      </span>
                      {!isFolderScoped && (
                        <span className="nb-chip mt-1">{task.subject || 'Unfiled'}</span>
                      )}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[var(--color-text-soft)] hover:text-red-500 transition p-0.5 rounded shrink-0"
                        aria-label={`Delete task ${task.title}`}
                      >
                        <X className="w-3 h-3" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add Task — hidden on view-only shared folders */}
            {canEdit && (
            <div className="flex gap-1.5 items-center bg-[var(--color-surface-white)] border border-[var(--color-border-hairline)] rounded-md px-2.5 py-1.5 focus-within:border-[var(--color-navy)] transition-colors">
              <Plus className="w-3.5 h-3.5 text-[var(--color-text-soft)] shrink-0" strokeWidth={1.75} />
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
                placeholder={selectedSubject ? `Add a task to ${selectedSubject}…` : 'Add a task…'}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-[0.8125rem] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-soft)] truncate"
              />
              {newTaskTitle && (
                <button
                  onClick={addTask}
                  className="text-[10px] uppercase tracking-wider font-bold text-[var(--color-blue-primary)] hover:text-[var(--color-navy)] transition"
                >
                  Add
                </button>
              )}
            </div>
            )}
          </div>

          {/* Documents Section */}
          <div className="px-5 pt-6 pb-5 flex-1">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="label !mb-0.5">Reference</p>
                <h2
                  className="text-[var(--color-navy)]"
                  style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.125rem', fontWeight: 500, letterSpacing: '-0.02em' }}
                >
                  Documents
                </h2>
              </div>
              <span
                className="text-[var(--color-text-soft)] tabular-nums shrink-0"
                style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '0.9375rem', fontStyle: 'italic' }}
              >
                {visibleFiles.length}
              </span>
            </div>

            {/* File Upload — refined dropzone (hidden on view-only shared folders) */}
            {canEdit && (
            <label className="nb-dropzone mb-4">
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                  <span>Uploading…</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span className="text-center leading-snug">
                    {selectedSubject ? `Upload to ${selectedSubject}` : 'Drop files or click to upload'}
                  </span>
                </>
              )}
              <input type="file" multiple onChange={handleFileUpload} className="hidden" accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.csv,.xls,.xlsx,.txt,.rtf,.odt,.ods,.odp" disabled={isUploading} />
            </label>
            )}

            {/* Documents List */}
            <div className="space-y-1">
              {visibleFiles.map(file => (
                <div key={file.id} className="relative group">
                  <button
                    onClick={() => openDocumentPreview(file)}
                    className="nb-doc w-full"
                  >
                    <span className="nb-doc-icon">
                      {getFileIcon(file.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.8125rem] font-semibold text-[var(--color-text-primary)] truncate tracking-tight">
                        {file.name}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-soft)] font-semibold">
                        <span>{file.type}</span>
                        <span className="w-0.5 h-0.5 rounded-full bg-[var(--color-border-strong)]" />
                        <span>{file.uploadedAt}</span>
                        {!isFolderScoped && (
                          <>
                            <span className="w-0.5 h-0.5 rounded-full bg-[var(--color-border-strong)]" />
                            <span className="truncate max-w-[9rem] normal-case tracking-normal">{file.subject || 'Unfiled'}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Eye className="w-3.5 h-3.5 text-[var(--color-text-soft)] opacity-0 group-hover:opacity-100 transition shrink-0" strokeWidth={1.5} />
                  </button>
                  {canEdit && (
                    <button
                      aria-label={`Delete ${file.name}`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await deleteDocumentAPI(file.id);
                          patchFiles(prev => prev.filter(f => f.id !== file.id));
                        } catch (err) {
                          console.error('Failed to delete document:', err);
                        }
                      }}
                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-[var(--color-text-soft)] hover:text-red-500 transition bg-[var(--color-surface-white)] border border-[var(--color-border-hairline)] rounded p-0.5"
                    >
                      <X className="w-3 h-3" strokeWidth={2} />
                    </button>
                  )}
                </div>
              ))}

              {visibleFiles.length === 0 && (
                <div className="text-center py-8">
                  <Inbox className="w-8 h-8 mx-auto mb-2 text-[var(--color-border-strong)]" strokeWidth={1.25} />
                  <p className="text-[0.8125rem] text-[var(--color-text-soft)] italic px-2" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                    {isFolderScoped ? `Nothing filed under ${selectedSubject} — yet.` : 'No documents — yet.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
        </ResizableSidebar>
      </div>

      {/* Document Preview Modal */}
      {previewDocument && (
        <div
          className="fixed inset-0 bg-[rgba(0,11,51,0.4)] backdrop-blur-sm flex items-center justify-center z-50 p-4 fade-in"
          onClick={closeDocumentPreview}
        >
          <div
            className="bg-[var(--color-surface-white)] rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-[var(--color-border-hairline)]"
            style={{ boxShadow: 'var(--shadow-modal)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-hairline)] bg-[var(--color-surface-elevated)]">
              <div className="flex items-center gap-3 min-w-0">
                <span className="nb-doc-icon shrink-0">{getFileIcon(previewDocument.type)}</span>
                <div className="min-w-0">
                  <h3
                    className="text-[var(--color-navy)] truncate"
                    style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.125rem', fontWeight: 500, letterSpacing: '-0.02em' }}
                  >
                    {previewDocument.name}
                  </h3>
                  <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[var(--color-text-soft)] mt-0.5">
                    {previewDocument.type.toUpperCase()} · {previewDocument.uploadedAt}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewDocument.url && (
                  <a href={previewDocument.url} download={previewDocument.name} className="btn-primary inline-flex items-center gap-1.5 !py-2 !px-3.5">
                    <Download className="w-3.5 h-3.5" strokeWidth={2} /> Download
                  </a>
                )}
                <button onClick={closeDocumentPreview} className="btn-secondary inline-flex items-center gap-1.5 !py-2 !px-3.5">
                  <X className="w-3.5 h-3.5" strokeWidth={2} /> Close
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden bg-[var(--color-surface-elevated)]">
              {previewDocument.url && previewDocument.type === 'pdf' ? (
                <embed src={previewDocument.url} type="application/pdf" className="w-full h-full" title={previewDocument.name} />
              ) : previewDocument.url && previewDocument.type === 'image' ? (
                <div className="flex items-center justify-center h-full p-6 overflow-auto">
                  <img src={previewDocument.url} alt={previewDocument.name} className="max-w-full max-h-full object-contain rounded-lg" style={{ boxShadow: 'var(--shadow-card)' }} />
                </div>
              ) : previewDocument.url && previewDocument.type === 'csv' ? (
                <CsvPreview url={previewDocument.url} />
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
                  <div className="text-center max-w-md">
                    <div className="mb-5 flex justify-center [&_svg]:w-12 [&_svg]:h-12">{getFileIcon(previewDocument.type)}</div>
                    <h3
                      className="text-[var(--color-navy)] mb-2"
                      style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.022em' }}
                    >
                      Preview unavailable
                    </h3>
                    <p className="body-md mb-6">This file type can&apos;t be shown inline — but you can grab it.</p>
                    {previewDocument.url && (
                      <a href={previewDocument.url} download={previewDocument.name} className="btn-primary inline-flex items-center gap-2">
                        <Download className="w-4 h-4" strokeWidth={2} /> Download file
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Page Confirmation */}
      <ConfirmModal
        open={!!deletePageTarget}
        title="Delete Page?"
        message={`This will permanently delete "${deletePageTarget?.title}". This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deletePageTarget) return;
          try {
            await deleteNoteAPI(deletePageTarget.id);
            patchPages(prev => prev.filter(p => p.id !== deletePageTarget.id));
            if (selectedPage?.id === deletePageTarget.id) {
              setSelectedPage(null);
              setMobileView('list');
            }
          } catch (err) {
            console.error('Failed to delete page:', err);
          } finally {
            setDeletePageTarget(null);
          }
        }}
        onCancel={() => setDeletePageTarget(null)}
      />

      {/* AI Messages Picker Modal */}
      {showAiPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,11,51,0.4)] backdrop-blur-sm p-4 fade-in"
          onClick={() => setShowAiPicker(false)}
        >
          <div
            className="bg-[var(--color-surface-white)] rounded-2xl w-full max-w-xl max-h-[75vh] flex flex-col overflow-hidden border border-[var(--color-border-hairline)]"
            style={{ boxShadow: 'var(--shadow-modal)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-7 pt-6 pb-5 border-b border-[var(--color-border-hairline)] flex items-start justify-between gap-4">
              <div>
                <p className="label !mb-2">From the AI</p>
                <h3
                  className="text-[var(--color-navy)] mb-1"
                  style={{
                    fontFamily: 'var(--font-fraunces), serif',
                    fontSize: '1.625rem',
                    fontWeight: 500,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                  }}
                >
                  Save a <span className="serif-accent">response</span> as a note.
                </h3>
                <p className="text-[0.8125rem] text-[var(--color-text-muted)] mt-2">
                  Picks land in the &ldquo;AI Assistant&rdquo; section, formatted as blocks.
                </p>
              </div>
              <button
                onClick={() => setShowAiPicker(false)}
                className="text-[var(--color-text-soft)] hover:text-[var(--color-navy)] hover:bg-[var(--color-surface-elevated)] p-2 rounded-md transition shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {isLoadingAi ? (
                <div className="space-y-2.5 py-2">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="card-item p-4" style={{ opacity: 1 - i * 0.2 }}>
                      <div className="skeleton h-3 w-32 mb-2.5" />
                      <div className="skeleton h-2.5 w-full mb-1.5" />
                      <div className="skeleton h-2.5 w-3/4" />
                    </div>
                  ))}
                </div>
              ) : aiMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-14 h-14 mb-4 rounded-full border border-[var(--color-border-rule)] flex items-center justify-center dot-grid">
                    <Bot className="w-5 h-5 text-[var(--color-text-muted)]" strokeWidth={1.25} />
                  </div>
                  <p
                    className="text-[var(--color-navy)] mb-1"
                    style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.0625rem', fontWeight: 500 }}
                  >
                    No conversations yet.
                  </p>
                  <p className="text-[0.8125rem] text-[var(--color-text-soft)] max-w-xs">
                    Chat with the AI Assistant first to generate responses you can save here.
                  </p>
                </div>
              ) : (
                aiMessages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => addNoteFromAI(msg)}
                    className="w-full text-left p-4 rounded-lg border border-[var(--color-border-hairline)] hover:border-[var(--color-navy)] bg-[var(--color-surface-white)] hover:bg-[var(--color-surface-elevated)] transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[var(--color-navy)] mb-1.5 truncate"
                          style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '0.9375rem', fontWeight: 500, letterSpacing: '-0.018em' }}
                        >
                          {msg.question || 'AI Response'}
                        </p>
                        <p className="text-[0.8125rem] text-[var(--color-text-body)] line-clamp-2 leading-relaxed">
                          {msg.text.replace(/[#*_~`>]/g, '').substring(0, 200)}
                          {msg.text.length > 200 ? '…' : ''}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-soft)] mt-2 font-semibold">
                          {new Date(msg.createdAt).toLocaleDateString()} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="w-7 h-7 rounded-md border border-[var(--color-border-hairline)] flex items-center justify-center text-[var(--color-text-soft)] group-hover:bg-[var(--color-navy)] group-hover:text-white group-hover:border-[var(--color-navy)] transition shrink-0">
                        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Subject Confirmation */}
      <ConfirmModal
        open={!!deleteSubjectTarget}
        title="Delete Folder?"
        message={`This will permanently delete "${deleteSubjectTarget}" along with its pages, tasks and documents. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteSubjectTarget) return;
          try {
            await deleteSubjectAPI(deleteSubjectTarget);
            setSubjects(subjects.filter(s => s !== deleteSubjectTarget));
            setPages(pages.filter(p => p.subject !== deleteSubjectTarget));
            setTasks(prev => prev.filter(t => t.subject !== deleteSubjectTarget));
            setUploadedFiles(prev => prev.filter(f => f.subject !== deleteSubjectTarget));
            if (selectedSubject === deleteSubjectTarget) {
              const remaining = subjects.filter(s => s !== deleteSubjectTarget);
              setSelectedSubject(remaining[0] || '');
              setSelectedPage(null);
              setMobileView('list');
            }
          } catch (err) {
            console.error('Failed to delete subject:', err);
          } finally {
            setDeleteSubjectTarget(null);
          }
        }}
        onCancel={() => setDeleteSubjectTarget(null)}
      />

      {/* Share Folder Modal */}
      {shareTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,11,51,0.4)] backdrop-blur-sm p-4 fade-in"
          onClick={() => setShareTarget(null)}
        >
          <div
            className="bg-[var(--color-surface-white)] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-[var(--color-border-hairline)]"
            style={{ boxShadow: 'var(--shadow-modal)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-7 pt-6 pb-5 border-b border-[var(--color-border-hairline)] flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <p className="label !mb-2">Share folder</p>
                <h3
                  className="text-[var(--color-navy)] truncate"
                  style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.375rem', fontWeight: 500, letterSpacing: '-0.025em' }}
                >
                  {shareTarget}
                </h3>
                <p className="text-[0.8125rem] text-[var(--color-text-muted)] mt-1.5">
                  Give another MediHub user access to this folder&apos;s notes, tasks and documents.
                </p>
              </div>
              <button
                onClick={() => setShareTarget(null)}
                className="text-[var(--color-text-soft)] hover:text-[var(--color-navy)] hover:bg-[var(--color-surface-elevated)] p-2 rounded-md transition shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            {/* Body */}
            <div className="px-7 py-5 space-y-4 overflow-y-auto">
              {/* Permission toggle — sets the access for the next person you pick */}
              <div>
                <label className="label !mb-1.5 block">They can</label>
                <div className="nb-scope" role="group" aria-label="Permission">
                  <button
                    type="button"
                    onClick={() => setSharePermission('view')}
                    data-active={sharePermission === 'view'}
                    className="nb-scope-btn"
                  >
                    <Lock className="w-3 h-3 inline mr-1 -mt-0.5" strokeWidth={2} /> View only
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharePermission('edit')}
                    data-active={sharePermission === 'edit'}
                    className="nb-scope-btn"
                  >
                    <Pencil className="w-3 h-3 inline mr-1 -mt-0.5" strokeWidth={2} /> Can edit
                  </button>
                </div>
              </div>

              {/* User picker — search MediHub users, click one to share */}
              <div>
                <label className="label !mb-1.5 block">Add a person</label>
                <div className="flex items-center gap-2 bg-[var(--color-surface-white)] border border-[var(--color-border-hairline)] rounded-md px-3 py-2 focus-within:border-[var(--color-navy)] transition-colors">
                  <Search className="w-3.5 h-3.5 text-[var(--color-text-soft)] shrink-0" strokeWidth={1.75} />
                  <input
                    type="text"
                    value={shareSearchQuery}
                    onChange={(e) => handleShareSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-[0.8125rem] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-soft)]"
                    autoFocus
                  />
                  {shareBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-text-soft)]" strokeWidth={2} />}
                </div>

                {/* Results */}
                <div className="mt-2 space-y-1.5 max-h-52 overflow-y-auto">
                  {shareSearching ? (
                    [0, 1, 2].map(i => (
                      <div key={i} className="flex items-center gap-2.5 px-2.5 py-2" style={{ opacity: 1 - i * 0.25 }}>
                        <div className="skeleton w-7 h-7 rounded-full shrink-0" />
                        <div className="flex-1">
                          <div className="skeleton h-3 w-24 mb-1.5" />
                          <div className="skeleton h-2.5 w-36" />
                        </div>
                      </div>
                    ))
                  ) : shareSearchQuery && shareSearchResults.length === 0 ? (
                    <p className="text-[0.8125rem] text-[var(--color-text-soft)] italic px-1 py-2" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                      No users found for &ldquo;{shareSearchQuery}&rdquo;.
                    </p>
                  ) : (
                    shareSearchResults.map(u => {
                      const alreadyShared = existingShares.some(s => s.user.id === u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => shareWithUser(u)}
                          disabled={shareBusy}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-[var(--color-surface-elevated)] border border-transparent hover:border-[var(--color-border-hairline)] transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="w-7 h-7 rounded-full bg-[var(--color-blue-soft)] text-[var(--color-navy)] flex items-center justify-center text-[11px] font-bold uppercase shrink-0">
                            {u.name?.charAt(0) || '?'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-primary)] truncate">{u.name}</div>
                            <div className="text-[11px] text-[var(--color-text-soft)] truncate">{u.email}</div>
                          </div>
                          {alreadyShared
                            ? <span className="nb-chip shrink-0">Update</span>
                            : <Plus className="w-3.5 h-3.5 text-[var(--color-text-soft)] shrink-0" strokeWidth={2} />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {shareError && (
                <p className="text-[0.8125rem] text-red-500">{shareError}</p>
              )}

              {/* Existing shares */}
              <div className="pt-2 border-t border-[var(--color-border-hairline)]">
                <p className="label !mb-2.5 !mt-3">People with access</p>
                {loadingShares ? (
                  <div className="space-y-2">
                    {[0, 1].map(i => (
                      <div key={i} className="skeleton h-11 w-full rounded-md" style={{ opacity: 1 - i * 0.3 }} />
                    ))}
                  </div>
                ) : existingShares.length === 0 ? (
                  <p className="text-[0.8125rem] text-[var(--color-text-soft)] italic" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                    Not shared with anyone yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {existingShares.map(s => (
                      <div key={s.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-[var(--color-surface-elevated)] border border-[var(--color-border-hairline)]">
                        <span className="w-7 h-7 rounded-full bg-[var(--color-blue-soft)] text-[var(--color-navy)] flex items-center justify-center text-[11px] font-bold uppercase shrink-0">
                          {s.user.name?.charAt(0) || '?'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[0.8125rem] font-semibold text-[var(--color-text-primary)] truncate">{s.user.name}</div>
                          <div className="text-[11px] text-[var(--color-text-soft)] truncate">{s.user.email}</div>
                        </div>
                        <span className="nb-chip shrink-0">{s.permission === 'edit' ? 'Edit' : 'View'}</span>
                        <button
                          onClick={() => revokeShare(s.user.id)}
                          className="text-[var(--color-text-soft)] hover:text-red-500 transition p-1 rounded shrink-0"
                          aria-label={`Remove ${s.user.name}`}
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
