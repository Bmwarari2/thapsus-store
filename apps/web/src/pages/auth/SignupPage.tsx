import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Mail, Lock, User, EyeOff, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { apiSignup } from '../../lib/api';

const signupSchema = z.object({
  name: z.string().min(2, 'Name is required').max(80),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type SignupForm = z.infer<typeof signupSchema>;

export const SignupPage = () => {
  const [showPassword, setShowPassword] = React.useState(false);
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema)
  });

  const onSubmit = async (data: SignupForm) => {
    try {
      const { user, token } = await apiSignup(data.name, data.email, data.password);
      login(token, { id: user.id, name: user.fullName ?? user.email, email: user.email, role: user.role });
      toast.success('Account created! Welcome to Thapsus.');
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Sign up failed. Please try again.';
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-border rounded-3xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-textPrimary">Create Account</h1>
          <p className="text-textSecondary mt-2">Join Thapsus today</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input 
            {...register('name')}
            placeholder="Full Name"
            icon={<User size={18} />}
            error={errors.name?.message}
          />

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
              placeholder="Password (min. 8 characters)"
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

          <Button type="submit" className="w-full h-12 text-base mt-2" isLoading={isSubmitting}>
            Sign Up
          </Button>
        </form>

        <p className="text-center text-sm text-textSecondary mt-8">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary font-bold hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};
