'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { User, Mail, ArrowRight, ArrowLeft, AlertCircle, ShieldCheck } from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';
import GoogleSignInButton from '@/components/GoogleSignInButton';

const SIGNUP_HERO_IMAGE =
  'https://images.unsplash.com/photo-1666214280391-8ff5bd3c0bf0?w=1200&h=1600&fit=crop&q=80';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signup, loginWithGoogle } = useAuth();
  const router = useRouter();

  const handleGoogleCredential = async (credential: string) => {
    setError('');
    try {
      await loginWithGoogle(credential, rememberMe);
      router.push('/home');
    } catch (err: any) {
      setError(err.message || 'Google sign-up failed. Please try again.');
      throw err; // let the button clear its busy state knowing we handled the message
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirm password must match');
      return;
    }

    const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
    if (!passwordPolicy.test(password)) {
      setError('Use a strong password with 8+ characters, uppercase, lowercase, number, and special character');
      return;
    }

    setIsSubmitting(true);
    try {
      await signup(name, email, password, rememberMe);
      router.push('/home');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-stretch bg-[var(--color-bg-ivory)] overflow-hidden">
      {/* ── Image side — LEFT ───────────────────────────────── */}
      <div className="hidden lg:block lg:w-1/2 relative slide-in-left overflow-hidden">
        <div className="absolute inset-0 zoom-reveal">
          <img
            src={SIGNUP_HERO_IMAGE}
            alt="Medical students collaborating"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(11,25,77,0.85) 0%, rgba(11,59,145,0.55) 50%, rgba(11,25,77,0.85) 100%)',
          }}
        />

        {/* Decorative floating orbs */}
        <div
          className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, #BFD7FF 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-24 w-80 h-80 rounded-full blur-3xl opacity-30"
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
              Join the community
            </p>
            <h2
              className="mb-6 text-white"
              style={{
                fontFamily: 'var(--font-fraunces), serif',
                fontSize: 'clamp(1.75rem, 2.5vw, 2.25rem)',
                fontWeight: 450,
                fontVariationSettings: "'opsz' 120, 'SOFT' 40",
                letterSpacing: '-0.025em',
                lineHeight: 1.22,
              }}
            >
              &ldquo;Start your medical journey with the right tools from day one.&rdquo;
            </h2>
            <ul className="space-y-3 text-sm text-white/85">
              <li className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Curated medical news and events
              </li>
              <li className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                AI-powered study assistant for instant answers
              </li>
              <li className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Communities, groups, and direct messaging
              </li>
              <li className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                A workspace that grows with your career
              </li>
            </ul>
          </div>

          <div className="fade-in-delay-3" />
        </div>
      </div>

      {/* ── Form side — RIGHT ───────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex flex-col px-6 sm:px-10 lg:px-16 py-8 lg:py-10 relative slide-in-right">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-blue-primary)] transition-smooth w-fit lg:self-end"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="mb-8">
              <p className="label mb-3">Get started</p>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--color-navy)] mb-3">
                Create your account
              </h1>
              <p className="body-md">
                Join thousands of medical professionals already learning, collaborating, and growing on Medzae.
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
                <label htmlFor="name" className="block label mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Jane Doe"
                    className="input w-full pl-11 pr-4"
                    required
                  />
                </div>
              </div>

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
                  placeholder="Create a strong password"
                  required
                  minLength={8}
                />
                <div className="mt-3 rounded-xl border border-[var(--color-border-light)] bg-white p-4 text-sm text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-navy)] mb-2">
                    <ShieldCheck className="w-4 h-4 text-[var(--color-blue-primary)]" />
                    Strong password policy
                  </div>
                  <ul className="space-y-1.5">
                    <li>• At least 8 characters</li>
                    <li>• One uppercase and one lowercase letter</li>
                    <li>• One number and one special character</li>
                  </ul>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block label mb-2">
                  Confirm Password
                </label>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  minLength={8}
                />
              </div>

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
                type="submit"
                disabled={isSubmitting}
                className="btn-primary !rounded-lg w-full py-4 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <GoogleSignInButton text="signup_with" onCredential={handleGoogleCredential} />

            <div className="mt-8 pt-6 border-t border-[var(--color-border-light)] text-center">
              <p className="body-md">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="text-[var(--color-blue-primary)] font-semibold hover:text-[var(--color-navy-hover)] transition-smooth"
                >
                  ← Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
