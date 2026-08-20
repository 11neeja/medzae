/**
 * Zae — the character behind Medzae's AI assistant.
 *
 * Everything the app says about her lives here, so the chat header, the message
 * list and her profile page can never drift apart. The wording below describes
 * the assistant as it actually behaves: the capabilities and the limits mirror
 * SYSTEM_PROMPT in `backend/src/controllers/aiController.js`. If that prompt
 * changes, change this too.
 */

export const ZAE = {
  /** What she is called on her own. */
  name: 'Zae',
  /** How she signs a message — the character, then the product she speaks for. */
  chatName: 'Zae · Medzae AI',
  role: "Medzae's AI assistant",
  headline: 'Medical study assistant · here for questions, notes and documents',

  /** Tight face crop, legible down to 28px. */
  avatar: '/zae-avatar.png',
  /** Full character art, for her profile hero. */
  portrait: '/zae-full.png',

  profileHref: '/zae',

  intro:
    "Hi, I'm Zae — Medzae's AI assistant. I help medical students and healthcare professionals study: ask me anything across medicine and the health sciences, or hand me a document and I'll work through it with you.",

  about: [
    "I'm built for one subject and I stay in it. Clinical medicine, the basic sciences, public health, medical statistics, exam preparation, medical careers — that's my ground, and I try to answer with real values, mechanisms and reference ranges rather than generalities.",
    'When you upload something — a lab report, a prescription, imaging, lecture slides, your own notes — I read what is actually in it and answer from its real contents, quoting the values and wording it contains rather than guessing at what it probably says.',
  ],

  /** What she is good for. Kept concrete — each line is something she does. */
  strengths: [
    {
      title: 'Medical questions, answered directly',
      body: 'Reference ranges, mechanisms, drug classes, diagnostic criteria. The answer comes first, without preamble.',
    },
    {
      title: 'Documents read properly',
      body: 'PDFs, slides, images, CSVs. For lab reports I pull out each result, compare it against the range printed on the report, flag what is high or low, and read the overall pattern.',
    },
    {
      title: 'Teaching, when you want teaching',
      body: 'Ask me to explain rather than state, and you get structure — headings, a comparison table where it helps, and a mnemonic where a good one exists.',
    },
    {
      title: 'Straight into your notebook',
      body: 'Any answer can be saved to a notebook page, so what you learn in a conversation stays with your study material.',
    },
  ],

  /** Said plainly, because a medical tool should be honest about its edges. */
  limits: [
    'I only do medicine and the health sciences. Coding, maths homework, essays and general trivia are outside what I am for, and I will say so rather than half-answer.',
    'I am a study aid, not a clinician. I am here to help you learn and revise — I do not diagnose patients, and nothing I say substitutes for clinical judgement or local guidelines.',
    'I can be wrong. Check anything that matters against a primary source before you rely on it in an exam or on a ward.',
  ],

  /** Answers the "what is she, really" question without hand-waving. */
  underTheHood:
    "I run on Google's Gemini models through Medzae's own backend, with a fallback chain so a retired model never leaves you without an answer. Your conversations and documents are used to answer you — nothing about them is sold or shared.",
} as const;
