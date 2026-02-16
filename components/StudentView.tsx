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

  // Handle PDF/Image blob conversion to fix display issues
  const referenceUrl = useMemo(() => {
    const data = activeSession?.paper.pdfData;
    if (!data) return null;

    // If it's already an image data URL, we can use it directly
    if (data.startsWith('data:image')) return data;

    // If it's a PDF data URL, convert to Blob for more reliable rendering
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
        return data; // Fallback to raw data URI
      }
    }
    return data;
  }, [activeSession?.paper.pdfData]);

  // Clean up blob URL to prevent memory leaks
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

    if (!session || !student) {
        alert("Session error. Please reload.");
        setShowSubmitModal(false);
        return;
    }

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
      <div className="max-w-xl mx-auto p-6 mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100 overflow-hidden relative">
          <h1 className="text-3xl font-black text-slate-900 mb-2">Student Portal</h1>
          <p className="text-slate-500 mb-8 font-medium">Verify your identity to see assessments.</p>
          
          <form onSubmit={handleIdentitySubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-widest">Full Name</label>
              <input type="text" required value={loginName} onChange={(e) => setLoginName(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-semibold" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-widest">Select Class</label>
              <select required value={loginClass} onChange={(e) => setLoginClass(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-semibold">
                <option value="">Select class...</option>
                {SUPPORTED_GRADES.map(g => <option key={g} value={g}>Class {g}</option>)}
              </select>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase tracking-widest text-sm">Verify & Enter</button>
          </form>
        </div>
      </div>
    );
  }

  if (!isStarted) {
    const filteredPapers = papers.filter(p => p.grade === activeStudent.grade);
    const now = new Date();

    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8">
          <h1 className="text-3xl font-black text-slate-900 mb-10">Welcome, {activeStudent.name}!</h1>
          <div className="grid gap-6">
            {filteredPapers.map(paper => {
              const start = paper.validFrom ? new Date(paper.validFrom) : null;
              const end = paper.validUntil ? new Date(paper.validUntil) : null;
              
              let isLocked = false;
              let statusLabel = "";
              
              if (start && now < start) {
                 isLocked = true;
                 statusLabel = `Opens: ${start.toLocaleString()}`;
              } else if (end && now > end) {
                 isLocked = true;
                 statusLabel = `Closed: ${end.toLocaleString()}`;
              }

              return (
                <div key={paper.id} className={`bg-slate-50 border border-slate-200 rounded-[1.5rem] p-6 flex justify-between items-center ${isLocked ? 'opacity-70 grayscale-[0.5]' : ''}`}>
                  <div>
                    <h3 className="text-xl font-black text-slate-800">{paper.title}</h3>
                    <p className="text-slate-500">{paper.subject} • {paper.duration} Min</p>
                    {statusLabel && <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mt-2">{statusLabel}</p>}
                  </div>
                  <button 
                    disabled={isLocked}
                    onClick={() => startExam(paper)} 
                    className={`px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] ${isLocked ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                  >
                    {isLocked ? 'Locked' : 'Attempt'}
                  </button>
                </div>
              );
            })}
            {filteredPapers.length === 0 && (
               <div className="text-center py-10 text-slate-400 font-medium">No papers assigned for your class yet.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const currentQ = activeSession!.paper.questions[currentQuestionIndex];
  const currentAnswer = activeSession!.answers[currentQ.id];
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  
  const isPDFImage = activeSession?.paper.pdfData?.startsWith('data:image');
  const refersToDiagram = currentQ.text.toLowerCase().includes('diagram') || currentQ.text.toLowerCase().includes('figure') || currentQ.text.toLowerCase().includes('refer to');

  const ReferenceViewer = () => {
    if (!referenceUrl) return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-900/50">
        <p className="font-bold text-xs uppercase tracking-widest">Reference Not Available</p>
      </div>
    );

    if (isPDFImage) {
      return <img src={referenceUrl} className="w-full h-full object-contain bg-white" alt="Question Paper Reference" />;
    }

    return (
      <object
        data={referenceUrl}
        type="application/pdf"
        className="w-full h-full rounded-2xl bg-white"
      >
        <iframe 
          src={referenceUrl} 
          className="w-full h-full rounded-2xl bg-white"
          title="Exam Paper Reference"
        />
      </object>
    );
  };

  const stats = getSessionStats();

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 relative overflow-hidden">
      {showSubmitModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
              <h3 className="text-2xl font-black text-slate-900 mb-6 text-center">Finish Exam?</h3>
              
              <div className="space-y-4 mb-8">
                 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Total Questions</span>
                    <span className="font-black text-slate-900 text-lg">{stats.total}</span>
                 </div>
                 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Answered</span>
                    <span className="font-black text-green-600 text-lg">{stats.answered}</span>
                 </div>
                 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Skipped</span>
                    <span className={`font-black text-lg ${stats.skipped > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{stats.skipped}</span>
                 </div>
              </div>

              {stats.skipped > 0 ? (
                 <div className="bg-amber-50 text-amber-800 p-4 rounded-xl mb-6 text-xs font-bold flex items-start gap-3">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                   <p>You have {stats.skipped} unanswered questions. Are you sure you want to submit?</p>
                 </div>
              ) : (
                 <div className="bg-green-50 text-green-800 p-4 rounded-xl mb-6 text-xs font-bold text-center">
                   You have answered all questions. Ready to submit!
                 </div>
              )}

              <div className="flex gap-3">
                 <button 
                   onClick={() => setShowSubmitModal(false)}
                   className="flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                 >
                   Return
                 </button>
                 <button 
                   onClick={confirmSubmit}
                   disabled={isSubmitting}
                   className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-colors flex items-center justify-center gap-2"
                 >
                   {isSubmitting && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                   {isSubmitting ? 'Sending...' : 'Confirm'}
                 </button>
              </div>
           </div>
        </div>
      )}

      <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm shrink-0 z-40 relative">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white w-10 h-10 rounded-lg flex items-center justify-center font-black">{currentQuestionIndex + 1}</div>
          <div className="flex flex-col">
             <h2 className="text-lg font-black text-slate-900 leading-tight line-clamp-1">{activeSession?.paper.title}</h2>
             {referenceUrl && (
               <button 
                 onClick={() => setShowMobileReference(true)}
                 className={`md:hidden text-left text-[9px] px-2 py-1 rounded font-bold uppercase tracking-widest mt-1 flex items-center gap-1 transition-all ${refersToDiagram ? 'bg-indigo-600 text-white animate-pulse' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                 {refersToDiagram ? 'View Required Diagram' : 'View Question Paper'}
               </button>
             )}
             {referenceUrl && <span className="hidden md:inline-block text-[9px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold uppercase tracking-widest mt-1">Split View Active</span>}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-black tracking-widest uppercase">Time Left</p>
            <p className={`text-xl font-mono font-black tabular-nums ${timeLeft < 300 ? 'text-red-500 animate-pulse' : ''}`}>{formatTime(timeLeft)}</p>
          </div>
          <button 
            type="button"
            onClick={handleManualSubmitClick} 
            disabled={isSubmitting}
            className={`
              px-6 py-3 rounded-xl font-black uppercase text-[10px] transition-all shadow-lg active:scale-95 z-50 relative flex items-center gap-2
              ${isSubmitting ? 'bg-slate-400 text-slate-200 cursor-wait' : 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'}
            `}
          >
            {isSubmitting ? 'Sending...' : 'Finish Exam'}
          </button>
        </div>
      </div>

      <div className={`flex flex-col md:flex-row flex-1 overflow-hidden relative`}>
         {referenceUrl && (
            <div className="flex-1 bg-slate-800 p-4 hidden md:block border-r border-slate-200 overflow-hidden relative group">
              <ReferenceViewer />
              <div className="absolute top-6 right-6 bg-black/50 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {isPDFImage ? 'Image Reference' : 'PDF Reference'}
              </div>
            </div>
         )}
         
         {showMobileReference && referenceUrl && (
           <div className="fixed inset-0 z-[60] bg-slate-900 flex flex-col md:hidden">
             <div className="flex items-center justify-between p-4 bg-slate-800 text-white shrink-0">
               <h3 className="font-bold">Question Paper Reference</h3>
               <button onClick={() => setShowMobileReference(false)} className="bg-white/10 p-2 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
             <div className="flex-1 p-2 overflow-auto bg-black">
               <ReferenceViewer />
             </div>
           </div>
         )}

         <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${isKeyboardOpen ? 'pb-[340px]' : 'pb-24'}`}>
            <div className="max-w-3xl mx-auto bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm">
               <div className="flex justify-between items-center mb-2">
                 <p className="text-xs font-black text-indigo-600 uppercase">Question {currentQuestionIndex+1}</p>
                 <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase">{currentQ.points} Points</span>
               </div>
               
               <h3 className="text-xl md:text-2xl font-medium text-slate-800 mb-6 whitespace-pre-wrap leading-relaxed">{currentQ.text}</h3>
               
               {currentQ.image && (
                 <div className="mb-8 group relative inline-block">
                   <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Reference Diagram</p>
                   <img src={currentQ.image} alt="Question Diagram" className="max-w-full max-h-[500px] w-auto rounded-2xl border border-slate-200 shadow-sm object-contain bg-slate-50" />
                 </div>
               )}

               {currentQ.type === 'mcq' && currentQ.options ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {currentQ.options.map((opt, i) => (
                     <button key={i} onClick={() => updateAnswer(opt)} className={`p-5 rounded-2xl border-2 text-left font-bold transition-all ${currentAnswer?.answerText === opt ? 'bg-indigo-50 border-indigo-600 shadow-md scale-[1.01]' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                       <div className="flex items-center gap-3">
                         <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] ${currentAnswer?.answerText === opt ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-400'}`}>
                           {String.fromCharCode(65 + i)}
                         </div>
                         <span>{opt || `Option ${i + 1}`}</span>
                       </div>
                     </button>
                   ))}
                 </div>
               ) : (
                 <textarea 
                   value={currentAnswer?.answerText || ''} 
                   onFocus={() => setIsKeyboardOpen(true)}
                   onChange={(e) => updateAnswer(e.target.value)}
                   className="w-full min-h-[200px] p-6 rounded-2xl border border-slate-200 bg-slate-50 font-mono text-xl focus:ring-4 focus:ring-indigo-500/10 outline-none"
                   placeholder="Type your answer here..."
                 />
               )}

               <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-between">
                  <label className="flex items-center gap-3 bg-slate-50 border-2 border-dashed border-slate-200 px-6 py-3 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                     <span className="text-xs font-black uppercase tracking-widest text-slate-500">Capture Work</span>
                     <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
                  </label>
                  {currentAnswer?.imageUri && <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right"><img src={currentAnswer.imageUri} className="w-12 h-12 object-cover rounded-lg border border-slate-200" /><span className="text-[9px] font-black uppercase text-green-600 bg-green-50 px-2 py-1 rounded">Attached</span></div>}
               </div>
            </div>

            <div className="max-w-3xl mx-auto flex justify-between mt-8">
               <button disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex(prev => prev - 1)} className="bg-white border border-slate-200 px-8 py-4 rounded-xl font-black uppercase text-xs hover:bg-slate-50 disabled:opacity-50 transition-all">Prev</button>
               <button disabled={currentQuestionIndex === activeSession?.paper.questions.length! - 1} onClick={() => setCurrentQuestionIndex(prev => prev + 1)} className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-black uppercase text-xs hover:bg-indigo-700 disabled:opacity-50 transition-all">Next</button>
            </div>
         </div>
      </div>

      <SpecializedKeyboard isOpen={isKeyboardOpen} setIsOpen={setIsKeyboardOpen} onKeyPress={handleKeyPress} onDelete={handleDelete} onClear={handleClear} />
    </div>
  );
};

export default StudentView;