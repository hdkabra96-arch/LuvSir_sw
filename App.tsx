import React, { useState, useEffect } from 'react';
import TeacherView from './components/TeacherView';
import StudentView from './components/StudentView';
import TeacherLogin from './components/TeacherLogin';
import { UserRole, QuestionPaper, StudentProfile, Submission } from './types';
import { supabase } from './lib/supabase';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [isTeacherAuthenticated, setIsTeacherAuthenticated] = useState(false);
  const [papers, setPapers] = useState<QuestionPaper[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeStudent, setActiveStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const { data: dbPapers, error: paperError } = await supabase
          .from('papers')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (paperError) throw paperError;

        if (dbPapers) {
           const formattedPapers: QuestionPaper[] = dbPapers.map((p: any) => ({
             id: p.id,
             title: p.title,
             subject: p.subject,
             grade: p.grade,
             duration: p.duration,
             questions: p.questions, 
             createdAt: p.created_at,
             pdfData: p.pdf_data,
             validFrom: p.valid_from,
             validUntil: p.valid_until
           }));
           setPapers(formattedPapers);
           setIsOffline(false);
        }

        const { data: dbSubs } = await supabase.from('submissions').select('*').order('submitted_at', { ascending: false });
        if (dbSubs) setSubmissions(dbSubs.map((s: any) => ({ ...s, paperId: s.paper_id, paperTitle: s.paper_title, studentId: s.student_id, studentName: s.student_name, studentGrade: s.student_grade, submittedAt: s.submitted_at })));

        const { data: dbStudents } = await supabase.from('students').select('*');
        if (dbStudents) setStudents(dbStudents);

      } catch (e: any) {
        console.warn("Switching to Local Mode.");
        const localPapers = JSON.parse(localStorage.getItem('edu_papers') || '[]');
        setPapers(localPapers);
        const localSubs = JSON.parse(localStorage.getItem('edu_submissions') || '[]');
        setSubmissions(localSubs);
        const localStudents = JSON.parse(localStorage.getItem('edu_students') || '[]');
        setStudents(localStudents);
        setIsOffline(true);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  const handlePaperCreated = async (newPaper: QuestionPaper): Promise<'success' | 'saved_without_file' | 'failed'> => {
    if (isOffline) {
        setPapers(prev => {
            const updated = [newPaper, ...prev];
            localStorage.setItem('edu_papers', JSON.stringify(updated));
            return updated;
        });
        return 'success';
    }

    try {
      const dbPaper = {
        id: newPaper.id, title: newPaper.title, subject: newPaper.subject, grade: newPaper.grade,
        duration: newPaper.duration, questions: newPaper.questions, created_at: newPaper.createdAt,
        pdf_data: newPaper.pdfData, valid_from: newPaper.validFrom, valid_until: newPaper.validUntil
      };

      const { error } = await supabase.from('papers').insert(dbPaper);
      
      if (error) {
         const { pdf_data, ...paperWithoutPdf } = dbPaper;
         const { error: retryError } = await supabase.from('papers').insert(paperWithoutPdf);
         if (retryError) throw retryError;

         setPapers(prev => [ { ...newPaper, pdfData: undefined }, ...prev ]);
         return 'saved_without_file';
      }
      
      setPapers(prev => [newPaper, ...prev]);
      return 'success';
    } catch (e: any) {
      setPapers(prev => {
        const updated = [newPaper, ...prev];
        localStorage.setItem('edu_papers', JSON.stringify(updated));
        return updated;
      });
      setIsOffline(true);
      return 'success';
    }
  };

  const handlePaperDeleted = async (paperId: string) => {
    if (!confirm("Are you sure you want to permanently delete this paper?")) return;

    // 1. Immediate UI update (Optimistic)
    setPapers(prev => {
        const updated = prev.filter(p => p.id !== paperId);
        localStorage.setItem('edu_papers', JSON.stringify(updated));
        return updated;
    });
    setSubmissions(prev => {
        const updated = prev.filter(s => s.paperId !== paperId);
        localStorage.setItem('edu_submissions', JSON.stringify(updated));
        return updated;
    });

    // 2. Database Sync
    if (!isOffline) {
      try {
        await supabase.from('submissions').delete().eq('paper_id', paperId);
        await supabase.from('papers').delete().eq('id', paperId);
      } catch (e) {
        console.error("Cloud delete failed, only local copy removed.", e);
      }
    }
  };

  const handleSubmissionReceived = async (submission: Submission): Promise<boolean> => {
    setSubmissions(prev => {
        const updated = [submission, ...prev];
        localStorage.setItem('edu_submissions', JSON.stringify(updated));
        return updated;
    });

    if (!isOffline) {
        try {
            await supabase.from('submissions').insert({
                id: submission.id, paper_id: submission.paperId, paper_title: submission.paperTitle,
                student_id: submission.studentId, student_name: submission.studentName,
                student_grade: submission.studentGrade, submitted_at: submission.submittedAt,
                answers: submission.answers
            });
        } catch (e) { console.warn("Cloud sync failed."); }
    }
    return true;
  };

  const handleStudentLogin = async (student: StudentProfile) => {
    setActiveStudent(student);
    if (!students.find(s => s.id === student.id)) {
        setStudents(prev => {
            const updated = [...prev, student];
            localStorage.setItem('edu_students', JSON.stringify(updated));
            return updated;
        });
        if (!isOffline) {
            await supabase.from('students').upsert({ id: student.id, name: student.name, grade: student.grade, joined_at: student.joinedAt });
        }
    }
  };

  const handleLogout = () => { setRole(null); setIsTeacherAuthenticated(false); setActiveStudent(null); };
  const handleInstructorAuth = () => { setIsTeacherAuthenticated(true); };

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><div className="flex flex-col items-center"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div><p className="font-bold uppercase text-xs tracking-widest">EduAssess Pro Loading...</p></div></div>;

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {isOffline && <div className="bg-amber-500 text-amber-900 px-4 py-2 text-center font-bold text-[10px] uppercase tracking-[0.2em]">⚠ Offline Mode - Browser Cache Active</div>}
        <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                <div className="text-white space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl"><svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></div>
                        <h1 className="text-4xl font-black">EduAssess <span className="text-indigo-500">Pro</span></h1>
                    </div>
                    <p className="text-xl text-slate-400">The next-generation classroom assessment hub.</p>
                </div>
                <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl space-y-6">
                    <button onClick={() => setRole('teacher')} className="w-full bg-indigo-600 text-white p-6 rounded-2xl flex items-center justify-between shadow-lg hover:bg-indigo-700 transition-all"><div className="text-left"><p className="text-lg font-bold">Instructor Portal</p></div><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></button>
                    <button onClick={() => setRole('student')} className="w-full bg-slate-100 text-slate-800 p-6 rounded-2xl flex items-center justify-between hover:bg-slate-200 transition-all"><div className="text-left"><p className="text-lg font-bold">Student Portal</p></div><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !isTeacherAuthenticated) return <TeacherLogin onAuthenticated={handleInstructorAuth} onCancel={() => setRole(null)} isOffline={isOffline} />;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 print:hidden">
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleLogout}><div className="bg-indigo-600 p-1.5 rounded-lg text-white"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13" /></svg></div><span className="text-xl font-black">EduAssess <span className="text-indigo-600">Pro</span></span></div>
        <div className="flex items-center gap-4">{activeStudent && <div className="text-right hidden sm:block"><p className="text-[10px] font-bold text-slate-400 uppercase">Class {activeStudent.grade}</p><p className="text-sm font-bold text-slate-700">{activeStudent.name}</p></div>}<button onClick={handleLogout} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button></div>
      </nav>
      {role === 'teacher' ? <TeacherView onPaperCreated={handlePaperCreated} onPaperDeleted={handlePaperDeleted} existingPapers={papers} submissions={submissions} /> : <StudentView papers={papers} activeStudent={activeStudent} onLogin={handleStudentLogin} registeredStudents={students} onSubmission={handleSubmissionReceived} />}
    </div>
  );
};

export default App;