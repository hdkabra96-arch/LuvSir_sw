// Block dangerous shortcuts during exam
const blockExamShortcuts = (e: KeyboardEvent) => {
  // List of blocked combinations
  const blocked = [
    (e.ctrlKey && e.key.toLowerCase() === 'w'), // Ctrl+W
    (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'w'), // Ctrl+Shift+W
    (e.metaKey && e.key.toLowerCase() === 'w'), // Cmd+W (Mac)
    (e.altKey && e.key.toLowerCase() === 'f4'), // Alt+F4
    (e.key === 'F5'), // F5
    (e.ctrlKey && e.key.toLowerCase() === 'r'), // Ctrl+R
    (e.metaKey && e.key.toLowerCase() === 'r'), // Cmd+R (Mac)
    (e.ctrlKey && e.key.toLowerCase() === 't'), // Ctrl+T (new tab)
    (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't'), // Ctrl+Shift+T (reopen tab)
    (e.ctrlKey && e.key.toLowerCase() === 'n'), // Ctrl+N (new window)
    (e.ctrlKey && e.key.toLowerCase() === 'tab'), // Ctrl+Tab (switch tab)
    (e.altKey && e.key.toLowerCase() === 'tab'), // Alt+Tab (switch app)
    (e.ctrlKey && e.key.toLowerCase() === 'f4'), // Ctrl+F4 (close tab)
    (e.metaKey && e.key.toLowerCase() === 'q'), // Cmd+Q (quit on Mac)
    (e.key === 'Escape'), // Escape (optional)
  ];
  if (blocked.some(Boolean)) {
    e.preventDefault();
    e.stopPropagation();
    alert('This keyboard shortcut is disabled during the exam.');
    return false;
  }
};
  // Attach/detach shortcut blocker only during exam
  useEffect(() => {
    if (isStarted) {
      window.addEventListener('keydown', blockExamShortcuts, true);
      window.addEventListener('beforeunload', (e) => {
        e.preventDefault();
        e.returnValue = '';
      });
    } else {
      window.removeEventListener('keydown', blockExamShortcuts, true);
    }
    return () => {
      window.removeEventListener('keydown', blockExamShortcuts, true);
    };
  }, [isStarted]);
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { QuestionPaper, AnswerSubmission, ExamSession, StudentProfile, SUPPORTED_GRADES, Submission } from '../types';
import SpecializedKeyboard from './SpecializedKeyboard';
import EditableTable from './EditableTable';

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
  const [renderError, setRenderError] = useState<string | null>(null);

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
      const existingAnswer = prev.answers[currentQ.id] || {};
      return {
        ...prev,
        answers: {
          ...prev.answers,
          [currentQ.id]: {
            questionId: currentQ.id,
            answerText: text,
            imageUri: existingAnswer.imageUri || undefined,
            tableData: existingAnswer.tableData
          }
        }
      };
    });
  };

  // Only allow superscript/subscript at end of answer
  const handleSpecialKeyPress = (char: string) => {
    if (!activeSession) return;
    const currentQ = activeSession.paper.questions[currentQuestionIndex];
    const textarea = document.querySelector('textarea');
    let answerText = activeSession.answers[currentQ.id]?.answerText || '';
    let cursorPos = textarea && textarea.selectionStart !== undefined ? textarea.selectionStart : answerText.length;
    // Superscript/subscript unicode ranges
    const isSuperSub = /[\u2070-\u209F]/.test(char);
    if (isSuperSub && cursorPos !== answerText.length) {
      alert('Superscript and subscript can only be inserted at the end of your answer.');
      return;
    }
    // Insert at end
    updateAnswer(answerText + char);
  };

  const updateImage = (base64: string) => {
    if (!activeSession) {
      console.warn("No active session");
      return;
    }
    try {
      const currentQ = activeSession.paper.questions[currentQuestionIndex];
      if (!currentQ) {
        console.warn("Current question not found");
        return;
      }

      setActiveSession(prev => {
        if (!prev) return null;
        try {
          const existingAnswer = prev.answers[currentQ.id] || {};
          return {
            ...prev,
            answers: {
              ...prev.answers,
              [currentQ.id]: {
                questionId: currentQ.id,
                answerText: existingAnswer.answerText || '',
                imageUri: base64,
                tableData: existingAnswer.tableData
              }
            }
          };
        } catch (error) {
          console.error("Error updating session state:", error);
          return prev;
        }
      });
    } catch (error) {
      console.error("Error in updateImage:", error);
      alert("Failed to save image. Please try again.");
    }
  }

  const handleKeyPress = (char: string) => {
    // Use special handler for superscript/subscript
    if (/[\u2070-\u209F]/.test(char)) {
      handleSpecialKeyPress(char);
    } else {
      const currentAnswerText = activeSession?.answers[activeSession.paper.questions[currentQuestionIndex].id]?.answerText || '';
      updateAnswer(currentAnswerText + char);
    }
  };

  const handleDelete = () => {
    const currentAnswerText = activeSession?.answers[activeSession.paper.questions[currentQuestionIndex].id]?.answerText || '';
    updateAnswer(currentAnswerText.slice(0, -1));
  };

  const handleClear = () => {
    updateAnswer('');
  };

  const handleInsertTable = (rows: number, cols: number) => {
    if (!activeSession) return;

    // Store table metadata in answer
    const currentAnswerText = activeSession?.answers[activeSession.paper.questions[currentQuestionIndex].id]?.answerText || '';
    const tableMarker = `\n[TABLE:${rows}x${cols}]\n`;

    // Add space for table data (will be edited in EditableTable)
    const tableData = Array(rows).fill(null).map(() => Array(cols).fill(''));

    // Store in a format we can retrieve
    setActiveSession(prev => {
      if (!prev) return null;
      const currentQ = prev.paper.questions[currentQuestionIndex];
      return {
        ...prev,
        answers: {
          ...prev.answers,
          [currentQ.id]: {
            ...prev.answers[currentQ.id],
            questionId: currentQ.id,
            answerText: currentAnswerText + tableMarker,
            tableData: tableData
          }
        }
      };
    });

    // Close keyboard after inserting table
    setIsKeyboardOpen(false);
  };

  const handleTableUpdate = (tableData: string[][]) => {
    if (!activeSession) return;
    const currentQ = activeSession.paper.questions[currentQuestionIndex];

    setActiveSession(prev => {
      if (!prev) return null;
      const existingAnswer = prev.answers[currentQ.id] || {};
      return {
        ...prev,
        answers: {
          ...prev.answers,
          [currentQ.id]: {
            questionId: currentQ.id,
            answerText: existingAnswer.answerText || '',
            imageUri: existingAnswer.imageUri,
            tableData: tableData
          }
        }
      };
    });
  };

  const handleRemoveTable = () => {
    if (!activeSession) return;
    const currentQ = activeSession.paper.questions[currentQuestionIndex];
    const currentAnswer = activeSession.answers[currentQ.id];

    // Remove table marker and data
    const textWithoutTable = currentAnswer?.answerText.replace(/\n\[TABLE:\d+x\d+\]\n/g, '') || '';

    setActiveSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        answers: {
          ...prev.answers,
          [currentQ.id]: {
            ...prev.answers[currentQ.id],
            questionId: currentQ.id,
            answerText: textWithoutTable,
            tableData: undefined
          }
        }
      };
    });
  };

  const handleDeleteImage = () => {
    if (!activeSession) return;
    const currentQ = activeSession.paper.questions[currentQuestionIndex];

    setActiveSession(prev => {
      if (!prev) return null;
      const existingAnswer = prev.answers[currentQ.id] || {};
      return {
        ...prev,
        answers: {
          ...prev.answers,
          [currentQ.id]: {
            questionId: currentQ.id,
            answerText: existingAnswer.answerText || '',
            imageUri: undefined,
            tableData: existingAnswer.tableData
          }
        }
      };
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!activeSession) {
        alert("No active exam session. Please start an exam first.");
        return;
      }

      // Validate file type against a whitelist of image MIME types
      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'image/webp', 'image/bmp', 'image/svg+xml', 'image/heic', 'image/heif'
      ];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        alert("Unsupported file type. Please upload an image (JPG, PNG, GIF, WebP, or BMP).");
        e.target.value = '';
        return;
      }

      // Validate file size (max 40MB)
      if (file.size > 40 * 1024 * 1024) {
        alert("File size must be less than 40 MB");
        e.target.value = '';
        return;
      }

      // Use Canvas to safely load, validate, and compress the image
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const dataUrl = event.target?.result as string;
          if (!dataUrl) {
            alert("Could not read the file. Please try again.");
            return;
          }

          // Create an Image element to validate the file is actually a valid image
          const img = new Image();
          img.onload = () => {
            try {
              // Compress if image is very large (> 2000px in any dimension)
              const MAX_DIMENSION = 2000;
              let width = img.width;
              let height = img.height;

              if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
              }

              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');

              if (!ctx) {
                // Canvas not supported - use the original data
                updateImage(dataUrl);
                return;
              }

              ctx.drawImage(img, 0, 0, width, height);

              // Convert to JPEG for compression (PNG for transparent images)
              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
              updateImage(compressedDataUrl);
            } catch (canvasError) {
              console.error("Canvas compression error, using original:", canvasError);
              // Fallback: use original data URL
              updateImage(dataUrl);
            }
          };

          img.onerror = () => {
            alert("The selected file is not a valid image or is corrupted. Please choose a different file.");
          };

          img.src = dataUrl;
        } catch (error) {
          console.error("Error processing image:", error);
          alert("Failed to process image. Please try a different image.");
        }
      };
      reader.onerror = () => {
        alert("Failed to read file. Please try again.");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Unexpected error in handleImageUpload:", error);
      alert("An unexpected error occurred. Please try again.");
    } finally {
      // Reset input value to allow uploading the same file again
      e.target.value = '';
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

  // Error recovery section
  if (renderError) {
    return (
      <div className="max-w-2xl mx-auto p-6 mt-20">
        <div className="bg-red-50 rounded-3xl shadow-xl p-8 border border-red-200">
          <h1 className="text-2xl font-black text-red-900 mb-4">⚠️ Something went wrong</h1>
          <p className="text-red-700 mb-6 font-medium">{renderError}</p>
          <p className="text-red-600 text-sm mb-6">Your answers have been saved. You can return to the exam list and try again.</p>
          <button
            onClick={() => {
              setRenderError(null);
              setIsStarted(false);
              setCurrentQuestionIndex(0);
            }}
            className="px-8 py-3 bg-red-600 text-white rounded-xl font-black uppercase text-xs hover:bg-red-700 transition-colors"
          >
            Back to Exams
          </button>
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
          <div className="max-w-3xl mx-auto bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Question {currentQuestionIndex + 1} of {activeSession?.paper.questions.length}</p>
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
              <div className="space-y-4">
                <textarea
                  value={currentAnswer?.answerText || ''}
                  onChange={(e) => updateAnswer(e.target.value)}
                  className="w-full min-h-[250px] p-8 rounded-[2rem] border-2 border-slate-100 bg-slate-50 font-mono text-xl focus:border-indigo-500 outline-none transition-all"
                  placeholder="Enter your solution here..."
                />
                {currentAnswer?.tableData && currentAnswer.tableData.length > 0 && (
                  <EditableTable
                    key={currentQ.id}
                    rows={currentAnswer.tableData.length}
                    cols={currentAnswer.tableData[0].length}
                    initialData={currentAnswer.tableData}
                    onUpdate={handleTableUpdate}
                    onRemove={handleRemoveTable}
                  />
                )}
              </div>
            )}

            <div className="mt-8 pt-8 border-t border-slate-100">
              <div className="flex flex-wrap justify-center items-center gap-3 mb-8">
                <label className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                  <span className="text-xs font-black uppercase text-slate-600">{currentAnswer?.imageUri ? 'Change' : 'Upload Image'}</span>
                  <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/heic,image/heif,image/*" className="hidden" onChange={handleImageUpload} />
                </label>

                <button
                  onClick={() => setIsKeyboardOpen(!isKeyboardOpen)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors border ${isKeyboardOpen ? 'bg-indigo-100 border-indigo-300 hover:bg-indigo-200' : 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" /></svg>
                  <span className="text-xs font-black uppercase text-indigo-700">{isKeyboardOpen ? 'Hide Keyboard' : 'Special Keyboard'}</span>
                </button>
              </div>

              <div className="flex justify-center items-center gap-4 mb-8">
                {currentAnswer?.imageUri && (
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={currentAnswer.imageUri}
                        className="w-14 h-14 object-cover rounded-lg border-2 border-green-200"
                        alt="Work"
                        onError={() => {
                          console.error("Image failed to load - removing broken image");
                          handleDeleteImage();
                        }}
                      />
                    </div>
                    <button
                      onClick={handleDeleteImage}
                      className="text-xs font-bold text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      ✕ Delete
                    </button>
                    <span className="text-xs font-bold text-green-600">✓ Image</span>
                  </div>
                )}
                {currentAnswer?.answerText && (
                  <span className="text-xs font-bold text-blue-600">✓ Text ({currentAnswer.answerText.replace(/\[TABLE[^\]]*\]/g, '').length} chars)</span>
                )}
              </div>
            </div>
          </div>

          <div className="max-w-3xl mx-auto flex justify-center items-center gap-6 mt-10 pb-4">
            <button disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex(prev => prev - 1)} className="bg-white border border-slate-200 px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest disabled:opacity-30 hover:bg-slate-50">Previous</button>
            <button disabled={currentQuestionIndex === activeSession?.paper.questions.length! - 1} onClick={() => setCurrentQuestionIndex(prev => prev + 1)} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest disabled:opacity-30 hover:bg-indigo-700">Next</button>
          </div>
        </div>
      </div>

      <SpecializedKeyboard isOpen={isKeyboardOpen} setIsOpen={setIsKeyboardOpen} onKeyPress={handleKeyPress} onDelete={handleDelete} onClear={handleClear} onInsertTable={handleInsertTable} />
    </div>
  );
};

export default StudentView;