
import React, { useState } from 'react';
import { Instructor } from '../types';
import { supabase } from '../lib/supabase';

interface TeacherLoginProps {
  onAuthenticated: (instructor: Instructor) => void;
  onCancel: () => void;
  isOffline: boolean;
}

const TeacherLogin: React.FC<TeacherLoginProps> = ({ onAuthenticated, onCancel, isOffline }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  
  React.useEffect(() => {
    if (isOffline) return; // Skip checks if offline

    const checkSetup = async () => {
      try {
        const { count, error } = await supabase
          .from('instructors')
          .select('*', { count: 'exact', head: true });
        
        if (!error && count === 0) {
          setIsSetupMode(true);
          setUsername('admin');
        } else {
          // Check if we should auto-update the admin password as requested
          const { data: adminUser } = await supabase
            .from('instructors')
            .select('*')
            .eq('username', 'admin')
            .single();
          
          if (adminUser) {
            const newHash = await hashPassword('Luvsiracharya@123');
            if (adminUser.password_hash !== newHash) {
              console.log("Updating admin password in database...");
              await supabase
                .from('instructors')
                .update({ password_hash: newHash })
                .eq('username', 'admin');
            }
          }
        }
      } catch (err) {
        console.error("Connection check failed:", err);
      }
    };
    checkSetup();
  }, [isOffline]);

  const hashPassword = async (pwd: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pwd);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // --- OFFLINE BYPASS ---
    if (isOffline) {
        setLoading(false);
        if (username === 'admin' && password === 'Luvsiracharya@123') {
            onAuthenticated({
                username: 'admin',
                passwordHash: 'offline_mode_hash',
                lastLogin: new Date().toISOString()
            });
        } else {
            setError('Offline Mode: Use username "admin" and password "Luvsiracharya@123".');
        }
        return;
    }

    try {
      const hashedPassword = await hashPassword(password);

      if (isSetupMode) {
        // Create first admin
        const newInstructor = {
          username,
          password_hash: hashedPassword,
          last_login: new Date().toISOString()
        };
        const { error: insertError } = await supabase.from('instructors').insert(newInstructor);
        
        if (insertError) throw insertError;
        
        onAuthenticated({
          username,
          passwordHash: hashedPassword,
          lastLogin: newInstructor.last_login
        });
      } else {
        // Validate credentials
        const { data, error } = await supabase
          .from('instructors')
          .select('*')
          .eq('username', username)
          .single();

        if (error || !data) {
          setError('User not found.');
        } else if (data.password_hash === hashedPassword) {
          await supabase.from('instructors').update({ last_login: new Date().toISOString() }).eq('id', data.id);
          onAuthenticated({
            username: data.username,
            passwordHash: data.password_hash,
            lastLogin: data.last_login
          });
        } else {
          setError('Invalid password.');
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 border border-white/20 relative overflow-hidden">
        {isSetupMode && (
          <div className="absolute top-0 left-0 right-0 bg-indigo-600 py-2 text-center">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">First-Time Database Setup</span>
          </div>
        )}
        
        <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
           </svg>
        </div>

        <button onClick={onCancel} className="absolute top-8 left-6 text-slate-400 hover:text-slate-600 transition-colors">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>

        <div className="text-center mb-8 mt-4">
          <div className="bg-indigo-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <h1 className="text-2xl font-black text-slate-900">
            {isSetupMode ? 'Create Master Account' : 'Instructor Login'}
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-2">
            {isOffline 
               ? <span className="text-amber-600 font-bold">Offline Mode: Use admin / Luvsiracharya@123</span>
               : (isSetupMode 
                  ? 'Set your username and password to initialize the assessment database.' 
                  : 'Enter your credentials to manage papers and class records.')
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-black uppercase tracking-widest text-center border border-red-100 animate-shake">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Username</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold"
              placeholder={isOffline ? "admin" : "e.g. admin"}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold"
              placeholder={isOffline ? "Luvsiracharya@123" : "Enter password"}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className={`w-full py-5 rounded-2xl font-black shadow-xl transition-all active:scale-95 uppercase tracking-widest text-xs flex items-center justify-center gap-2 ${
              isSetupMode ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-900 hover:bg-black text-white'
            }`}
          >
            {loading && <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin"></div>}
            {isSetupMode ? 'Initialize Database' : (isOffline ? 'Enter Demo Mode' : 'Secure Login')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TeacherLogin;
