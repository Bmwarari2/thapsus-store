import React from 'react';
import { useForm as useHookForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Mail, Lock, EyeOff, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export const LoginPage = () => {
  const [showPassword, setShowPassword] = React.useState(false);
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useHookForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginForm) => {
    // Simulate API Call
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        login('fake-jwt-token', {
          id: 'user-1',
          name: 'Jane Doe',
          email: data.email,
          role: 'customer'
        });
        toast.success('Welcome back!');
        navigate('/');
        resolve();
      }, 1000);
    });
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-border rounded-3xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-textPrimary">Welcome back</h1>
          <p className="text-textSecondary mt-2">Log in to your Thapsus account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input 
            {...register('email')}
            type="email"
            placeholder="Email address"
            icon={<Mail size={18} />}
            error={errors.email?.message}
          />
          
          <div className="relative">
            <Input 
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              icon={<Lock size={18} />}
              error={errors.password?.message}
            />
            <button 
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="flex justify-end">
            <Link to="/auth/forgot-password" className="text-sm text-primary font-medium hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full h-12 text-base" isLoading={isSubmitting}>
            Log In
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between before:content-[''] before:flex-1 before:border-b before:border-border after:content-[''] after:flex-1 after:border-b after:border-border">
          <span className="px-4 text-xs font-medium text-textSecondary uppercase">Or</span>
        </div>

        <Button variant="outline" className="w-full h-12 mt-6 flex gap-2" disabled>
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google (Coming Soon)
        </Button>

        <p className="text-center text-sm text-textSecondary mt-8">
          Don't have an account?{' '}
          <Link to="/auth/signup" className="text-primary font-bold hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};
