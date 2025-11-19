import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import Loader from '@/components/ui/Loader';
import { ContactProfileFields, UserProfile, UserRole, useAuth } from '@auth/AuthContext';
import { db } from '@auth/firebase';

interface UserRecord extends UserProfile {
  accessNote?: string;
  placeholder?: boolean;
}

type UserFilters = {
  name: string;
  email: string;
  companyName: string;
  role: string;
};

interface AccessFormState {
  role: UserRole;
  accessNote: string;
}

const emptyForm: AccessFormState = {
  role: 'customer',
  accessNote: ''
};

const defaultFilters: UserFilters = {
  name: '',
  email: '',
  companyName: '',
  role: ''
};

// Mirror the global search keyword builder so promotions stay discoverable.
const buildUserSearchKeywords = (
  email: string,
  fields: ContactProfileFields,
  role: UserRole
): string[] => {
  return Array.from(
    new Set(
      [
        email,
        fields.firstName,
        fields.lastName,
        fields.companyName,
        fields.phoneNumber,
        fields.city,
        fields.stateProvince,
        role
      ]
        .filter(Boolean)
        .map(value => value.trim().toLowerCase())
    )
  );
};

const AdminPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [people, setPeople] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<UserFilters>(defaultFilters);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [formState, setFormState] = useState<AccessFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    // Keep a live list of profiles ordered alphabetically so admins see changes instantly.
    const usersQuery = query(collection(db, 'users'), orderBy('displayName'));
    const unsubscribe = onSnapshot(usersQuery, snapshot => {
      const nextPeople: UserRecord[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as UserRecord;
        // Some records still persist the "id" field, so strip it to avoid
        // React complaining about duplicate props when we reassign the Firestore id.
        const { id: _ignoredId, ...rest } = data;
        return {
          ...rest,
          id: docSnap.id
        };
      });
      setPeople(nextPeople);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Close kebab menus whenever the admin clicks elsewhere so the UI never feels stuck.
    const closeMenus = () => setMenuOpenId(null);
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  useEffect(() => {
    // Sync the editable form with the currently selected profile.
    const selected = people.find(person => person.id === activeUserId);
    if (selected) {
      setFormState({
        role: selected.role,
        accessNote: selected.accessNote || ''
      });
    } else {
      setFormState(emptyForm);
    }
  }, [activeUserId, people]);

  const filteredPeople = useMemo(() => {
    return people.filter(person => {
      return Object.entries(filters).every(([key, value]) => {
        const trimmedValue = value.trim().toLowerCase();
        if (!trimmedValue) return true;

        if (key === 'name') {
          const compositeName = `${person.firstName} ${person.lastName} ${person.displayName}`
            .toLowerCase()
            .trim();
          return compositeName.includes(trimmedValue);
        }

        const fieldValue = String(
          person[key as keyof Omit<UserFilters, 'name'>] || ''
        )
          .toLowerCase()
          .trim();
        return fieldValue.includes(trimmedValue);
      });
    });
  }, [people, filters]);

  const handleFilterChange = (field: keyof UserFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleNameClick = (record: UserRecord) => {
    setActiveUserId(record.id);
    setStatusMessage(null);
    document
      .getElementById('admin-access-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const startCreateFlow = () => {
    setActiveUserId(null);
    setFormState(emptyForm);
    setStatusMessage(null);
    navigate('/signup');
  };

  const persistAccessChange = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeUserId) return;
    const target = people.find(person => person.id === activeUserId);
    if (!target) return;

    setSaving(true);
    setStatusMessage(null);
    try {
      const keywords = buildUserSearchKeywords(target.email, target, formState.role);
      await updateDoc(doc(db, 'users', activeUserId), {
        role: formState.role,
        accessNote: formState.accessNote,
        searchKeywords: keywords,
        updatedAt: serverTimestamp()
      });
      setStatusMessage('Access updated successfully.');
    } catch (error) {
      console.error('Failed to update access', error);
      setStatusMessage('Failed to update access. Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const cloneUser = async (record: UserRecord) => {
    try {
      const placeholderEmail = record.email
        ? record.email.replace('@', `+copy-${Date.now()}@`)
        : `contact+copy-${Date.now()}@example.com`;
      const payloadFields: ContactProfileFields = {
        firstName: record.firstName || '',
        lastName: record.lastName || '',
        companyName: record.companyName || '',
        jobTitle: record.jobTitle || '',
        phoneNumber: record.phoneNumber || '',
        streetAddress: record.streetAddress || '',
        city: record.city || '',
        stateProvince: record.stateProvince || '',
        postalCode: record.postalCode || '',
        country: record.country || 'Australia'
      };
      await addDoc(collection(db, 'users'), {
        ...payloadFields,
        role: 'customer',
        email: placeholderEmail,
        displayName: `${record.displayName || record.email || 'Contact'} copy`,
        accessNote: record.accessNote || '',
        placeholder: true,
        searchKeywords: buildUserSearchKeywords(placeholderEmail, payloadFields, 'customer'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setStatusMessage('Cloned a template profile. Update the email before inviting.');
    } catch (error) {
      console.error('Failed to clone profile', error);
      setStatusMessage('Could not clone that profile.');
    }
  };

  const deleteUser = async (recordId: string) => {
    if (user?.uid === recordId) {
      setStatusMessage('You cannot delete your own access record while signed in.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', recordId));
      if (activeUserId === recordId) {
        setActiveUserId(null);
        setFormState(emptyForm);
      }
      setStatusMessage('Profile deleted. Remember to remove auth credentials separately.');
    } catch (error) {
      console.error('Failed to delete profile', error);
      setStatusMessage('Could not delete that profile.');
    }
  };

  const changeRoleQuickly = async (record: UserRecord, nextRole: UserRole) => {
    // Provide a shortcut to toggle roles without visiting the side form so admins keep focus on the table.
    setStatusMessage(null);
    try {
      const keywords = buildUserSearchKeywords(record.email, record, nextRole);
      await updateDoc(doc(db, 'users', record.id), {
        role: nextRole,
        searchKeywords: keywords,
        updatedAt: serverTimestamp()
      });
      setStatusMessage(
        nextRole === 'admin'
          ? `${record.displayName || record.email || 'Contact'} is now an admin.`
          : `${record.displayName || record.email || 'Contact'} is now a customer.`
      );
    } catch (error) {
      console.error('Failed to change role quickly', error);
      setStatusMessage('Could not update that role. Try again shortly.');
    }
  };

  const tableColumns: {
    key: keyof UserFilters;
    label: string;
    placeholder: string;
    helper: string;
  }[] = [
    {
      key: 'name',
      label: 'Contact name',
      placeholder: 'Search people…',
      helper: 'Type any part of the first or last name to zero in on a person.'
    },
    {
      key: 'email',
      label: 'Email',
      placeholder: 'Search email…',
      helper: 'Filter the table by primary login email.'
    },
    {
      key: 'companyName',
      label: 'Company',
      placeholder: 'Search companies…',
      helper: 'Narrow the list to a specific studio, builder or client.'
    },
    {
      key: 'role',
      label: 'Role',
      placeholder: 'Admin or customer…',
      helper: 'Type “admin” or “customer” to focus on a permission level.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-400">
        <nav className="flex flex-wrap gap-2" aria-label="Breadcrumb">
          <a href="/" className="text-slate-300 hover:text-emerald-300">
            Home
          </a>
          <span>/</span>
          <a href="/admin" className="text-slate-300 hover:text-emerald-300">
            Admin
          </a>
          <span>/</span>
          <span className="text-slate-100">Access control</span>
        </nav>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-300">Team access</p>
          <h1 className="text-3xl font-semibold">Manage admin privileges</h1>
          <p className="text-sm text-slate-300">
            Review every profile in real time, promote trusted collaborators and keep the
            first account automatically elevated for you.
          </p>
        </div>
        <button
          onClick={startCreateFlow}
          className="h-11 rounded-lg bg-blue-500 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400"
        >
          Create user
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] min-h-[calc(100vh-220px)]">
        <section className="flex min-h-full flex-col rounded-2xl border border-slate-800 bg-slate-950/40">
          <header className="border-b border-slate-800 px-4 py-3">
            <p className="text-sm font-semibold">Profiles</p>
            <p className="text-xs text-slate-400">
              The table stretches with the viewport so you can keep the roster in sight while
              filtering or editing.
            </p>
          </header>
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader />
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-950">
                    <tr>
                      {tableColumns.map(column => (
                        <th key={column.key} className="px-4 py-3 text-xs font-semibold uppercase text-slate-400">
                          <div className="space-y-2">
                            <span>{column.label}</span>
                            <div>
                              <input
                                type="text"
                                value={filters[column.key]}
                                onChange={event => handleFilterChange(column.key, event.target.value)}
                                placeholder={column.placeholder}
                                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                                aria-label={column.label}
                              />
                              <p className="mt-1 text-[0.65rem] text-slate-400">{column.helper}</p>
                            </div>
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeople.length === 0 ? (
                      <tr>
                        <td colSpan={tableColumns.length + 1} className="px-4 py-6 text-center text-slate-400">
                          No profiles matched your filters. Clear the search boxes to see everyone again.
                        </td>
                      </tr>
                    ) : (
                      filteredPeople.map(person => (
                        <tr
                          key={person.id}
                          className="border-t border-slate-800/70 hover:bg-slate-900/40"
                        >
                          <td className="px-4 py-3">
                            <button
                              className="text-left font-semibold text-emerald-300 hover:underline"
                              onClick={event => {
                                event.stopPropagation();
                                handleNameClick(person);
                              }}
                            >
                              {person.displayName || person.email || 'Unnamed contact'}
                            </button>
                            <p className="text-xs text-slate-400">Tap a name to edit access rights.</p>
                          </td>
                          <td className="px-4 py-3 text-slate-200">{person.email || '—'}</td>
                          <td className="px-4 py-3 text-slate-200">{person.companyName || '—'}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                person.role === 'admin'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-slate-800 text-slate-200'
                              }`}
                            >
                              {person.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="relative inline-block text-left" onClick={event => event.stopPropagation()}>
                              <button
                                className="rounded-full p-2 text-slate-300 hover:bg-slate-800"
                                onClick={() => setMenuOpenId(prev => (prev === person.id ? null : person.id))}
                                aria-label="More options"
                              >
                                ⋮
                              </button>
                              {menuOpenId === person.id && (
                                <div className="absolute right-0 mt-2 w-36 rounded-md border border-slate-800 bg-slate-900 p-1 text-sm shadow-xl">
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-200 hover:bg-slate-800"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      const nextRole = person.role === 'admin' ? 'customer' : 'admin';
                                      void changeRoleQuickly(person, nextRole);
                                    }}
                                  >
                                    {person.role === 'admin' ? 'Make customer' : 'Make admin'}
                                  </button>
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-200 hover:bg-slate-800"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      void cloneUser(person);
                                    }}
                                  >
                                    Clone
                                  </button>
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-red-300 hover:bg-red-500/10"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      void deleteUser(person.id);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section
          id="admin-access-form"
          className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"
        >
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Assign permissions</h2>
              <p className="text-sm text-slate-400">
                Choose who can curate materials, pricing presets and orders. Every change updates
                the global search index instantly so the top search bar can find admins quickly.
              </p>
            </div>

            {activeUserId ? (
              <form onSubmit={persistAccessChange} className="space-y-5">
                <div>
                  <label className="text-sm font-semibold text-slate-100" htmlFor="user-role">
                    Role
                  </label>
                  <select
                    id="user-role"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    value={formState.role}
                    onChange={event => setFormState(prev => ({ ...prev, role: event.target.value as UserRole }))}
                    aria-describedby="user-role-help"
                  >
                    <option value="customer">Customer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <p id="user-role-help" className="mt-1 text-xs text-slate-400">
                    Admins can manage materials and pricing. Customers stay limited to configuring their own jobs.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-100" htmlFor="user-note">
                    Access rationale
                  </label>
                  <textarea
                    id="user-note"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    rows={4}
                    value={formState.accessNote}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, accessNote: event.target.value }))
                    }
                    placeholder="Document why this person needs admin rights so the team can audit later."
                    aria-describedby="user-note-help"
                  />
                  <p id="user-note-help" className="mt-1 text-xs text-slate-400">
                    This note stays with the profile and helps future reviewers understand why elevated access was granted.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save access'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveUserId(null)}
                    className="text-sm text-slate-400 hover:text-slate-200"
                  >
                    Clear selection
                  </button>
                </div>

                {statusMessage && (
                  <p className="text-xs text-slate-300">{statusMessage}</p>
                )}
              </form>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-300">
                Select a contact from the table to update their role or tap Create to add a new profile and invite them.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminPage;
