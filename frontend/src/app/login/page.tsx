'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { forgotPasswordAPI, resetPasswordAPI } from '@/lib/api';

const LOGIN_HERO_IMAGE =
  'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=1200&h=1600&fit=crop&q=80';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalMode, setModalMode] = useState<'forgot' | 'reset' | null>(null);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token');
    const emailFromQuery = searchParams.get('email');
    const mode = searchParams.get('mode');

    if (mode === 'reset' && token && emailFromQuery) {
      setModalMode('reset');
      setResetToken(token);
      setResetEmail(emailFromQuery);
      setResetError('');
      setResetSuccess('');
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password, rememberMe);
      router.push('/home');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setError('');
    try {
      await loginWithGoogle(credential, rememberMe);
      router.push('/home');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
      throw err; // let the button clear its busy state knowing we handled the message
    }
  };

  const openForgotPasswordModal = () => {
    setForgotEmail(email);
    setForgotError('');
    setForgotSuccess('');
    setModalMode('forgot');
  };

  const closeForgotPasswordModal = () => {
    setModalMode(null);
    setForgotError('');
    setForgotSuccess('');
    setForgotSubmitting(false);
    setResetError('');
    setResetSuccess('');
    setResetSubmitting(false);
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail) {
      setForgotError('Please enter your email address');
      return;
    }

    setForgotSubmitting(true);
    try {
      const res = await forgotPasswordAPI(forgotEmail);
      setForgotSuccess(res.message || 'Check your email for the reset link.');
    } catch (err: any) {
      setForgotError(err.response?.data?.message || err.message || 'Unable to send reset email');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');

    if (!resetEmail || !resetToken) {
      setResetError('This reset link is missing information. Please request a new one.');
      return;
    }

    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
    if (!strongPassword.test(newPassword)) {
      setResetError('Use a strong password with 8+ characters, uppercase, lowercase, number, and special character');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    setResetSubmitting(true);
    try {
      const res = await resetPasswordAPI(resetEmail, resetToken, newPassword);
      setResetSuccess(res.message || 'Password updated successfully. You can sign in now.');
      setPassword('');
      setEmail(resetEmail);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        closeForgotPasswordModal();
        router.replace('/login');
      }, 1600);
    } catch (err: any) {
      setResetError(err.response?.data?.message || err.message || 'Unable to reset password');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-stretch bg-[var(--color-bg-ivory)] overflow-hidden">
      {/* ── Form side — LEFT ────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex flex-col px-6 sm:px-10 lg:px-16 py-8 lg:py-10 relative slide-in-left">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-blue-primary)] transition-smooth w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="mb-8">
              <p className="label mb-3">Welcome back</p>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-navy)] mb-3">
                Sign in to Medzae
              </h1>
              <p className="body-md">
                Pick up right where you left off — your notes, conversations, and study materials are waiting.
              </p>
            </div>

            {error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block label mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="input w-full pl-11 pr-4"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block label mb-2">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--color-border-mid)] accent-[var(--color-blue-primary)] focus:ring-[var(--color-blue-primary)]"
                  />
                  Remember me for 7 days
                </label>

                <button
                  type="button"
                  onClick={openForgotPasswordModal}
                  className="text-sm font-semibold text-[var(--color-blue-primary)] hover:text-[var(--color-navy-hover)] transition-smooth"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary !rounded-lg w-full py-4 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <GoogleSignInButton text="signin_with" onCredential={handleGoogleCredential} />

            <div className="mt-8 pt-6 border-t border-[var(--color-border-light)] text-center">
              <p className="body-md">
                New to Medzae?{' '}
                <Link
                  href="/signup"
                  className="text-[var(--color-blue-primary)] font-semibold hover:text-[var(--color-navy-hover)] transition-smooth"
                >
                  Create an account →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Image side — RIGHT ──────────────────────────────── */}
      <div className="hidden lg:block lg:w-1/2 relative slide-in-right overflow-hidden">
        <div className="absolute inset-0 zoom-reveal">
          <img
            src={LOGIN_HERO_IMAGE}
            alt="A medical professional starting their day"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Gradient overlay for brand color */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(11,25,77,0.85) 0%, rgba(11,59,145,0.55) 50%, rgba(11,25,77,0.85) 100%)',
          }}
        />

        {/* Decorative floating orbs */}
        <div
          className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, #BFD7FF 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-24 w-80 h-80 rounded-full blur-3xl opacity-30"
          style={{ background: 'radial-gradient(circle, #7BA3E8 0%, transparent 70%)' }}
        />

        {/* Content overlay */}
        <div className="relative z-10 h-full flex flex-col justify-between p-10 lg:p-14 text-white">
          <div className="fade-in-delay-1">
            <p
              className="text-white/90"
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
          </div>

          <div className="fade-in-delay-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-4">
              Today on Medzae
            </p>
            <blockquote
              className="mb-6"
              style={{
                fontFamily: 'var(--font-fraunces), serif',
                fontSize: 'clamp(1.75rem, 2.5vw, 2.25rem)',
                fontWeight: 450,
                fontVariationSettings: "'opsz' 120, 'SOFT' 40",
                letterSpacing: '-0.025em',
                lineHeight: 1.22,
              }}
            >
              &ldquo;One calm space for our updates, discussions, and study resources — without switching between apps.&rdquo;
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center font-bold text-sm">
                MC
              </div>
              <div>
                <p className="text-sm font-semibold">Medzae Community Member</p>
                <p className="text-xs text-white/60">Resident Physician</p>
              </div>
            </div>
          </div>

          <div className="fade-in-delay-3 flex items-center gap-6 text-xs text-white/70">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>3.5K+ active members</span>
            </div>
            <div>24/7 AI assistance</div>
          </div>
        </div>
      </div>

      {modalMode && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-[rgba(11,25,77,0.45)] backdrop-blur-sm"
          onClick={closeForgotPasswordModal}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-[var(--color-border-light)] bg-white shadow-[0_24px_80px_rgba(11,25,77,0.18)] p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {modalMode === 'forgot' ? (
              <>
                <div className="mb-6">
                  <p className="label mb-2">Forgot password</p>
                  <h2 className="text-2xl font-extrabold tracking-tight text-[var(--color-navy)]">Send reset link</h2>
                  <p className="body-md mt-2">Enter your email and we’ll send a secure reset link to your inbox.</p>
                </div>

                {forgotError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-red-600 text-sm">{forgotError}</p>
                  </div>
                )}

                {forgotSuccess && (
                  <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-emerald-700 text-sm leading-relaxed">{forgotSuccess}</p>
                    <p className="text-emerald-700 text-xs mt-2 leading-relaxed">
                      Open the email, reset your password, then return here to sign in with the new password.
                    </p>
                  </div>
                )}

                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div>
                    <label htmlFor="forgot-email" className="block label mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
                      <input
                        type="email"
                        id="forgot-email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="input w-full pl-11 pr-4"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={closeForgotPasswordModal}
                      className="btn-secondary !rounded-lg w-full py-3.5"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={forgotSubmitting}
                      className="btn-primary !rounded-lg w-full py-3.5 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {forgotSubmitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sending…
                        </>
                      ) : (
                        'Send email'
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <p className="label mb-2">Reset password</p>
                  <h2 className="text-2xl font-extrabold tracking-tight text-[var(--color-navy)]">Choose a new password</h2>
                  <p className="body-md mt-2">Reset the password for {resetEmail} and then sign back in on this page.</p>
                </div>

                {resetError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-red-600 text-sm">{resetError}</p>
                  </div>
                )}

                {resetSuccess && (
                  <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-emerald-700 text-sm">{resetSuccess}</p>
                  </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-5">
                  <div>
                    <label className="block label mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
                      <input
                        type="email"
                        value={resetEmail}
                        className="input w-full pl-11 pr-4"
                        disabled
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="new-password" className="block label mb-2">
                      New Password
                    </label>
                    <PasswordInput
                      id="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Create a strong password"
                      required
                      minLength={8}
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm-password" className="block label mb-2">
                      Confirm Password
                    </label>
                    <PasswordInput
                      id="confirm-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat the password"
                      required
                      minLength={8}
                    />
                  </div>

                  <div className="rounded-xl border border-[var(--color-border-light)] bg-white p-4 text-sm text-[var(--color-text-secondary)]">
                    <div className="flex items-center gap-2 font-semibold text-[var(--color-navy)] mb-2">
                      <ShieldCheck className="w-4 h-4 text-[var(--color-blue-primary)]" />
                      Password policy
                    </div>
                    <p>8+ characters, uppercase, lowercase, number, and special character.</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={closeForgotPasswordModal}
                      className="btn-secondary !rounded-lg w-full py-3.5"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={resetSubmitting}
                      className="btn-primary !rounded-lg w-full py-3.5 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resetSubmitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Updating…
                        </>
                      ) : (
                        'Reset password'
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
