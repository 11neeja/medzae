'use client';

import { createContext, useContext, ReactNode } from 'react';
import { createNoteAPI } from '@/lib/api';

// The notebook's block vocabulary — kept in step with markdownToBlocks, which
// is what feeds this in the AI save flows.
interface NoteBlock {
  type:
    | 'heading' | 'subheading' | 'text' | 'bullet' | 'numbered'
    | 'checklist' | 'quote' | 'callout' | 'code' | 'divider';
  text: string;
  checked?: boolean;
}

interface AddNoteParams {
  subject: string;
  title: string;
  content?: string;
  blocks?: NoteBlock[];
  tags?: string[];
}

interface AppContextType {
  addNote: (note: AddNoteParams) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  // Throws on failure — callers show a toast, so swallowing the error here
  // would report a save that never happened.
  const addNote = async (note: AddNoteParams) => {
    const blocks = note.blocks && note.blocks.length > 0
      ? note.blocks
      : [{ type: 'text' as const, text: note.content || '' }];

    await createNoteAPI({
      title: note.title,
      subject: note.subject,
      blocks,
      tags: note.tags || ['AI Assistant'],
    });
  };

  return (
    <AppContext.Provider value={{ addNote }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
