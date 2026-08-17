'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  Check,
  Loader2,
  Lock,
  Mail,
  ExternalLink,
  Globe,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth, User } from '@/context/AuthContext';
import { useUserDirectory } from '@/context/UserDirectoryContext';
import { UserAvatar } from '@/components/ui/user-avatar';
import AvatarPickerModal from '@/components/profile/AvatarPickerModal';
import {
  getMeAPI,
  updateProfileAPI,
  changePasswordAPI,
  requestEmailChangeAPI,
  cancelEmailChangeAPI,
  deleteAccountAPI,
  ProfileUpdate,
} from '@/lib/api';
import { PROFESSIONS, ALL_PROFILE_FIELD_KEYS, getProfession } from '@/lib/professions';

type FormState = {
  name: string;
  headline: string;
  bio: string;
  careerStage: string;
  institution: string;
  specialty: string;
  qualification: string;
  designation: string;
  yearsExperience: string;
  studyYear: string;
  graduationYear: string;
  city: string;
  country: string;
  websiteUrl: string;
  linkedinUrl: string;
  twitterUrl: string;
};

const emptyForm: FormState = {
  name: '',
  headline: '',
  bio: '',
  careerStage: '',
  institution: '',
  specialty: '',
  qualification: '',
  designation: '',
  yearsExperience: '',
  studyYear: '',
  graduationYear: '',
  city: '',
  country: '',
  websiteUrl: '',
  linkedinUrl: '',
  twitterUrl: '',
};

const toForm = (profile: User): FormState => ({
  name: profile.name || '',
  headline: profile.headline || '',
  bio: profile.bio || '',
  careerStage: profile.careerStage || '',
  institution: profile.institution || '',
  specialty: profile.specialty || '',
  qualification: profile.qualification || '',
  designation: profile.designation || '',
  yearsExperience: profile.yearsExperience != null ? String(profile.yearsExperience) : '',
  studyYear: profile.studyYear || '',
  graduationYear: profile.graduationYear ? String(profile.graduationYear) : '',
  city: profile.city || '',
  country: profile.country || '',
  websiteUrl: profile.websiteUrl || '',
  linkedinUrl: profile.linkedinUrl || '',
  twitterUrl: profile.twitterUrl || '',
});

// Which fields count toward "profile complete". Deliberately excludes the
// social links: nobody should feel nagged into publishing their accounts.
const COMPLETENESS_FIELDS: (keyof FormState | 'avatar')[] = [
  'avatar',
  'name',
  'headline',
  'bio',
  'careerStage',
  'institution',
  'city',
];

export default function ProfilePage() {
  const { user, applyUserUpdate, logout } = useAuth();
  const directory = useUserDirectory();

  const [profile, setProfile] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const data = await getMeAPI();
      setProfile(data);
      setForm(toForm(data));
    } catch {
      showToast('Could not load your profile. Please refresh.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const isDirty = useMemo(() => {
    if (!profile) return false;
    const original = toForm(profile);
    return (Object.keys(original) as (keyof FormState)[]).some((key) => original[key] !== form[key]);
  }, [profile, form]);

  const completeness = useMemo(() => {
    if (!profile) return 0;
    const filled = COMPLETENESS_FIELDS.filter((field) => {
      if (field === 'avatar') return Boolean(profile.avatarUrl);
      return Boolean(form[field]?.trim());
    }).length;
    return Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
  }, [profile, form]);

  const profession = getProfession(form.careerStage);

  const setField = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Changing profession clears anything the new one doesn't ask, so a doctor
  // is never left carrying the "year of study" they had as a student.
  //
  // A value survives only when the new profession asks the *same* question:
  // both a doctor and a researcher call `designation` "Current role", so that
  // carries over, while a student's "College / University" does not become a
  // doctor's "Hospital / Clinic" just because both live in `institution`.
  const setProfession = (value: string) =>
    setForm((current) => {
      const previousLabels = new Map(
        getProfession(current.careerStage)?.fields.map((f) => [f.key, f.label]) ?? [],
      );
      const nextLabels = new Map(getProfession(value)?.fields.map((f) => [f.key, f.label]) ?? []);

      const cleared = Object.fromEntries(
        ALL_PROFILE_FIELD_KEYS.filter(
          (key) => !nextLabels.has(key) || nextLabels.get(key) !== previousLabels.get(key),
        ).map((key) => [key, '']),
      );

      return { ...current, ...cleared, careerStage: value };
    });

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Your name cannot be empty.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: ProfileUpdate = {
        name: form.name.trim(),
        headline: form.headline.trim() || null,
        bio: form.bio.trim() || null,
        careerStage: form.careerStage || null,
        institution: form.institution.trim() || null,
        specialty: form.specialty.trim() || null,
        qualification: form.qualification.trim() || null,
        designation: form.designation.trim() || null,
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
        studyYear: form.studyYear.trim() || null,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        websiteUrl: form.websiteUrl.trim() || null,
        linkedinUrl: form.linkedinUrl.trim() || null,
        twitterUrl: form.twitterUrl.trim() || null,
      };

      const updated = await updateProfileAPI(payload);
      setProfile(updated);
      setForm(toForm(updated));
      applyUserUpdate({ name: updated.name });
      showToast('Profile saved.');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not save your profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSaved = (avatarUrl: string | null) => {
    setProfile((current) => (current ? { ...current, avatarUrl } : current));
    applyUserUpdate({ avatarUrl });
    if (user?._id) directory.setAvatar(user._id, avatarUrl);
    showToast(avatarUrl ? 'Profile picture updated.' : 'Profile picture removed.');
  };

  const handleVisibilityChange = async (patch: ProfileUpdate, message: string) => {
    // Optimistic: a toggle that waits on a sleeping backend feels broken.
    const previous = profile;
    setProfile((current) => (current ? { ...current, ...patch } : current));
    try {
      const updated = await updateProfileAPI(patch);
      setProfile(updated);
      showToast(message);
    } catch (err: any) {
      setProfile(previous);
      showToast(err?.response?.data?.message || 'Could not update your visibility settings.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="page-container py-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="skeleton h-8 w-full max-w-[14rem]" />
          <div className="card p-6 flex items-center gap-5">
            <div className="skeleton skeleton-circle w-24 h-24 shrink-0" />
            {/* Percentage widths, not fixed rem: a w-72 placeholder is wider
                than a 320px phone once the avatar and padding are accounted
                for, and pushed the whole page sideways while loading. */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton h-4 w-full" />
            </div>
          </div>
          <div className="card p-6 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-container py-16 text-center">
        <p className="body-md text-[var(--color-text-muted)]">We couldn&apos;t load your profile.</p>
      </div>
    );
  }

  return (
    <div className="page-container py-8 sm:py-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="label">Your account</p>
          <h1 className="heading-2 mt-1">Profile</h1>
          <p className="body-md text-[var(--color-text-muted)] mt-2 max-w-2xl">
            How you appear across Medzae. Everything below the name is optional — fill in
            only what you want other people to see.
          </p>
        </div>

        {/* Identity card */}
        <section className="card p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <button
              type="button"
              onClick={() => setShowAvatarPicker(true)}
              className="relative group shrink-0 self-start rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-primary)] focus-visible:ring-offset-2"
              aria-label="Change your profile picture"
            >
              <UserAvatar
                userId={profile._id}
                name={profile.name}
                avatarUrl={profile.avatarUrl}
                size={96}
                className="ring-1 ring-[var(--color-border-hairline)]"
              />
              <span className="absolute inset-0 rounded-full bg-[var(--color-navy)]/55 opacity-0 group-hover:opacity-100 transition-smooth flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" strokeWidth={1.75} />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <h2 className="heading-4 truncate">{profile.name}</h2>
              {profile.headline && (
                <p className="body-sm text-[var(--color-text-muted)] mt-0.5">{profile.headline}</p>
              )}
              <p className="text-xs text-[var(--color-text-soft)] mt-1.5">{profile.email}</p>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setShowAvatarPicker(true)}
                  className="btn-secondary !py-1.5 !px-3 text-[0.8125rem] inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {profile.avatarUrl ? 'Change picture' : 'Add a picture'}
                </button>
                {profile.isProfilePublic && (
                  <Link
                    href={`/u/${profile._id}`}
                    className="btn-ghost !py-1.5 !px-3 text-[0.8125rem] inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View public profile
                  </Link>
                )}
              </div>
            </div>

            {/* Completeness */}
            <div className="sm:w-40 shrink-0">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="label !mb-0">Complete</span>
                <span className="text-sm font-semibold text-[var(--color-navy)]">{completeness}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-accent-soft)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-blue-primary)] transition-all duration-500"
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="card p-6 mb-6">
          <SectionHeading title="About you" caption="The basics people see first." />

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Name" required>
              <input
                className="input"
                value={form.name}
                maxLength={80}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Your full name"
              />
            </Field>

            <Field label="Headline" hint="A one-line summary">
              <input
                className="input"
                value={form.headline}
                maxLength={120}
                onChange={(e) => setField('headline', e.target.value)}
                placeholder="Final-year MBBS student · Cardiology interest"
              />
            </Field>
          </div>

          <Field label="About" hint="Up to 600 characters" className="mt-5">
            <textarea
              className="input min-h-[7rem] resize-y"
              value={form.bio}
              maxLength={600}
              onChange={(e) => setField('bio', e.target.value)}
              placeholder="What you're studying or working on, what you're looking for here…"
            />
            <p className="text-[11px] text-[var(--color-text-soft)] mt-1 text-right">
              {form.bio.length}/600
            </p>
          </Field>
        </section>

        {/* Medical background — the questions follow the profession */}
        <section className="card p-6 mb-6">
          <SectionHeading
            title="Medical background"
            caption={
              profession
                ? profession.caption
                : 'Pick what you do and we’ll ask only the questions that fit.'
            }
          />

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="I am a" className="sm:col-span-2">
              <select
                className="input"
                value={form.careerStage}
                onChange={(e) => setProfession(e.target.value)}
              >
                <option value="">Not specified</option>
                {PROFESSIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            {profession?.fields.map((field) => (
              <Field key={field.key} label={field.label}>
                <input
                  className="input"
                  value={form[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  {...(field.type === 'number'
                    ? {
                        type: 'number',
                        inputMode: 'numeric' as const,
                        min: field.key === 'graduationYear' ? 1950 : 0,
                        max: field.key === 'graduationYear' ? new Date().getFullYear() + 15 : 80,
                      }
                    : { maxLength: 120 })}
                />
              </Field>
            ))}
          </div>

          {!profession && (
            <p className="text-[0.8125rem] text-[var(--color-text-soft)] mt-1">
              Choose a profession above to fill in your background.
            </p>
          )}
        </section>

        {/* Location & links */}
        <section className="card p-6 mb-6">
          <SectionHeading title="Location & links" caption="Where you are, and where to find you." />

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="City">
              <input
                className="input"
                value={form.city}
                maxLength={80}
                onChange={(e) => setField('city', e.target.value)}
                placeholder="Ahmedabad"
              />
            </Field>

            <Field label="Country">
              <input
                className="input"
                value={form.country}
                maxLength={80}
                onChange={(e) => setField('country', e.target.value)}
                placeholder="India"
              />
            </Field>

            <Field label="Website">
              <input
                className="input"
                value={form.websiteUrl}
                onChange={(e) => setField('websiteUrl', e.target.value)}
                placeholder="yoursite.com"
              />
            </Field>

            <Field label="LinkedIn">
              <input
                className="input"
                value={form.linkedinUrl}
                onChange={(e) => setField('linkedinUrl', e.target.value)}
                placeholder="linkedin.com/in/you"
              />
            </Field>

            <Field label="X / Twitter" className="sm:col-span-2">
              <input
                className="input"
                value={form.twitterUrl}
                onChange={(e) => setField('twitterUrl', e.target.value)}
                placeholder="x.com/you"
              />
            </Field>
          </div>
        </section>

        {/* Visibility */}
        <section className="card p-6 mb-6">
          <SectionHeading
            title="Who can see this"
            caption="Your name and picture always appear next to what you post. These settings control the details above."
          />

          <div className="space-y-3">
            <ToggleRow
              icon={profile.isProfilePublic ? Globe : Lock}
              title="Public profile"
              description={
                profile.isProfilePublic
                  ? 'Anyone signed in to Medzae can open your profile from your posts and messages.'
                  : 'Only you can see your details. Others see just your name and picture.'
              }
              checked={Boolean(profile.isProfilePublic)}
              onChange={(checked) =>
                handleVisibilityChange(
                  { isProfilePublic: checked },
                  checked ? 'Your profile is now public.' : 'Your profile is now private.',
                )
              }
            />

            <ToggleRow
              icon={profile.showEmail ? Eye : EyeOff}
              title="Show my email on my profile"
              description={
                profile.isProfilePublic
                  ? 'Your email address is listed on your public profile.'
                  : 'Takes effect once your profile is public.'
              }
              checked={Boolean(profile.showEmail)}
              disabled={!profile.isProfilePublic}
              onChange={(checked) =>
                handleVisibilityChange(
                  { showEmail: checked },
                  checked ? 'Your email is shown on your profile.' : 'Your email is hidden.',
                )
              }
            />
          </div>
        </section>

        {/* Save bar */}
        <div className="sticky bottom-4 z-30 mb-8">
          <div
            className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-surface-white)]"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <p className="text-[0.8125rem] text-[var(--color-text-muted)]">
              {isDirty ? 'You have unsaved changes.' : 'Everything is saved.'}
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="btn-primary !py-2 !px-5 text-sm inline-flex items-center gap-2 disabled:opacity-45"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save changes
            </button>
          </div>
        </div>

        <AccountSection
          profile={profile}
          onReload={loadProfile}
          onToast={showToast}
          onSignOut={logout}
        />
      </div>

      {showAvatarPicker && (
        <AvatarPickerModal
          userId={profile._id}
          name={profile.name}
          currentAvatar={profile.avatarUrl ?? null}
          onClose={() => setShowAvatarPicker(false)}
          onSaved={handleAvatarSaved}
        />
      )}

      {toast && (
        <div className="toast" data-type={toast.type === 'error' ? 'error' : undefined}>
          <span className="toast-dot" />
          {toast.message}
        </div>
      )}
    </div>
  );
}

/* ── Account: password, email, deletion ─────────────────────────────── */

function AccountSection({
  profile,
  onReload,
  onToast,
  onSignOut,
}: {
  profile: User;
  onReload: () => Promise<void>;
  onToast: (message: string, type?: 'success' | 'error') => void;
  onSignOut: () => void;
}) {
  const hasPassword = profile.hasPassword !== false;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handlePasswordSave = async () => {
    if (newPassword !== confirmPassword) {
      onToast('The two new passwords do not match.', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const result = await changePasswordAPI(currentPassword, newPassword);
      onToast(result.message || 'Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await onReload();
    } catch (err: any) {
      onToast(err?.response?.data?.message || 'Could not update your password.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleEmailChange = async () => {
    setSavingEmail(true);
    try {
      const result = await requestEmailChangeAPI(newEmail.trim(), emailPassword || undefined);
      onToast(result.message || 'Confirmation sent.');
      setNewEmail('');
      setEmailPassword('');
      await onReload();
    } catch (err: any) {
      onToast(err?.response?.data?.message || 'Could not start the email change.', 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleCancelEmailChange = async () => {
    try {
      await cancelEmailChangeAPI();
      onToast('Email change cancelled.');
      await onReload();
    } catch {
      onToast('Could not cancel the email change.', 'error');
    }
  };

  return (
    <>
      {/* Password */}
      <section className="card p-6 mb-6">
        <SectionHeading
          title={hasPassword ? 'Password' : 'Set a password'}
          caption={
            hasPassword
              ? 'Changing this signs out any outstanding password-reset links.'
              : 'You signed up with Google. Set a password to also sign in with your email address.'
          }
        />

        <div className="grid sm:grid-cols-2 gap-5">
          {hasPassword && (
            <Field label="Current password" className="sm:col-span-2">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
          )}

          <Field label="New password">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>

          <Field label="Confirm new password">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
        </div>

        <p className="text-xs text-[var(--color-text-soft)] mt-3 leading-relaxed">
          At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.
        </p>

        <button
          type="button"
          onClick={handlePasswordSave}
          disabled={savingPassword || !newPassword || !confirmPassword || (hasPassword && !currentPassword)}
          className="btn-primary !py-2 !px-4 text-sm mt-4 inline-flex items-center gap-2 disabled:opacity-45"
        >
          {savingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
          {hasPassword ? 'Update password' : 'Set password'}
        </button>
      </section>

      {/* Email */}
      <section className="card p-6 mb-6">
        <SectionHeading
          title="Email address"
          caption="This is the address you sign in with. A confirmation link goes to the new address — your current one keeps working until you click it."
        />

        <div className="flex items-center gap-2 mb-5 px-3.5 py-2.5 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-hairline)]">
          <Mail className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
          <span className="text-sm text-[var(--color-navy)] font-medium truncate">{profile.email}</span>
        </div>

        {profile.pendingEmail ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[var(--color-accent-soft)] border border-[rgba(11,59,145,0.12)]">
            <p className="text-[0.8125rem] text-[var(--color-text-body)]">
              Waiting for confirmation at{' '}
              <span className="font-semibold text-[var(--color-navy)]">{profile.pendingEmail}</span>.
            </p>
            <button
              type="button"
              onClick={handleCancelEmailChange}
              className="text-[0.8125rem] font-semibold text-[var(--color-blue-primary)] hover:text-[var(--color-navy)] transition-smooth"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="New email address">
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>

              {hasPassword && (
                <Field label="Current password" hint="To confirm it's you">
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                  />
                </Field>
              )}
            </div>

            <button
              type="button"
              onClick={handleEmailChange}
              disabled={savingEmail || !newEmail.trim() || (hasPassword && !emailPassword)}
              className="btn-secondary !py-2 !px-4 text-sm mt-4 inline-flex items-center gap-2 disabled:opacity-45"
            >
              {savingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Send confirmation
            </button>
          </>
        )}
      </section>

      {/* Danger zone */}
      <section className="card p-6 mb-10 !border-red-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="heading-4 !text-[1.0625rem]">Delete account</h3>
            <p className="body-sm text-[var(--color-text-muted)] mt-1 leading-relaxed">
              Permanently removes your account along with your posts, comments, notes, tasks,
              documents and messages. Groups you created are handed to their longest-standing
              member. This cannot be undone.
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="mt-4 px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-semibold border border-red-100 hover:bg-red-100 transition-smooth"
            >
              Delete my account
            </button>
          </div>
        </div>
      </section>

      {showDeleteModal && (
        <DeleteAccountModal
          profile={profile}
          hasPassword={hasPassword}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => {
            onSignOut();
            window.location.href = '/';
          }}
        />
      )}
    </>
  );
}

function DeleteAccountModal({
  profile,
  hasPassword,
  onClose,
  onDeleted,
}: {
  profile: User;
  hasPassword: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = hasPassword
    ? password.length > 0
    : confirmText.trim().toLowerCase() === profile.email.toLowerCase();

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccountAPI(hasPassword ? { password } : { confirmText });
      onDeleted();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not delete your account.');
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Delete your account"
      >
        <div className="modal-head">
          <div>
            <p className="label !mb-0 !text-red-600">Permanent</p>
            <h2 className="modal-title mt-0.5">Delete your account</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body space-y-4">
          <p className="body-sm text-[var(--color-text-body)] leading-relaxed">
            Your posts, comments, notes, tasks, documents and messages will be deleted along with
            the account. This cannot be undone.
          </p>

          {hasPassword ? (
            <Field label="Confirm with your password">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </Field>
          ) : (
            <Field label="Type your email address to confirm">
              <input
                className="input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={profile.email}
                autoFocus
              />
            </Field>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" onClick={onClose} className="btn-ghost text-sm" disabled={deleting}>
            Keep my account
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-smooth disabled:opacity-45 inline-flex items-center gap-2"
          >
            {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Small building blocks ──────────────────────────────────────────── */

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-5">
      <h2 className="heading-4 !text-[1.0625rem]">{title}</h2>
      {caption && (
        <p className="body-sm text-[var(--color-text-muted)] mt-1 leading-relaxed max-w-2xl">{caption}</p>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="field-label">
        {label}
        {!required && hint && <span className="optional"> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3.5 px-4 py-3.5 rounded-xl border border-[var(--color-border-hairline)] ${
        disabled ? 'opacity-55' : ''
      }`}
    >
      <div className="w-9 h-9 rounded-lg bg-[var(--color-accent-soft)] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--color-navy)]">{title}</p>
        <p className="text-[0.8125rem] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 disabled:cursor-not-allowed ${
          checked ? 'bg-[var(--color-blue-primary)]' : 'bg-[var(--color-border-mid)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
            checked ? 'translate-x-5' : ''
          }`}
          style={{ boxShadow: '0 1px 3px rgba(0,11,51,0.25)' }}
        />
      </button>
    </div>
  );
}
