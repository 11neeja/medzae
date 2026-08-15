'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  BookOpen,
  Users,
  TrendingUp,
  Mail,
  Send,
  Loader2,
  Stethoscope,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import SessionSplash from '@/components/SessionSplash';
import { useAuth, hasStoredSession } from '@/context/AuthContext';
import { sendContactMessageAPI } from '@/lib/api';
import { jsonLd } from '@/lib/seo';

// Where the "Get in touch" form is delivered (kept in sync with the backend
// CONTACT_RECIPIENT_EMAIL default) and shown as the public contact address.
const CONTACT_EMAIL = 'suva.neeja11@gmail.com';

const ECOSYSTEM_PILLS = [
  'Medical Students',
  'Doctors',
  'Professors',
  'Researchers',
  'News Feed',
  'Events',
  'Groups',
  'AI Assistant',
];

const FEATURES = [
  {
    icon: Clock,
    title: 'News Feed and Events',
    description:
      'Stay current with curated medical updates and discover conferences, workshops, and seminars in one place.',
  },
  {
    icon: BookOpen,
    title: 'Notebook Workspace',
    description:
      'Organize notes, PDFs, task lists, and references by subject with a clean, distraction-free workspace.',
  },
  {
    icon: Users,
    title: 'Groups and Chat',
    description:
      'Connect with peers through communities and direct chat for discussions, case sharing, and support.',
  },
  {
    icon: TrendingUp,
    title: 'AI Study Assistant',
    description:
      'Ask medical questions, summarize documents, and save study-ready insights directly into your notes.',
  },
];

const STATS = [
  { value: '7', label: 'Tools Unified in One Platform' },
  // Grounded in the NewsAPI integration (see backend/newsController.js): the
  // feed is drawn from a large global source network, health-filtered.
  { value: '50K+', label: 'Global Medical News Sources' },
  { value: '24/7', label: 'AI-Powered Study Assistance' },
  { value: '100%', label: 'Focus on Learning and Collaboration' },
];

const FAQ_ITEMS = [
  {
    question: 'What is Medzae?',
    answer:
      'Medzae is an all-in-one medical platform — a digital health hub where medical students, doctors, professors, and researchers read curated medical news, discover events, organize notebooks, join groups, chat in real time, and study with an AI assistant. It is free to join and runs in any modern browser.',
  },
  {
    question: 'Who is Medzae designed for?',
    answer:
      'Medzae is built for medical students, doctors, professors, and researchers who need one organized hub for daily learning and collaboration.',
  },
  {
    question: 'Can I use it for both study and community interactions?',
    answer:
      'Yes. Medzae combines study tools like notebooks and AI summaries with community features such as groups, chat, and a professional feed in one platform.',
  },
  {
    question: 'How does the AI assistant help?',
    answer:
      'The AI assistant can answer medical questions, summarize uploaded documents, and help you capture study-ready insights you can save to your notebook.',
  },
  {
    question: 'Is Medzae beginner-friendly?',
    answer:
      'Absolutely. The interface is designed to be calm and intuitive, so you can get started quickly whether you are new to digital study tools or switching from multiple apps.',
  },
];

const HERO_IMAGES: { src: string; alt: string }[] = [
  {
    src: 'https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=1400&h=800&fit=crop&q=80',
    alt: 'Medical professionals performing surgery in an operating room',
  },
  {
    src: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=1400&h=800&fit=crop&q=80',
    alt: 'Doctor consulting with a patient in a clinic',
  },
  {
    src: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1400&h=800&fit=crop&q=80',
    alt: 'Medical research team in a modern clinical environment',
  },
  {
    src: 'https://images.unsplash.com/photo-1666214280391-8ff5bd3c0bf0?w=1400&h=800&fit=crop&q=80',
    alt: 'Medical students collaborating with study materials',
  },
];
const HERO_ROTATION_MS = 5000;
const FEEDBACK_IMAGE_1 =
  'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=700&h=500&fit=crop&q=80';
const FEEDBACK_IMAGE_2 =
  'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=700&fit=crop&q=80';

export default function LandingPage() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [openFaq, setOpenFaq] = useState(0);
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [messageSent, setMessageSent] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [sessionHint, setSessionHint] = useState(false);
  const { loading, isAuthenticated } = useAuth();
  const router = useRouter();

  // Auto-rotate hero images
  useEffect(() => {
    const timer = setInterval(() => {
      setHeroImageIndex((i) => (i + 1) % HERO_IMAGES.length);
    }, HERO_ROTATION_MS);
    return () => clearInterval(timer);
  }, []);

  // Runs after hydration only — keeps server and first client render identical.
  useEffect(() => {
    setSessionHint(hasStoredSession());
  }, []);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace('/home');
    }
  }, [loading, isAuthenticated, router]);

  // The landing content always renders (and is part of the prerendered HTML),
  // so first paint never waits on the backend. The splash overlays it only
  // while a stored session is being restored or the redirect to /home runs.
  const restoringSession = (sessionHint && loading) || isAuthenticated;

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sendingMessage) return;
    setContactError(null);
    setSendingMessage(true);
    try {
      await sendContactMessageAPI(formData);
      setFormData({ name: '', email: '', message: '' });
      setMessageSent(true);
      window.setTimeout(() => setMessageSent(false), 4000);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'We couldn’t send your message just now. Please try again in a moment.';
      setContactError(message);
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-[var(--color-navy)]">
      {/* FAQ structured data — mirrors the visible FAQ section below and
          makes the landing page eligible for FAQ rich results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ITEMS.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: item.answer },
            })),
          }),
        }}
      />
      {restoringSession && <SessionSplash />}

      {/* ── Hero copy ───────────────────────────────────────── */}
      <section
        id="home"
        className="relative overflow-hidden flex items-center justify-center min-h-[calc(100vh-72px)] py-20 md:py-24"
      >
        {/* Watermark — very subtle, behind the heading */}
        <p
          aria-hidden
          className="pointer-events-none absolute left-1/2 select-none text-center whitespace-nowrap opacity-60"
          style={{
            fontFamily: 'var(--font-fraunces), serif',
            fontStyle: 'italic',
            fontWeight: 400,
            fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1",
            fontSize: 'clamp(6rem, 22vw, 20rem)',
            lineHeight: 1,
            zIndex: 0,
            bottom: '4%',
            transform: 'translateX(-50%)',
            color: '#E8ECF4',
            letterSpacing: '-0.04em',
          }}
        >
          Medzae
        </p>

        {/* Decorative gradient orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-32 w-[420px] h-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-accent-soft) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[var(--color-border-hairline)] text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)] shadow-hairline mb-8 fade-in-up">
            <BadgeCheck className="w-3.5 h-3.5 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
            The future of medical learning
          </div>

          <h1
            className="text-[var(--color-navy)] mb-7 fade-in-delay-1"
            style={{
              fontFamily: 'var(--font-fraunces), serif',
              fontSize: 'clamp(3rem, 8vw, 6.5rem)',
              fontWeight: 400,
              fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1",
              letterSpacing: '-0.04em',
              lineHeight: 0.98,
            }}
          >
            <span className="sr-only">Medzae — </span>A practice for
            <br />
            <span className="serif-accent">medical minds</span>.
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-[var(--color-text-secondary)] leading-relaxed max-w-2xl mx-auto mb-10 fade-in-delay-2">
            Welcome to Medzae — the all-in-one medical platform for learning and collaboration.
            News, events, notes, groups, messaging, and an AI study assistant, all in one calm place.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 fade-in-delay-3">
            <Link
              href="/signup"
              className="btn-primary !px-8 !py-3.5 text-base inline-flex items-center gap-2"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className="btn-secondary !px-8 !py-3.5 text-base bg-white"
            >
              Explore Features
            </button>
          </div>

        </div>
      </section>

      {/* ── Hero image ────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 pb-20 md:pb-28">
        <div className="max-w-6xl mx-auto relative pb-6">
          <div className="relative rounded-[2.5rem] overflow-hidden shadow-[0_24px_64px_rgba(0,11,51,0.12)] bg-[var(--color-surface-muted)]">
            <div className="relative w-full h-[280px] sm:h-[380px] md:h-[480px]">
              {HERO_IMAGES.map((image, i) => (
                <img
                  key={image.src}
                  src={image.src}
                  alt={image.alt}
                  aria-hidden={i !== heroImageIndex}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity [transition-duration:1200ms] ease-in-out ${
                    i === heroImageIndex ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              ))}
            </div>

            {/* Dot indicators */}
            <div className="absolute bottom-5 left-5 sm:bottom-6 sm:left-6 flex items-center gap-2 z-10">
              {HERO_IMAGES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setHeroImageIndex(i)}
                  aria-label={`Show slide ${i + 1}`}
                  aria-current={i === heroImageIndex}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === heroImageIndex
                      ? 'w-8 bg-white'
                      : 'w-2 bg-white/50 hover:bg-white/80'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="absolute -bottom-6 right-6 sm:right-10 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,11,51,0.18)] border border-[var(--color-border-light)] p-4 sm:p-5 flex items-center gap-4 max-w-xs z-10">
            <div className="w-11 h-11 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center shrink-0">
              <Stethoscope className="w-5 h-5 text-[var(--color-blue-primary)]" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                AI Study Assistant
              </p>
              <p className="text-sm sm:text-base font-bold text-[var(--color-navy)] truncate">
                Summarizing paper...
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ecosystem pills ───────────────────────────────────── */}
      <section className="py-12 md:py-16 bg-white border-y border-[#EEF2F6]">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-8">
            Built for the entire medical ecosystem
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {ECOSYSTEM_PILLS.map((pill) => (
              <span
                key={pill}
                className="px-5 py-2.5 rounded-full bg-[#F8FAFC] border border-[#E8EDF3] text-sm font-medium text-[var(--color-navy)]"
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section id="features" className="py-16 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <p className="label justify-center !mb-4">The Toolkit</p>
            <h2 className="heading-1 mb-6">
              Powerful features, <span className="serif-accent">one</span> platform.
            </h2>
            <p className="text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed">
              Medical professionals and students often juggle separate tools for news, events, notes,
              communication, and study resources. Medzae brings everything together
              in one seamless experience.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="relative bg-white rounded-2xl border border-[var(--color-border-hairline)] p-8 shadow-premium hover-lift"
                >
                  <span
                    aria-hidden
                    className="absolute top-7 right-7 text-[var(--color-border-strong)] tabular-nums"
                    style={{ fontFamily: 'var(--font-fraunces), serif', fontStyle: 'italic', fontSize: '1rem' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-soft)] border border-[rgba(11,59,145,0.1)] flex items-center justify-center mb-6">
                    <Icon className="w-5 h-5 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
                  </div>
                  <h3
                    className="text-[var(--color-navy)] mb-3"
                    style={{
                      fontFamily: 'var(--font-fraunces), serif',
                      fontSize: '1.1875rem',
                      fontWeight: 500,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.25,
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Community feedback ────────────────────────────────── */}
      <section className="py-16 md:py-24 bg-[#F8FAFC]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="grid grid-cols-2 gap-4">
              <img
                src={FEEDBACK_IMAGE_1}
                alt="Modern operating room"
                className="w-full h-48 sm:h-64 object-cover rounded-3xl"
              />
              <img
                src={FEEDBACK_IMAGE_2}
                alt="Medical professional working on laptop"
                className="w-full h-56 sm:h-72 object-cover rounded-3xl mt-8"
              />
            </div>

            <div>
              <p className="label !mb-5">Community feedback</p>
              <blockquote
                className="text-[var(--color-navy)] mb-8"
                style={{
                  fontFamily: 'var(--font-fraunces), serif',
                  fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
                  fontWeight: 450,
                  fontVariationSettings: "'opsz' 120, 'SOFT' 40",
                  letterSpacing: '-0.025em',
                  lineHeight: 1.25,
                }}
              >
                &ldquo;Medzae finally gave us one <span className="serif-accent">calm space</span> for updates, discussions, and study
                resources without switching between apps.&rdquo;
              </blockquote>
              <div className="flex items-center gap-4">
                <Avatar className="w-12 h-12 bg-[var(--color-navy)]">
                  <AvatarFallback className="bg-[var(--color-navy)] text-white text-sm font-semibold">
                    MC
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-[var(--color-navy)]">Medzae Community Member</p>
                  <p className="text-sm text-[var(--color-text-muted)]">Medical Student</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────────── */}
      <section className="py-16 md:py-20 bg-[var(--color-navy)] text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 text-center">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <p
                  className="text-white/95 mb-3 tabular-nums"
                  style={{
                    fontFamily: 'var(--font-fraunces), serif',
                    fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
                    fontWeight: 400,
                    fontVariationSettings: "'opsz' 144, 'SOFT' 50",
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </p>
                <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-white/60 leading-relaxed max-w-[200px] mx-auto">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <section id="faq" className="py-16 md:py-24 bg-[#F8FAFC]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="label justify-center !mb-4">Before you begin</p>
            <h2 className="heading-1 mb-4">
              Questions, <span className="serif-accent">answered</span>.
            </h2>
            <p className="text-[var(--color-text-secondary)]">
              Everything you need to know before getting started.
            </p>
          </div>

          <div className="space-y-4">
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={item.question}
                  className={`bg-white rounded-2xl border shadow-premium overflow-hidden transition-colors ${
                    isOpen ? 'border-[var(--color-border-mid)]' : 'border-[var(--color-border-hairline)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                    className="w-full flex items-center justify-between gap-4 p-6 sm:p-7 text-left group"
                  >
                    <span
                      className="text-[var(--color-navy)] pr-4"
                      style={{
                        fontFamily: 'var(--font-fraunces), serif',
                        fontSize: '1.125rem',
                        fontWeight: 500,
                        letterSpacing: '-0.018em',
                        lineHeight: 1.3,
                      }}
                    >
                      {item.question}
                    </span>
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                      isOpen
                        ? 'bg-[var(--color-navy)] border-[var(--color-navy)]'
                        : 'bg-[var(--color-surface-muted)] border-[var(--color-border-hairline)] group-hover:bg-[var(--color-accent-soft)]'
                    }`}>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-white" strokeWidth={1.75} />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" strokeWidth={1.75} />
                      )}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-6 sm:px-7 pb-6 sm:pb-7 -mt-1 fade-in">
                      <p className="text-[var(--color-text-secondary)] leading-relaxed border-t border-[var(--color-border-hairline)] pt-4">
                        {item.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────── */}
      <section id="contact" className="py-16 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <div>
              <p className="label !mb-4">Correspondence</p>
              <h2 className="heading-1 mb-6">
                Get in <span className="serif-accent">touch</span>.
              </h2>
              <p className="text-[var(--color-text-secondary)] leading-relaxed mb-8 max-w-md">
                Have questions? We would love to hear from you. Drop us a line and our team will get
                back to you shortly.
              </p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-[var(--color-accent-soft)] border border-[var(--color-border-mid)] max-w-full"
              >
                <span className="w-9 h-9 rounded-full bg-[var(--color-blue-primary)] flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-white" />
                </span>
                <span className="font-semibold text-[var(--color-navy)] truncate">{CONTACT_EMAIL}</span>
              </a>
            </div>

            <div className="bg-white rounded-[2rem] border border-[#EEF2F6] shadow-[0_16px_48px_rgba(11,59,145,0.08)] p-8 sm:p-10">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="name" className="field-label">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Your name"
                    className="input bg-[#F8FAFC] border-[#E8EDF3]"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="field-label">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="you@example.com"
                    className="input bg-[#F8FAFC] border-[#E8EDF3]"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="message" className="field-label">
                    Message
                  </label>
                  <textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="How can we help?"
                    rows={4}
                    className="input bg-[#F8FAFC] border-[#E8EDF3] resize-none"
                    required
                  />
                </div>
                {contactError && (
                  <p role="alert" className="text-sm text-red-600 -mt-1">
                    {contactError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={sendingMessage}
                  className="w-full btn-primary !py-4 !text-sm inline-flex items-center justify-center gap-2 !rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {sendingMessage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                      Sending…
                    </>
                  ) : messageSent ? (
                    <>
                      <BadgeCheck className="w-4 h-4" strokeWidth={1.75} />
                      Message sent — we&rsquo;ll be in touch
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" strokeWidth={1.75} />
                      Send message
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-[#F1F5F9]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="label justify-center !mb-4">Join the practice</p>
          <h2 className="heading-1 mb-6">
            Ready to simplify your <span className="serif-accent">medical workflow</span>?
          </h2>
          <p className="text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed mb-10">
            Join thousands of medical professionals using Medzae to learn faster, collaborate better,
            and stay organized.
          </p>
          <Link
            href="/signup"
            className="btn-primary !px-10 !py-4 !text-sm inline-flex items-center gap-2"
          >
            Get started now
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="bg-[var(--color-navy)] text-white py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <p
              style={{
                fontFamily: 'var(--font-fraunces), serif',
                fontSize: '1.375rem',
                fontWeight: 500,
                letterSpacing: '-0.035em',
                fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1",
              }}
            >
              Med<span className="italic font-normal">zae</span>
            </p>
            <p className="text-xs text-white/50 mt-1.5 max-w-[260px] leading-relaxed">
              The medical learning platform for students, doctors, professors, and researchers.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-white/70">
            <button type="button" onClick={() => scrollToSection('features')} className="hover:text-white transition-colors">
              Features
            </button>
            <button type="button" onClick={() => scrollToSection('faq')} className="hover:text-white transition-colors">
              FAQ
            </button>
            <button type="button" onClick={() => scrollToSection('contact')} className="hover:text-white transition-colors">
              Contact
            </button>
            <Link href="/login" className="hover:text-white transition-colors">
              Log In
            </Link>
            <Link href="/signup" className="hover:text-white transition-colors">
              Sign Up
            </Link>
          </div>
          <p className="text-sm text-white/50">&copy; {new Date().getFullYear()} Medzae</p>
        </div>
      </footer>
    </div>
  );
}