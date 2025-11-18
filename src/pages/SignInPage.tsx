import { FormEvent, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@auth/AuthContext';

const SignInPage: React.FC = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation() as any;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signIn(email, password);
      const redirectTo = location.state?.from?.pathname ?? '/configurator';
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Failed to sign in');
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-10">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form className="space-y-4" onSubmit={onSubmit}>
        <input
          type="email"
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="w-full rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Sign in
        </button>
      </form>
      <p className="text-xs text-slate-400">
        No account?{' '}
        <Link className="text-emerald-300" to="/signup">
          Sign up
        </Link>
      </p>
    </div>
  );
};

export default SignInPage;
