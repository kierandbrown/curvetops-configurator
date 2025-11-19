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
      <h1 className="text-2xl font-semibold">Create your Australian account</h1>
      {/* Reinforce that onboarding is targeted to Australian studios so expectations are clear. */}
      <p className="text-sm text-slate-300">
        We currently onboard Australian studios and fabrication partners across every state
        and territory. Share your local contact details so we can tailor freight, tax, and
        compliance information for the Australian market.
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
            placeholder="name@studio.com.au"
            value={form.email}
            onChange={e => handleChange('email', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="firstName">
            First name
          </label>
          <input
            id="firstName"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Matilda"
            value={form.firstName}
            onChange={e => handleChange('firstName', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="lastName">
            Last name
          </label>
          <input
            id="lastName"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Nguyen"
            value={form.lastName}
            onChange={e => handleChange('lastName', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="companyName">
            Company / Studio
          </label>
          <input
            id="companyName"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Harbour Design Studio"
            value={form.companyName}
            onChange={e => handleChange('companyName', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="jobTitle">
            Job title
          </label>
          <input
            id="jobTitle"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Principal Designer"
            value={form.jobTitle}
            onChange={e => handleChange('jobTitle', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="phoneNumber">
            Phone number
          </label>
          <input
            id="phoneNumber"
            type="tel"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="+61 2 5550 1234"
            value={form.phoneNumber}
            onChange={e => handleChange('phoneNumber', e.target.value)}
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-200" htmlFor="streetAddress">
            Street address
          </label>
          <input
            id="streetAddress"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="48 Bridge Road"
            value={form.streetAddress}
            onChange={e => handleChange('streetAddress', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="city">
            City
          </label>
          <input
            id="city"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Sydney"
            value={form.city}
            onChange={e => handleChange('city', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="stateProvince">
            State / Province
          </label>
          <input
            id="stateProvince"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="NSW"
            value={form.stateProvince}
            onChange={e => handleChange('stateProvince', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="postalCode">
            Postal code
          </label>
          <input
            id="postalCode"
            type="text"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="2000"
            value={form.postalCode}
            onChange={e => handleChange('postalCode', e.target.value)}
            required
          />
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
