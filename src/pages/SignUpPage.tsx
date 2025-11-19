import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, SignUpPayload, DEFAULT_COUNTRY } from '@auth/AuthContext';

// Capture every onboarding field in a single object so it can be forwarded to Firebase as-is.
// Always register Australian customers since the platform only serves that region.
const initialForm: SignUpPayload = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  companyName: '',
  jobTitle: '',
  phoneNumber: '',
  streetAddress: '',
  city: '',
  stateProvince: '',
  postalCode: '',
  country: DEFAULT_COUNTRY
};

const SignUpPage: React.FC = () => {
  const { signUp } = useAuth();
  const [form, setForm] = useState<SignUpPayload>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Keep the form state in sync with the UI controls.
  const handleChange = (field: keyof SignUpPayload, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signUp({ ...form, country: DEFAULT_COUNTRY });
      navigate('/configurator', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Failed to sign up');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pt-10">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <p className="text-sm text-slate-300">
        Share a few company and contact details so we can personalize your experience
        and proactively support your projects.
      </p>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-200" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="name@studio.com"
            value={form.email}
            onChange={e => handleChange('email', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            We will send order confirmations and important notices to this inbox.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="firstName">
            First name
          </label>
          <input
            id="firstName"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Ada"
            value={form.firstName}
            onChange={e => handleChange('firstName', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            Let us know how to address you in future conversations.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="lastName">
            Last name
          </label>
          <input
            id="lastName"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Lovelace"
            value={form.lastName}
            onChange={e => handleChange('lastName', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">We include your surname on quotes and invoices.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="companyName">
            Company / Studio
          </label>
          <input
            id="companyName"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Curve Collective"
            value={form.companyName}
            onChange={e => handleChange('companyName', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">Used on proposals, invoices, and search.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="jobTitle">
            Job title
          </label>
          <input
            id="jobTitle"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Senior Designer"
            value={form.jobTitle}
            onChange={e => handleChange('jobTitle', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">Helps our team connect you with the right specialist.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="phoneNumber">
            Phone number
          </label>
          <input
            id="phoneNumber"
            type="tel"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="+1 415 555 0123"
            value={form.phoneNumber}
            onChange={e => handleChange('phoneNumber', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            We will only call for urgent fabrication questions.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-200" htmlFor="streetAddress">
            Street address
          </label>
          <input
            id="streetAddress"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="125 Market Street"
            value={form.streetAddress}
            onChange={e => handleChange('streetAddress', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            Used for logistics planning and freight estimates.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="city">
            City
          </label>
          <input
            id="city"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="San Francisco"
            value={form.city}
            onChange={e => handleChange('city', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">Helps us surface nearby fabrication partners.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="stateProvince">
            State / Province
          </label>
          <input
            id="stateProvince"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="CA"
            value={form.stateProvince}
            onChange={e => handleChange('stateProvince', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">Needed for tax and shipping paperwork.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="postalCode">
            Postal code
          </label>
          <input
            id="postalCode"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="94105"
            value={form.postalCode}
            onChange={e => handleChange('postalCode', e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">Ensures accurate carrier quotes.</p>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-200" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Create a strong password"
            value={form.password}
            onChange={e => handleChange('password', e.target.value)}
            required
            minLength={8}
          />
          <p className="mt-1 text-xs text-slate-400">
            Minimum 8 characters. Avoid reusing passwords from other services.
          </p>
        </div>
        {error && (
          <p className="md:col-span-2 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting ? 'Creating account…' : 'Sign up'}
          </button>
        </div>
      </form>
      <p className="text-xs text-slate-400">
        Already have an account?{' '}
        <Link className="text-emerald-300" to="/signin">
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default SignUpPage;
