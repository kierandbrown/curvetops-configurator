import { FormEvent, useEffect, useState } from 'react';
import { useAuth, ContactProfileFields, DEFAULT_COUNTRY } from '@auth/AuthContext';
import Loader from '../components/ui/Loader';

// Default every profile to Australia because that's the only serviced region.
const emptyProfile: ContactProfileFields = {
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

const AccountPage: React.FC = () => {
  const { profile, updateProfile, loading, user } = useAuth();
  const [form, setForm] = useState<ContactProfileFields>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Mirror the profile data from Firestore into the local editable state.
  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        companyName: profile.companyName || '',
        jobTitle: profile.jobTitle || '',
        phoneNumber: profile.phoneNumber || '',
        streetAddress: profile.streetAddress || '',
        city: profile.city || '',
        stateProvince: profile.stateProvince || '',
        postalCode: profile.postalCode || '',
        country: profile.country || DEFAULT_COUNTRY
      });
    }
  }, [profile]);

  const handleChange = (field: keyof ContactProfileFields, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await updateProfile({ ...form, country: DEFAULT_COUNTRY });
      setStatus({ type: 'success', message: 'Profile updated successfully.' });
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message ?? 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm uppercase tracking-wide text-emerald-300">Account</p>
        <h1 className="text-2xl font-semibold">Contact & company profile</h1>
        <p className="text-sm text-slate-300">
          Keep this information current so we can send accurate freight estimates and reach you when
          a fabrication milestone needs attention.
        </p>
      </div>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-email">
            Account email
          </label>
          <input
            id="account-email"
            type="email"
            value={user?.email || profile?.email || ''}
            readOnly
            className="mt-1 w-full rounded border border-dashed border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-firstName">
            First name
          </label>
          <input
            id="account-firstName"
            value={form.firstName}
            onChange={e => handleChange('firstName', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-lastName">
            Last name
          </label>
          <input
            id="account-lastName"
            value={form.lastName}
            onChange={e => handleChange('lastName', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-companyName">
            Company / Studio
          </label>
          <input
            id="account-companyName"
            value={form.companyName}
            onChange={e => handleChange('companyName', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-jobTitle">
            Job title
          </label>
          <input
            id="account-jobTitle"
            value={form.jobTitle}
            onChange={e => handleChange('jobTitle', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-phoneNumber">
            Phone number
          </label>
          <input
            id="account-phoneNumber"
            type="tel"
            value={form.phoneNumber}
            onChange={e => handleChange('phoneNumber', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-streetAddress">
            Street address
          </label>
          <input
            id="account-streetAddress"
            value={form.streetAddress}
            onChange={e => handleChange('streetAddress', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-city">
            City
          </label>
          <input
            id="account-city"
            value={form.city}
            onChange={e => handleChange('city', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-stateProvince">
            State / Province
          </label>
          <input
            id="account-stateProvince"
            value={form.stateProvince}
            onChange={e => handleChange('stateProvince', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200" htmlFor="account-postalCode">
            Postal code
          </label>
          <input
            id="account-postalCode"
            value={form.postalCode}
            onChange={e => handleChange('postalCode', e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            required
          />
        </div>
        {status && (
          <p
            className={`md:col-span-2 text-sm ${
              status.type === 'success' ? 'text-emerald-300' : 'text-red-400'
            }`}
            role="status"
          >
            {status.message}
          </p>
        )}
        <div className="md:col-span-2 flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AccountPage;
