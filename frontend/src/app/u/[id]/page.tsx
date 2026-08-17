'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Lock,
  MapPin,
  GraduationCap,
  Building2,
  Mail,
  Globe,
  Linkedin,
  Twitter,
  MessageCircle,
  Pencil,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useAuth } from '@/context/AuthContext';
import { getUserProfileAPI } from '@/lib/api';
import { getProfession } from '@/lib/professions';

interface PublicProfile {
  _id: string;
  name: string;
  avatarUrl?: string | null;
  isPrivate?: boolean;
  isOwnProfile?: boolean;
  headline?: string | null;
  bio?: string | null;
  careerStage?: string | null;
  institution?: string | null;
  specialty?: string | null;
  qualification?: string | null;
  designation?: string | null;
  yearsExperience?: number | null;
  studyYear?: string | null;
  graduationYear?: number | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  createdAt?: string;
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const userId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getUserProfileAPI(userId);
      setProfile(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not load this profile.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="page-container py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="card p-8 flex items-center gap-6">
            <div className="skeleton skeleton-circle w-28 h-28" />
            <div className="flex-1 space-y-3">
              <div className="skeleton h-6 w-52" />
              <div className="skeleton h-4 w-72" />
              <div className="skeleton h-4 w-40" />
            </div>
          </div>
          <div className="card p-8 space-y-3">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page-container py-16">
        <div className="max-w-md mx-auto empty-plate text-center">
          <p className="body-md text-[var(--color-text-muted)]">{error || 'Profile not found.'}</p>
          <button type="button" onClick={() => router.back()} className="btn-secondary text-sm mt-5">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const isOwnProfile = profile.isOwnProfile || profile._id === user?._id;
  const profession = getProfession(profile.careerStage);
  const stage = profession?.label ?? null;
  const location = [profile.city, profile.country].filter(Boolean).join(', ');

  // Only the fields this person's profession asks for, and only those they
  // actually filled in — labelled exactly as they were in the editor.
  const backgroundRows = (profession?.fields ?? [])
    .map((field) => ({ label: field.label, value: profile[field.key] }))
    .filter((row) => row.value !== null && row.value !== undefined && row.value !== '')
    .map((row) => ({ label: row.label, value: String(row.value) }));
  const links = [
    { url: profile.websiteUrl, icon: Globe, label: 'Website' },
    { url: profile.linkedinUrl, icon: Linkedin, label: 'LinkedIn' },
    { url: profile.twitterUrl, icon: Twitter, label: 'X' },
  ].filter((link) => Boolean(link.url));

  return (
    <div className="page-container py-8 sm:py-10">
      <div className="max-w-3xl mx-auto">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-navy)] transition-smooth mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        {/* Header */}
        <section className="card p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            <UserAvatar
              userId={profile._id}
              name={profile.name}
              avatarUrl={profile.avatarUrl}
              size={112}
              className="ring-1 ring-[var(--color-border-hairline)] self-start"
            />

            <div className="min-w-0 flex-1">
              <h1 className="heading-3">{profile.name}</h1>
              {profile.headline && (
                <p className="body-md text-[var(--color-text-body)] mt-1.5">{profile.headline}</p>
              )}

              {(stage || location) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
                  {stage && (
                    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--color-text-muted)]">
                      <GraduationCap className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {stage}
                    </span>
                  )}
                  {location && (
                    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--color-text-muted)]">
                      <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {location}
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-5">
                {isOwnProfile ? (
                  <Link href="/profile" className="btn-secondary !py-1.5 !px-3 text-[0.8125rem] inline-flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" />
                    Edit profile
                  </Link>
                ) : (
                  <Link
                    href={`/chat?user=${profile._id}`}
                    className="btn-secondary !py-1.5 !px-3 text-[0.8125rem] inline-flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Message
                  </Link>
                )}

                {links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <a
                      key={link.label}
                      href={link.url!}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="icon-btn"
                      aria-label={link.label}
                      title={link.label}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.75} />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {profile.isPrivate ? (
          <section className="card p-10 text-center">
            <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-soft)] flex items-center justify-center mx-auto mb-4">
              <Lock className="w-5 h-5 text-[var(--color-blue-primary)]" strokeWidth={1.5} />
            </div>
            <h2 className="heading-4 !text-[1.0625rem]">This profile is private</h2>
            <p className="body-sm text-[var(--color-text-muted)] mt-2 max-w-sm mx-auto leading-relaxed">
              {profile.name} hasn&apos;t made their details public. You can still see their posts
              and message them.
            </p>
          </section>
        ) : (
          <>
            {profile.bio && (
              <section className="card p-6 sm:p-8 mb-6">
                <p className="label">About</p>
                <p className="body-md text-[var(--color-text-body)] mt-2 whitespace-pre-wrap leading-relaxed">
                  {profile.bio}
                </p>
              </section>
            )}

            {(backgroundRows.length > 0 || profile.email) && (
              <section className="card p-6 sm:p-8">
                <p className="label mb-4">Details</p>
                <dl className="space-y-3.5">
                  {backgroundRows.map((row) => (
                    <DetailRow
                      key={row.label}
                      icon={row.label.includes('Hospital') || row.label.includes('Organisation') ? Building2 : GraduationCap}
                      label={row.label}
                      value={row.value}
                    />
                  ))}
                  {profile.email && (
                    <DetailRow
                      icon={Mail}
                      label="Email"
                      value={profile.email}
                      href={`mailto:${profile.email}`}
                    />
                  )}
                </dl>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-soft)] flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--color-text-soft)]">
          {label}
        </dt>
        <dd className="text-sm text-[var(--color-navy)] font-medium mt-0.5 break-words">
          {href ? (
            <a href={href} className="hover:text-[var(--color-blue-primary)] transition-smooth">
              {value}
            </a>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}
