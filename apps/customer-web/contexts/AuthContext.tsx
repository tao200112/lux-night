'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { getProfile, ensureProfile, Profile } from '@/lib/data/profile';
import { signInWithGoogle, signInWithApple, signOut } from '@/lib/auth/client';

interface AuthContextType {
  user: SupabaseUser | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // 使用 getSession() 获取 session（Cookie 驱动）
    // 不要使用 getUser()，避免在 session 缺失时触发 signout
    const loadSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[CUSTOMER AUTH CONTEXT] Error getting session:', error);
          setLoading(false);
          return;
        }
        
        // DEBUG: 开发环境打印 session 状态
        if (process.env.NODE_ENV === 'development') {
          console.log('[CUSTOMER AUTH CONTEXT] Session:', session ? `User: ${session.user.id}` : 'NULL');
        }
        
        if (session?.user) {
          setUser(session.user);
          loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      } catch (error) {
        console.error('[CUSTOMER AUTH CONTEXT] Error loading session:', error);
        setLoading(false);
      }
    };

    loadSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // DEBUG: 开发环境打印 auth 状态变化
      if (process.env.NODE_ENV === 'development') {
        console.log('[CUSTOMER AUTH CONTEXT] Auth state change:', event, session ? `User: ${session.user.id}` : 'NULL');
      }
      
      // 只在有 session 时设置 user，避免在 SIGNED_OUT 时触发 getUser
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id);
      } else {
        // session 为 null 时，保持未登录态
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      let profileData = await getProfile(userId);
      
      // If profile doesn't exist, call server API to ensure it exists
      // 不要在前端直接 insert profiles（避免 RLS 错误）
      if (!profileData) {
        try {
          const res = await fetch('/api/profile/ensure', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });
          
          if (res.ok) {
            const { profile } = await res.json();
            profileData = profile;
          } else {
            console.error('[CUSTOMER AUTH CONTEXT] Failed to ensure profile:', res.statusText);
          }
        } catch (error) {
          console.error('[CUSTOMER AUTH CONTEXT] Error ensuring profile:', error);
        }
        
        // 如果 server API 成功，重新获取 profile
        if (!profileData) {
          profileData = await getProfile(userId);
        }
      }
      
      setProfile(profileData);
    } catch (error) {
      console.error('[CUSTOMER AUTH CONTEXT] Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    await signInWithGoogle();
  };

  const loginWithApple = async () => {
    await signInWithApple();
  };

  const logout = async () => {
    await signOut();
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAuthenticated: !!user,
        loading,
        loginWithGoogle,
        loginWithApple,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
