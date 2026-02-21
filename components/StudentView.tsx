import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { QuestionPaper, AnswerSubmission, ExamSession, StudentProfile, SUPPORTED_GRADES, Submission } from '../types';
import SpecializedKeyboard from './SpecializedKeyboard';

interface StudentViewProps {
  papers: QuestionPaper[];
  activeStudent: StudentProfile | null;
  onLogin: (student: StudentProfile) => void;
  registeredStudents: StudentProfile[];
  onSubmission: (submission: Submission) => Promise<boolean>;
}

const StudentView: React.FC<StudentViewProps> = ({ papers, activeStudent, onLogin, registeredStudents, onSubmission }) => {
  const [activeSession, setActiveSession] = useState<ExamSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false); 
  const [showMobileReference, setShowMobileReference] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginClass, setLoginClass] = useState('');
  
  const activeSessionRef = useRef<ExamSession | null>(null);
  const activeStudentRef = useRef<StudentProfile | null>(null);

  useEffect(() => {
    activeSessionRef.current = activeSession;
    activeStudentRef.current = activeStudent;
  }, [activeSession, activeStudent]);

  // Handle PDF/Image blob conversion for reliable display
  const referenceUrl = useMemo(() => {
    const data = activeSession?.paper.pdfData;
    if (!data) return null;

    if (data.startsWith('data:image')) return data;

    if (data.startsWith('data:application/pdf')) {
      try {
        const base64 = data.split(',')[1];
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        return URL.createObjectURL(blob);
      } catch (e) {
        console.error("Failed to create PDF blob URL", e);
        return data; 
      }
    }
    return data;
  }, [activeSession?.paper.pdfData]);

  useEffect(() => {
    return () => {
      if (referenceUrl && referenceUrl.startsWith('blob:')) {
        URL.revokeObjectURL(referenceUrl);
      }
    };
  }, [referenceUrl]);

  const processSubmission = async (session: ExamSession, student: StudentProfile, isAuto: boolean) => {
      setIsSubmitting(true);
      try {
        const submission: Submission = {
          id: `sub-${Date.now()}`,
          paperId: session.paper.id,
          paperTitle: session.paper.title,
          studentId: student.id,
          studentName: student.name,
          studentGrade: student.grade,
          submittedAt: new Date().toISOString(),
          answers: session.answers
        };

        const success = await onSubmission(submission);

        if (success) {
            setIsStarted(false);
            setActiveSession(null);
            activeSessionRef.current = null;
            setShowSubmitModal(false);
            if (isAuto) {
                alert("Time's up! Your exam has been automatically submitted.");
            } else {
                alert(`✅ Exam submitted successfully! Great job, ${student.name}.`);
            }
        } else {
            alert("⚠️ Submission Failed. Please check your connection and try again.");
        }
      } catch (error) {
          console.error("Submission error:", error);
          alert("An unexpected error occurred. Please try again.");
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleManualSubmitClick = () => {
     if (!activeSession) return;
     setShowSubmitModal(true);
  };

  const confirmSubmit = async () => {
    const session = activeSession || activeSessionRef.current;
    const student = activeStudent || activeStudentRef.current;
    if (!session || !student) return;
    await processSubmission(session, student, false);
  };

  const handleAutoSubmit = useCallback(() => {
      const session = activeSessionRef.current;
      const student = activeStudentRef.current;
      if (session && student) {
          processSubmission(session, student, true);
      }
  }, []);

  useEffect(() => {
    if (!isStarted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isStarted]);

  useEffect(() => {
    if (isStarted && timeLeft === 0) {
      handleAutoSubmit();
    }
  }, [timeLeft, isStarted, handleAutoSubmit]);

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName || !loginClass) return;
    
    const existing = registeredStudents.find(s => s.name === loginName && s.grade === loginClass);
    if (existing) {
      onLogin(existing);
    } else {
      const newStudent: StudentProfile = {
        id: Math.random().toString(36).substr(2, 9),
        name: loginName,
        grade: loginClass,
        joinedAt: new Date().toISOString()
      };
      onLogin(newStudent);
    }
  };

  const startExam = (paper: QuestionPaper) => {
    const newSession = {
      paper,
      startTime: Date.now(),
      answers: {}
    };
    setActiveSession(newSession);
    activeSessionRef.current = newSession; 
    setTimeLeft(paper.duration * 60);
    setIsStarted(true);
    setCurrentQuestionIndex(0);
  };

  const updateAnswer = (text: string) => {
    if (!activeSession) return;
    const currentQ = activeSession.paper.questions[currentQuestionIndex];
    setActiveSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        answers: {
          ...prev.answers,
          [currentQ.id]: {
            questionId: currentQ.id,
            answerText: text,
            imageUri: prev.answers[currentQ.id]?.imageUri
          }
        }
      };
    });
  };

  const updateImage = (base64: string) => {
    if (!activeSession) return;
    const currentQ = activeSession.paper.questions[currentQuestionIndex];
    setActiveSession(prev => {
       if (!prev) return null;
       return {
         ...prev,
         answers: {
           ...prev.answers,
           [currentQ.id]: {
             ...prev.answers[currentQ.id],
             questionId: currentQ.id,
             imageUri: base64
           }
         }
       };
    });
  }

  const removeImage = () => {
    if (!activeSession) return;
    const currentQ = activeSession.paper.questions[currentQuestionIndex];
    setActiveSession(prev => {
       if (!prev) return null;
       return {
         ...prev,
         answers: {
           ...prev.answers,
           [currentQ.id]: {
             ...prev.answers[currentQ.id],
             questionId: currentQ.id,
             imageUri: undefined
           }
         }
       };
    });
  }

  const handleKeyPress = (char: string) => {
    const currentAnswerText = activeSession?.answers[activeSession.paper.questions[currentQuestionIndex].id]?.answerText || '';
    updateAnswer(currentAnswerText + char);
  };

  const handleDelete = () => {
    const currentAnswerText = activeSession?.answers[activeSession.paper.questions[currentQuestionIndex].id]?.answerText || '';
    updateAnswer(currentAnswerText.slice(0, -1));
  };

  const handleClear = () => {
    updateAnswer('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeSession) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        updateImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const getSessionStats = () => {
      if (!activeSession) return { total: 0, answered: 0, skipped: 0 };
      const total = activeSession.paper.questions.length;
      const answered = Object.values(activeSession.answers).filter((a: AnswerSubmission) => a.answerText.trim() !== '' || a.imageUri).length;
      return { total, answered, skipped: total - answered };
  };

  if (!activeStudent) {
    return (
      <div className="max-w-xl mx-auto p-6 mt-12">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100 overflow-hidden relative">
          <h1 className="text-3xl font-black text-slate-900 mb-2">Verification</h1>
          <p className="text-slate-500 mb-8 font-medium">Verify your identity to see your assigned exams.</p>
          <form onSubmit={handleIdentitySubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Student Name</label>
              <input type="text" required value={loginName} onChange={(e) => setLoginName(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-semibold" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Class</label>
              <select required value={loginClass} onChange={(e) => setLoginClass(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-semibold">
                <option value="">Select...</option>
                {SUPPORTED_GRADES.map(g => <option key={g} value={g}>Class {g}</option>)}
              </select>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm">Verify & Enter</button>
          </form>
        </div>
      </div>
    );
  }

  if (!isStarted) {
    const filteredPapers = papers.filter(p => p.grade === activeStudent.grade);
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8">
          <h1 className="text-3xl font-black text-slate-900 mb-10">Welcome, {activeStudent.name}</h1>
          <div className="grid gap-6">
            {filteredPapers.map(paper => (
              <div key={paper.id} className="bg-white border border-slate-200 rounded-[1.5rem] p-6 flex justify-between items-center shadow-sm">
                <div>
                  <h3 className="text-xl font-black text-slate-800">{paper.title}</h3>
                  <p className="text-slate-500 text-sm">{paper.subject} • {paper.duration} Min</p>
                </div>
                <button onClick={() => startExam(paper)} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[10px]">Start Exam</button>
              </div>
            ))}
            {filteredPapers.length === 0 && <p className="text-center py-20 text-slate-400">No exams currently scheduled.</p>}
          </div>
        </div>
      </div>
    );
  }

  const currentQ = activeSession!.paper.questions[currentQuestionIndex];
  const currentAnswer = activeSession!.answers[currentQ.id];
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  
  const stats = getSessionStats();

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 relative overflow-hidden">
      {showSubmitModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
              <h3 className="text-2xl font-black text-slate-900 mb-6 text-center">Ready to submit?</h3>
              <div className="space-y-4 mb-8">
                 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Total</span>
                    <span className="font-black text-slate-900 text-lg">{stats.total}</span>
                 </div>
                 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Completed</span>
                    <span className="font-black text-green-600 text-lg">{stats.answered}</span>
                 </div>
              </div>
              <div className="flex gap-3">
                 <button onClick={() => setShowSubmitModal(false)} className="flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest bg-slate-100 text-slate-600">Cancel</button>
                 <button onClick={confirmSubmit} disabled={isSubmitting} className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-indigo-600 text-white">Confirm</button>
              </div>
           </div>
        </div>
      )}

      <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm shrink-0 z-40 relative">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white w-10 h-10 rounded-lg flex items-center justify-center font-black">{currentQuestionIndex + 1}</div>
          <div>
             <h2 className="text-lg font-black text-slate-900 leading-tight">{activeSession?.paper.title}</h2>
             {referenceUrl && (
               <a 
                 href={referenceUrl} 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 className="text-[9px] px-2 py-1 rounded font-bold uppercase tracking-widest bg-slate-900 text-white mt-1 inline-block hover:scale-105 transition-transform"
               >
                 View Full Paper (New Tab)
               </a>
             )}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 mr-2">
             <button 
               disabled={currentQuestionIndex === 0} 
               onClick={() => setCurrentQuestionIndex(prev => prev - 1)} 
               className="p-2 hover:bg-white rounded-lg transition-colors disabled:opacity-30 text-slate-600"
               title="Previous Question"
             >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
             </button>
             <div className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-x border-slate-200">
                {currentQuestionIndex + 1} / {activeSession?.paper.questions.length}
             </div>
             <button 
               disabled={currentQuestionIndex === activeSession?.paper.questions.length! - 1} 
               onClick={() => setCurrentQuestionIndex(prev => prev + 1)} 
               className="p-2 hover:bg-white rounded-lg transition-colors disabled:opacity-30 text-slate-600"
               title="Next Question"
             >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
             </button>
          </div>
          <button 
            onClick={() => setIsKeyboardOpen(!isKeyboardOpen)} 
            className={`p-3 rounded-xl transition-all ${isKeyboardOpen ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            title="Toggle Digital Input Tools"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          <p className={`text-xl font-mono font-black tabular-nums ${timeLeft < 300 ? 'text-red-500 animate-pulse' : ''}`}>{formatTime(timeLeft)}</p>
          <button onClick={handleManualSubmitClick} className="px-6 py-3 rounded-xl font-black uppercase text-[10px] bg-green-600 text-white">Finish Exam</button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
         {/* SPLIT VIEW PDF */}
         <div className="flex-1 bg-slate-800 p-4 hidden md:block border-r border-slate-200 overflow-hidden relative">
            <div className="absolute top-6 left-6 z-10 bg-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg uppercase tracking-widest">
              PDF Reference
            </div>
            <div className="w-full h-full rounded-2xl overflow-hidden bg-white shadow-2xl relative">
               {referenceUrl ? (
                 <iframe 
                   key={referenceUrl} 
                   src={referenceUrl} 
                   className="w-full h-full border-none" 
                   title="Exam Content" 
                 />
               ) : (
                 <div className="flex items-center justify-center h-full text-slate-400 font-bold uppercase tracking-widest">No Reference Paper Attached</div>
               )}
            </div>
         </div>
         
         {/* MOBILE VIEW TOGGLE */}
         {showMobileReference && referenceUrl && (
           <div className="fixed inset-0 z-[60] bg-slate-900 flex flex-col md:hidden">
             <div className="flex items-center justify-between p-4 bg-slate-800 text-white">
               <h3 className="font-bold">Exam Source</h3>
               <button onClick={() => setShowMobileReference(false)} className="p-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
             <div className="flex-1 overflow-hidden bg-white">
               <iframe src={referenceUrl} className="w-full h-full border-none" title="Mobile Reference" />
             </div>
           </div>
         )}

         {/* QUESTION PANEL */}
         <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${isKeyboardOpen ? 'pb-[340px]' : 'pb-24'}`}>
            <div className="max-w-3xl mx-auto">
               <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                     <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Question {currentQuestionIndex+1} of {activeSession?.paper.questions.length}</p>
                     <button onClick={() => setShowMobileReference(true)} className="md:hidden text-[9px] font-black uppercase bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg">View Source Paper</button>
                  </div>
               
               <h3 className="text-xl md:text-2xl font-bold text-slate-800 mb-8 leading-relaxed">{currentQ.text}</h3>
               
               {currentQ.image && <div className="mb-8"><img src={currentQ.image} className="max-w-full h-auto rounded-2xl border border-slate-200 shadow-sm" alt="Diagram" /></div>}

               {currentQ.type === 'mcq' && currentQ.options ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {currentQ.options.map((opt, i) => (
                     <button key={i} onClick={() => updateAnswer(opt)} className={`p-6 rounded-2xl border-2 text-left font-bold transition-all ${currentAnswer?.answerText === opt ? 'bg-indigo-50 border-indigo-600' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                       <span className="mr-3 text-slate-400">{String.fromCharCode(65 + i)}.</span>
                       {opt}
                     </button>
                   ))}
                 </div>
               ) : (
                 <textarea 
                   value={currentAnswer?.answerText || ''} 
                   onFocus={() => setIsKeyboardOpen(true)}
                   onChange={(e) => updateAnswer(e.target.value)}
                   className="w-full min-h-[250px] p-8 rounded-[2rem] border-2 border-slate-100 bg-slate-50 font-mono text-xl focus:border-indigo-500 outline-none transition-all"
                   placeholder="Enter your solution here..."
                 />
               )}

                <div className="mt-8 pt-8 border-t border-slate-100">
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex flex-col gap-1">
                         <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Visual Answer</span>
                            {currentQ.requiresImage && <span className="text-[8px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black uppercase">Required</span>}
                         </div>
                         <p className="text-xs text-slate-400 font-medium">Upload a photo of your handwritten work or diagrams.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {!currentAnswer?.imageUri ? (
                          <label className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 px-6 py-3 rounded-2xl cursor-pointer hover:bg-indigo-100 transition-colors group">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                             <span className="text-[10px] font-black uppercase text-indigo-600">Upload Image</span>
                             <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                          </label>
                        ) : (
                          <div className="flex items-center gap-3">
                             <div className="relative group">
                                <img src={currentAnswer.imageUri} className="w-16 h-16 object-cover rounded-xl border-2 border-indigo-200 shadow-md cursor-zoom-in" alt="Work" onClick={() => window.open(currentAnswer.imageUri, '_blank')} />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                                </div>
                             </div>
                             <button onClick={removeImage} className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors" title="Remove Image">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                             </button>
                          </div>
                        )}
                      </div>
                   </div>
                </div>
            </div>

            </div>
         </div>
      </div>

      <SpecializedKeyboard isOpen={isKeyboardOpen} setIsOpen={setIsKeyboardOpen} onKeyPress={handleKeyPress} onDelete={handleDelete} onClear={handleClear} />
    </div>
  );
};

export default StudentView;