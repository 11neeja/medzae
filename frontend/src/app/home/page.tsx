'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ResizableSidebar from '@/components/ResizableSidebar';
import FollowInstagram from '@/components/FollowInstagram';
import { getNewsAPI, getTrendingTopicsAPI } from '@/lib/api';
import {
  Star,
  Microscope,
  Newspaper,
  Search,
  Stethoscope,
  TrendingUp,
  Calendar,
  Bot,
  X,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// NewsItem interface matching backend response
interface NewsItem {
  id: string;
  title: string;
  summary: string;
  imageUrl: string;
  url: string;
  tags: string[];
  source: string;
  specialty: string;
  timeAgo: string;
  publishedAt: string;
  featured?: boolean;
}

const specialties = [
  'All',
  'General Medicine',
  'Cardiology',
  'Neurology',
  'Surgery',
  'Pediatrics',
  'Research & Trials',
];

export default function HomePage() {
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const NEWS_PER_PAGE = 5;

  // Fetch news from the backend (which uses 24hr cached NewsAPI data)
  const fetchNews = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const articles = await getNewsAPI({
        specialty: selectedSpecialty,
        search: searchQuery,
        sort: sortBy,
      });
      setNewsData(articles);
    } catch (err: any) {
      console.error('Failed to fetch news:', err);
      setError('Failed to load news. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedSpecialty, searchQuery, sortBy]);

  // Fetch trending topics once
  useEffect(() => {
    getTrendingTopicsAPI()
      .then(setTrendingTopics)
      .catch(() => setTrendingTopics(['AI in Radiology', 'mRNA Vaccine Technology', 'Personalized Medicine', 'Mental Health Innovation']));
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const featuredArticle = newsData.find(item => item.featured) || newsData[0];

  // Pagination
  const totalPages = Math.ceil(newsData.length / NEWS_PER_PAGE);
  const paginatedNews = newsData.slice(
    (currentPage - 1) * NEWS_PER_PAGE,
    currentPage * NEWS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSpecialty, searchQuery, sortBy]);

  const suggestedArticles = newsData
    .filter(item => selectedSpecialty !== 'All' && item.specialty === selectedSpecialty)
    .slice(0, 3);

  const handleArticleClick = (article: NewsItem) => {
    if (article.url) {
      window.open(article.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="min-h-screen">
      <div className="page-container !pb-6">
      {/* Editorial masthead */}
      <header className="relative mb-10 pb-10 border-b border-[var(--color-border-rule)] animate-section">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <div className="flex-1 max-w-3xl">
            <div className="flex items-center gap-4 mb-5">
              <p className="label !mb-0">Volume I &middot; The Daily Brief</p>
              <span className="hidden md:inline text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-soft)] font-semibold">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <h1 className="heading-hero mb-4">
              Medical <span className="serif-accent">news</span>,
              <br />distilled for the <span className="serif-accent">practitioner</span>.
            </h1>
            <p className="body-lg max-w-xl text-[var(--color-text-secondary)]">
              Curated insights across specialties — a quiet corner of the internet for clinicians, researchers, and students.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link href="/assistant" className="btn-primary inline-flex items-center gap-2">
              <Bot className="w-4 h-4" strokeWidth={1.75} />
              Ask the AI
            </Link>
            <Link href="/events" className="btn-secondary inline-flex items-center gap-2">
              <Calendar className="w-4 h-4" strokeWidth={1.75} />
              Browse events
            </Link>
          </div>
        </div>
      </header>

      <div>
        {/* Today's Highlight — editorial cover story */}
        {!loading && featuredArticle && (
          <div
            onClick={() => handleArticleClick(featuredArticle)}
            className="relative cursor-pointer mb-10 group fade-in-delay-1 gradient-ink rounded-2xl overflow-hidden"
            style={{ boxShadow: 'var(--shadow-hover)' }}
          >
            <div aria-hidden className="absolute inset-0 dot-grid opacity-[0.08]" />
            <div aria-hidden className="absolute top-0 right-0 w-1/2 h-full opacity-30 shimmer" />

            <div className="relative grid md:grid-cols-5 gap-0">
              <div className="md:col-span-3 p-8 md:p-12 lg:p-14 flex flex-col justify-between min-h-[24rem]">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-white/70">
                      <Star className="w-3 h-3 fill-current" /> Cover Story
                    </span>
                    <span className="h-px w-12 bg-white/30" />
                    <span className="text-[10px] uppercase tracking-[0.22em] text-white/50 font-semibold">
                      {featuredArticle.specialty || 'Medicine'}
                    </span>
                  </div>
                  <h2
                    className="text-white mb-5"
                    style={{
                      fontFamily: 'var(--font-fraunces), serif',
                      fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                      fontWeight: 400,
                      lineHeight: 1.08,
                      letterSpacing: '-0.03em',
                      fontVariationSettings: "'opsz' 144, 'SOFT' 50",
                    }}
                  >
                    {featuredArticle.title}
                  </h2>
                  <p className="text-white/75 leading-relaxed mb-6 max-w-2xl" style={{ fontSize: '1rem' }}>
                    {featuredArticle.summary}
                  </p>
                </div>
                <div>
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {featuredArticle.tags.slice(0, 4).map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] uppercase tracking-wider font-semibold text-white/80 border border-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-white/60 text-xs uppercase tracking-wider font-semibold">
                    <span>{featuredArticle.source}</span>
                    <span className="w-1 h-1 rounded-full bg-white/40" />
                    <span>{featuredArticle.timeAgo}</span>
                    <span className="ml-auto inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                      Read story <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="hidden md:block md:col-span-2 relative">
                <div className="absolute inset-0">
                  {featuredArticle.imageUrl ? (
                    <img
                      src={featuredArticle.imageUrl}
                      alt={featuredArticle.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Microscope className="w-24 h-24 text-white/30" strokeWidth={1} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[var(--color-navy)]/60" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main 3-Column Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Sidebar - Filters */}
          <ResizableSidebar side="left" defaultWidth={280} minWidth={200} maxWidth={400} responsive>
          <aside className="w-full">
            <div className="card p-7 lg:sticky lg:top-24">
              <p className="label !mb-5">Sections</p>
              <h2 className="heading-3 mb-5">Specialties</h2>
              <nav className="space-y-0.5 -mx-2">
                {specialties.map(specialty => (
                  <button
                    key={specialty}
                    onClick={() => setSelectedSpecialty(specialty)}
                    className={`w-full text-left px-3 py-2.5 rounded-md transition-smooth flex items-center justify-between group ${
                      selectedSpecialty === specialty
                        ? 'bg-[var(--color-navy)] text-white font-semibold'
                        : 'text-[var(--color-text-body)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-navy)]'
                    }`}
                  >
                    <span className="text-[0.875rem] tracking-tight">{specialty}</span>
                    {selectedSpecialty === specialty && (
                      <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                    )}
                  </button>
                ))}
              </nav>

              {/* Active Filters Indicator */}
              {(selectedSpecialty !== 'All' || searchQuery) && (
                <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--color-border-hairline)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-[var(--color-text-muted)]">Active Filters</span>
                    <button
                      onClick={() => {
                        setSelectedSpecialty('All');
                        setSearchQuery('');
                      }}
                      className="text-xs text-[var(--color-blue-primary)] hover:underline font-medium"
                    >
                      Clear all
                    </button>
                  </div>
                  {selectedSpecialty !== 'All' && (
                    <div className="badge inline-flex items-center gap-2 font-medium">
                      {selectedSpecialty}
                      <button onClick={() => setSelectedSpecialty('All')} className="hover:opacity-90 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
          </ResizableSidebar>

          {/* Center - Main News Feed */}
          <main className="flex-1 min-w-0">
            {/* Search and Sort Controls */}
            <div className="mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-soft)]" strokeWidth={1.75} />
                <input
                  type="text"
                  placeholder="Search the archive…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="input !pl-11"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'latest' | 'popular')}
                className="input sm:w-auto !pr-10"
              >
                <option value="latest">Latest</option>
                <option value="popular">Popular</option>
              </select>
            </div>

            {/* Results Count — editorial column rule */}
            <div className="flex items-center gap-3 mb-6 text-[var(--color-text-muted)]">
              <span className="text-[11px] uppercase tracking-[0.18em] font-semibold">
                {newsData.length} {newsData.length === 1 ? 'article' : 'articles'}
                {totalPages > 1 && <> &middot; Page {currentPage}/{totalPages}</>}
              </span>
              <span className="flex-1 h-px bg-[var(--color-border-rule)]" />
            </div>

            {/* Pagination Controls (Top) */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mb-6">
                <button
                  onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={currentPage === 1}
                  className="pagination-btn"
                >
                  <ChevronLeft className="w-5 h-5 text-[var(--color-blue-primary)]" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    if (page === 1 || page === totalPages) return true;
                    if (Math.abs(page - currentPage) <= 1) return true;
                    return false;
                  })
                  .reduce<(number | string)[]>((acc, page, idx, arr) => {
                    if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    typeof item === 'string' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">...</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => { setCurrentPage(item); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-10 h-10 rounded-lg font-semibold text-sm transition ${
                          currentPage === item
                            ? 'gradient-primary text-white shadow-premium'
                                : 'pagination-page'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentPage === totalPages} className="pagination-btn">
                  <ChevronRight className="w-5 h-5 text-[var(--color-blue-primary)]" />
                </button>
              </div>
            )}

            {/* News Feed */}
            <div className="space-y-4">
              {loading ? (
                <>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="card overflow-hidden flex flex-col sm:flex-row" style={{ opacity: 1 - i * 0.25 }}>
                      <div className="skeleton !rounded-none w-full sm:w-52 h-40 sm:h-auto sm:min-h-[180px] shrink-0" />
                      <div className="flex-1 p-6 md:p-7">
                        <div className="skeleton h-2.5 w-36 mb-4" />
                        <div className="skeleton h-5 w-5/6 mb-3" />
                        <div className="skeleton h-3 w-full mb-2" />
                        <div className="skeleton h-3 w-2/3 mb-5" />
                        <div className="skeleton h-2.5 w-40" />
                      </div>
                    </div>
                  ))}
                </>
              ) : error ? (
                <div className="card p-12 text-center">
                  <Newspaper className="w-16 h-16 text-red-300 mx-auto mb-4" />
                  <h3 className="heading-3 mb-2">Failed to load</h3>
                  <p className="body-md mb-4">{error}</p>
                  <button onClick={fetchNews} className="btn-primary inline-flex items-center gap-2 px-4 py-2">
                    <RefreshCw className="w-4 h-4" /> Retry
                  </button>
                </div>
              ) : paginatedNews.length === 0 ? (
                <div className="card p-12 text-center">
                  <div className="w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-accent-soft)' }}>
                    <Newspaper className="w-10 h-10 text-[var(--color-blue-primary)]" />
                  </div>
                  <h3 className="heading-3 mb-2">No articles found</h3>
                  <p className="body-md max-w-sm mx-auto">Try adjusting your filters or search query &mdash; or check back soon for fresh stories.</p>
                </div>
              ) : (
                paginatedNews.map(article => (
                  <article
                    key={article.id}
                    onClick={() => handleArticleClick(article)}
                    className="card hover-lift cursor-pointer overflow-hidden group"
                  >
                    <div className="flex flex-col sm:flex-row">
                      <div className="sm:w-52 h-48 sm:h-auto bg-[var(--color-surface-elevated)] flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                        {article.imageUrl ? (
                          <img
                            src={article.imageUrl}
                            alt={article.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center dot-grid">
                            <Stethoscope className="w-12 h-12 text-[var(--color-border-strong)]" strokeWidth={1.25} />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 p-6 md:p-7 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-blue-primary)]">
                              {article.specialty || 'Medicine'}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-[var(--color-border-strong)]" />
                            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-text-soft)]">
                              {article.timeAgo}
                            </span>
                          </div>
                          <h2
                            className="mb-2.5 group-hover:text-[var(--color-blue-primary)] transition-colors duration-300"
                            style={{
                              fontFamily: 'var(--font-fraunces), serif',
                              fontSize: '1.375rem',
                              fontWeight: 500,
                              lineHeight: 1.18,
                              letterSpacing: '-0.022em',
                              color: 'var(--color-navy)',
                            }}
                          >
                            {article.title}
                          </h2>
                          <p className="body-md line-clamp-2 mb-4">{article.summary}</p>
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-3 border-t border-[var(--color-border-hairline)]">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-[var(--color-navy)] tracking-tight">{article.source}</span>
                            {article.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="badge badge-sm">{tag}</span>
                            ))}
                          </div>
                          {article.url && (
                            <span className="text-xs uppercase tracking-[0.18em] font-semibold text-[var(--color-text-muted)] group-hover:text-[var(--color-navy)] inline-flex items-center gap-1 transition-colors">
                              Read <ExternalLink className="w-3 h-3" strokeWidth={2} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </main>

          {/* Right Sidebar - Extra Context */}
          <ResizableSidebar side="right" defaultWidth={280} minWidth={200} maxWidth={400} responsive>
          <aside className="w-full space-y-6">
            {/* Trending Topics */}
            <div className="card p-7">
              <div className="flex items-baseline justify-between mb-5">
                <div>
                  <p className="label !mb-1">In Circulation</p>
                  <h2 className="heading-3">Trending</h2>
                </div>
                <TrendingUp className="w-4 h-4 text-[var(--color-text-soft)]" strokeWidth={1.5} />
              </div>
              <ol className="space-y-0 -mx-2">
                {trendingTopics.map((topic, index) => (
                  <li key={index} className="group">
                    <button className="text-left w-full px-2 py-2.5 rounded-md transition-smooth hover:bg-[var(--color-accent-soft)] flex items-baseline gap-3 border-b border-[var(--color-border-hairline)] last:border-b-0">
                      <span
                        className="text-[var(--color-text-soft)] font-semibold tabular-nums shrink-0"
                        style={{
                          fontFamily: 'var(--font-fraunces), serif',
                          fontSize: '0.9375rem',
                          fontStyle: 'italic',
                        }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm text-[var(--color-text-body)] group-hover:text-[var(--color-navy)] font-medium tracking-tight leading-snug">
                        {topic}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            {/* Suggested for You */}
            {suggestedArticles.length > 0 && (
              <div className="card p-7">
                <p className="label !mb-1">For You</p>
                <h2 className="heading-3 mb-5">Suggested reading</h2>
                <div className="space-y-4 divide-y divide-[var(--color-border-hairline)]">
                  {suggestedArticles.map((article, idx) => (
                    <div
                      key={article.id}
                      onClick={() => handleArticleClick(article)}
                      className={`cursor-pointer group ${idx === 0 ? '' : 'pt-4'}`}
                    >
                      <h3
                        className="mb-1.5 group-hover:text-[var(--color-blue-primary)] transition-colors duration-300 line-clamp-2"
                        style={{
                          fontFamily: 'var(--font-fraunces), serif',
                          fontSize: '0.9375rem',
                          fontWeight: 500,
                          lineHeight: 1.3,
                          letterSpacing: '-0.015em',
                          color: 'var(--color-navy)',
                        }}
                      >
                        {article.title}
                      </h3>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-soft)] font-semibold">
                        {article.source} &middot; {article.timeAgo}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow us — the signed-in surface people actually live on, so
                the social prompt belongs here rather than only on the landing
                page most members never scroll back to. */}
            <FollowInstagram variant="card" />
          </aside>
          </ResizableSidebar>

        </div>
      </div>
      </div>
    </div>
  );
}
