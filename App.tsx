
import React, { useState, useEffect } from 'react';
import TeacherView from './components/TeacherView';
import StudentView from './components/StudentView';
import TeacherLogin from './components/TeacherLogin';
import { UserRole, QuestionPaper, StudentProfile, Instructor, Submission } from './types';
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
           const formattedPapers: QuestionPaper[] = dbPapers.map(p => ({
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
        }

        const { data: dbSubs, error: subError } = await supabase
          .from('submissions')
          .select('*')
          .order('submitted_at', { ascending: false });
          
        if (subError) console.error('Error loading submissions:', subError);
        else if (dbSubs) {
           const formattedSubs: Submission[] = dbSubs.map(s => ({
             id: s.id,
             paperId: s.paper_id,
             paperTitle: s.paper_title,
             studentId: s.student_id,
             studentName: s.student_name,
             studentGrade: s.student_grade,
             submittedAt: s.submitted_at,
             answers: s.answers
           }));
           setSubmissions(formattedSubs);
        }

        const { data: dbStudents, error: stuError } = await supabase.from('students').select('*');
        if (stuError) console.error('Error loading students:', stuError);
        else if (dbStudents) {
           const formattedStudents: StudentProfile[] = dbStudents.map(s => ({
             id: s.id,
             name: s.name,
             grade: s.grade,
             joinedAt: s.joined_at
           }));
           setStudents(formattedStudents);
        }

        setIsOffline(false);

      } catch (e: any) {
        console.warn("Cloud Database Unreachable. Switching to Offline Mode.", e);
        setIsOffline(true);
        try {
            const localPapers = JSON.parse(localStorage.getItem('edu_papers') || '[]');
            setPapers(localPapers);
            const localSubs = JSON.parse(localStorage.getItem('edu_submissions') || '[]');
            setSubmissions(localSubs);
            const localStudents = JSON.parse(localStorage.getItem('edu_students') || '[]');
            setStudents(localStudents);
        } catch (err) {
            console.error("Local storage load failed", err);
        }
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  const handlePaperCreated = async (newPaper: QuestionPaper): Promise<'success' | 'saved_without_file' | 'failed'> => {
    if (isOffline) {
        const updated = [newPaper, ...papers];
        setPapers(updated);
        localStorage.setItem('edu_papers', JSON.stringify(updated));
        return 'success';
    }

    try {
      const dbPaper = {
        id: newPaper.id,
        title: newPaper.title,
        subject: newPaper.subject,
        grade: newPaper.grade,
        duration: newPaper.duration,
        questions: newPaper.questions,
        created_at: newPaper.createdAt,
        pdf_data: newPaper.pdfData,
        valid_from: newPaper.validFrom,
        valid_until: newPaper.validUntil
      };

      const { error } = await supabase.from('papers').insert(dbPaper);
      
      if (error) {
         console.warn("Attempt 1 Failed:", error.message);
         const { pdf_data, ...paperWithoutPdf } = dbPaper;
         const { error: retryError } = await supabase.from('papers').insert(paperWithoutPdf);

         if (retryError) {
             if (retryError.code === 'PGRST204' || retryError.message.includes('column')) {
                  const { valid_from, valid_until, ...paperSafe } = paperWithoutPdf;
                  const { error: finalError } = await supabase.from('papers').insert(paperSafe);
                  if (finalError) throw finalError;
                  
                  const safePaper = { ...newPaper, pdfData: undefined, validFrom: undefined, validUntil: undefined };
                  setPapers(prev => [safePaper, ...prev]);
                  return 'saved_without_file';
             }
             throw retryError;
         }

         const paperNoFile = { ...newPaper, pdfData: undefined };
         setPapers(prev => [paperNoFile, ...prev]);
         return 'saved_without_file';
      }
      
      setPapers(prev => [newPaper, ...prev]);
      return 'success';

    } catch (e: any) {
      console.error("Critical Save Error", e);
      alert("Failed to save paper to database: " + (e.message || "Network Error"));
      return 'failed';
    }
  };

  const handlePaperDeleted = async (paperId: string) => {
    if (confirm("WARNING: Are you sure you want to delete this paper?")) {
      if (isOffline) {
          const updated = papers.filter(p => p.id !== paperId);
          setPapers(updated);
          localStorage.setItem('edu_papers', JSON.stringify(updated));
          
          const updatedSubs = submissions.filter(s => s.paperId !== paperId);
          setSubmissions(updatedSubs);
          localStorage.setItem('edu_submissions', JSON.stringify(updatedSubs));
          return;
      }

      try {
        const { error: subError } = await supabase.from('submissions').delete().eq('paper_id', paperId);
        if (subError && subError.code !== 'PGRST116') console.error("Error removing submissions:", subError);

        const { error } = await supabase.from('papers').delete().eq('id', paperId);
        if (error) throw error;
        
        setPapers(prev => prev.filter(p => p.id !== paperId));
        setSubmissions(prev => prev.filter(s => s.paperId !== paperId));
      } catch (e: any) {
        alert("Failed to delete paper: " + e.message);
      }
    }
  };

  // ROBUST SUBMISSION HANDLER
  const handleSubmissionReceived = async (submission: Submission): Promise<boolean> => {
    let success = false;

    // 1. Try Online Database
    if (!isOffline) {
        try {
            const dbSubmission = {
                id: submission.id,
                paper_id: submission.paperId,
                paper_title: submission.paperTitle,
                student_id: submission.studentId,
                student_name: submission.studentName,
                student_grade: submission.studentGrade,
                submitted_at: submission.submittedAt,
                answers: submission.answers
            };

            const { error } = await supabase.from('submissions').insert(dbSubmission);
            if (!error) success = true;
            else console.warn("Supabase insert failed, falling back to local storage.", error);

        } catch (e) {
            console.warn("Network error during submission, falling back to local storage.", e);
        }
    }

    // 2. If Online failed or Offline, save Locally
    if (!success) {
        try {
            const currentSubs = JSON.parse(localStorage.getItem('edu_submissions') || '[]');
            const updated = [submission, ...currentSubs];
            localStorage.setItem('edu_submissions', JSON.stringify(updated));
            success = true;
            if (!isOffline) alert("⚠️ Network issue detected. Exam saved locally on this device. Notify your instructor.");
        } catch (e) {
            console.error("Critical Local Save Error", e);
            success = false;
        }
    }

    // 3. Update UI State
    if (success) {
        setSubmissions(prev => [submission, ...prev]);
    }
    
    return success;
  };

  const handleStudentLogin = async (student: StudentProfile) => {
    setActiveStudent(student);
    const exists = students.find(s => s.id === student.id);
    
    if (isOffline) {
        if (!exists) {
            const updated = [...students, student];
            setStudents(updated);
            localStorage.setItem('edu_students', JSON.stringify(updated));
        }
        return;
    }
    
    if (!exists) {
      const dbStudent = {
        id: student.id,
        name: student.name,
        grade: student.grade,
        joined_at: student.joinedAt
      };
      const { error } = await supabase.from('students').upsert(dbStudent);
      if (error) console.error("Failed to register student in DB", error);
      else setStudents(prev => [...prev, student]);
    }
  };

  const handleLogout = () => {
    setRole(null);
    setIsTeacherAuthenticated(false);
    setActiveStudent(null);
  };

  const handleInstructorAuth = (instructor: Instructor) => {
    setIsTeacherAuthenticated(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-bold tracking-widest uppercase text-xs">Initializing Platform...</p>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {isOffline && (
            <div className="bg-amber-500 text-amber-900 px-4 py-2 text-center font-bold text-xs uppercase tracking-widest">
                ⚠ Offline Mode Active - Data saved locally
            </div>
        )}
        <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="text-white space-y-6">
                <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                </div>
                <h1 className="text-4xl font-black tracking-tight">EduAssess <span className="text-indigo-500">Pro</span></h1>
                </div>
                <p className="text-xl text-slate-400 leading-relaxed">
                Complete digital assessment platform. {isOffline ? 'Running in local demonstration mode.' : 'Secure cloud storage via Supabase.'}
                </p>
            </div>

            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl space-y-6 border border-white/20">
                <h2 className="text-2xl font-bold text-slate-800 text-center mb-4">Choose Your Portal</h2>
                <button 
                onClick={() => setRole('teacher')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-2xl flex items-center justify-between transition-all group active:scale-95 shadow-lg"
                >
                    <div className="text-left">
                    <p className="text-lg font-bold">Instructor Portal</p>
                    <p className="text-indigo-200 text-sm">Review Papers & Submissions</p>
                    </div>
                    <div className="bg-white/10 p-3 rounded-xl transition-transform group-hover:translate-x-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </div>
                </button>

                <button 
                onClick={() => setRole('student')}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 p-6 rounded-2xl flex items-center justify-between transition-all group active:scale-95 border border-slate-200"
                >
                    <div className="text-left">
                    <p className="text-lg font-bold">Student Portal</p>
                    <p className="text-slate-500 text-sm">Attempt Assigned Papers</p>
                    </div>
                    <div className="bg-slate-200 p-3 rounded-xl transition-transform group-hover:translate-x-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </div>
                </button>
            </div>
            </div>
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !isTeacherAuthenticated) {
    return <TeacherLogin 
        onAuthenticated={handleInstructorAuth} 
        onCancel={() => setRole(null)} 
        isOffline={isOffline}
    />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {isOffline && (
        <div className="bg-amber-500 text-amber-900 text-center text-[10px] font-bold uppercase tracking-widest py-1">
            Offline Mode • Changes saved to browser storage
        </div>
      )}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleLogout}>
           <div className="bg-indigo-600 p-1.5 rounded-lg">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
           </div>
           <span className="text-xl font-black text-slate-800 tracking-tight">EduAssess <span className="text-indigo-600">Pro</span></span>
        </div>
        
        <div className="flex items-center gap-4">
           {activeStudent && (
             <div className="text-right mr-2 hidden sm:block">
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Class {activeStudent.grade}</p>
               <p className="text-sm font-bold text-slate-700">{activeStudent.name}</p>
             </div>
           )}
           {role === 'teacher' && (
             <div className="text-right mr-2 hidden sm:block">
               <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Instructor Mode</p>
               <p className="text-sm font-bold text-slate-700">Exam Administrator</p>
             </div>
           )}
           <button onClick={handleLogout} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500" title="Logout">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
           </button>
        </div>
      </nav>

      <div className="animate-in fade-in duration-500">
        {role === 'teacher' ? (
          <TeacherView 
            onPaperCreated={handlePaperCreated} 
            onPaperDeleted={handlePaperDeleted} 
            existingPapers={papers} 
            submissions={submissions}
          />
        ) : (
          <StudentView 
            papers={papers} 
            activeStudent={activeStudent} 
            onLogin={handleStudentLogin}
            registeredStudents={students}
            onSubmission={handleSubmissionReceived}
          />
        )}
      </div>
    </div>
  );
};

export default App;
