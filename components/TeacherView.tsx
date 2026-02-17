import React, { useState, useRef, useEffect, useMemo } from 'react';
import { QuestionPaper, Question, SUPPORTED_GRADES, Submission } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

interface TeacherViewProps {
  onPaperCreated: (paper: QuestionPaper) => Promise<'success' | 'saved_without_file' | 'failed'>;
  onPaperDeleted: (id: string) => void;
  existingPapers: QuestionPaper[];
  submissions: Submission[];
}

const TeacherView: React.FC<TeacherViewProps> = ({ onPaperCreated, onPaperDeleted, existingPapers, submissions }) => {
  const [activeTab, setActiveTab] = useState<'papers' | 'submissions'>('papers');
  const [showCreator, setShowCreator] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  
  // Creation State
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [duration, setDuration] = useState(60);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // File Upload & AI State
  const [uploadedFile, setUploadedFile] = useState<{name: string, data: string, type: string, size: number} | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadMode, setUploadMode] = useState<'full_paper' | 'question_snips'>('full_paper');
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [totalToAnalyze, setTotalToAnalyze] = useState(0);

  // Clean up Blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // --- HELPER: Advanced Compression ---
  const compressImage = (base64Str: string, maxWidth = 1200, quality = 0.5): Promise<string> => {
    return new Promise((resolve) => {
      if (base64Str.startsWith('data:application/pdf')) {
          resolve(base64Str);
          return;
      }
      
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
            resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const addQuestion = (type: 'subjective' | 'mcq' = 'subjective') => {
    setQuestions([...questions, { 
      id: Math.random().toString(36).substr(2, 9), 
      text: '', 
      type, 
      points: 5, 
      options: type === 'mcq' ? ['', '', '', ''] : undefined,
      image: undefined
    }]);
  };

  const removeQuestion = (id: string) => setQuestions(questions.filter(q => q.id !== id));

  const handleQuestionImageUpload = (e: React.ChangeEvent<HTMLInputElement>, questionId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const compressed = await compressImage(base64, 800, 0.6);
        setQuestions(questions.map(q => q.id === questionId ? { ...q, image: compressed } : q));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQuestionPaste = (e: React.ClipboardEvent, questionId: string) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
           const reader = new FileReader();
           reader.onload = async (event) => {
             const base64 = event.target?.result as string;
             const compressed = await compressImage(base64, 800, 0.6);
             setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, image: compressed } : q));
           };
           reader.readAsDataURL(blob);
           e.preventDefault(); 
        }
      }
    }
  };

  const savePaper = async () => {
    if (!title || !subject || !grade) return alert("Please fill in Exam Title, Subject, and Class.");

    setIsSaving(true);
    
    const result = await onPaperCreated({ 
      id: `paper-${Date.now()}`, 
      title, 
      subject, 
      grade, 
      duration, 
      questions: questions.map(({ _needsImage, ...q }: any) => q), 
      createdAt: new Date().toISOString(),
      pdfData: uploadedFile?.data, 
      validFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
      validUntil: validUntil ? new Date(validUntil).toISOString() : undefined
    });
    
    setIsSaving(false);

    if (result === 'success') {
      alert("✅ Paper Created Successfully!");
      setShowCreator(false);
      resetForm();
    } else if (result === 'saved_without_file') {
      alert("⚠️ Paper saved, but the attachment was too large for the database. Standard row limit reached.");
      setShowCreator(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setQuestions([]); setTitle(''); setSubject(''); setGrade(''); setDuration(60); 
    setValidFrom(''); setValidUntil('');
    setUploadedFile(null); 
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setIsAnalyzing(false); setUploadMode('full_paper');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    
    const file = files[0];
    const newPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(newPreviewUrl);

    const reader = new FileReader();
    reader.onload = async (event) => {
      let base64Full = event.target?.result as string;
      
      // If image, compress for database storage
      if (file.type.startsWith('image/')) {
          base64Full = await compressImage(base64Full, 1600, 0.6);
      }

      setUploadedFile({ 
        name: file.name, 
        data: base64Full, 
        type: file.type || 'application/pdf', 
        size: base64Full.length 
      });

      if (process.env.API_KEY) {
        setIsAnalyzing(true);
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
              parts: [
                { inlineData: { mimeType: file.type || 'application/pdf', data: base64Full.split(',')[1] } },
                { text: `Analyze this exam paper. Extract: title, subject, grade (8,9,10,11,12), and questions (text, type, points, options).` }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  subject: { type: Type.STRING },
                  grade: { type: Type.STRING },
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        text: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ['mcq', 'subjective'] },
                        points: { type: Type.NUMBER },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ['text', 'type', 'points']
                    }
                  }
                }
              }
            }
          });

          const data = JSON.parse(response.text || '{}');
          if (data.title) setTitle(data.title);
          if (data.subject) setSubject(data.subject);
          if (data.grade && SUPPORTED_GRADES.includes(data.grade as any)) setGrade(data.grade);
          
          if (data.questions) {
            setQuestions(data.questions.map((q: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                text: q.text,
                type: q.type || 'subjective',
                points: q.points || 5,
                options: q.options || (q.type === 'mcq' ? ['A', 'B', 'C', 'D'] : undefined)
            })));
          }
        } catch (err) {
          console.error("AI Scan Failed", err);
        } finally {
          setIsAnalyzing(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Teacher Dashboard</h1>
          <div className="flex gap-4 mt-2">
            <button onClick={() => setActiveTab('papers')} className={`text-xs font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'papers' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Exam Papers</button>
            <button onClick={() => setActiveTab('submissions')} className={`text-xs font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'submissions' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Submissions</button>
          </div>
        </div>
        <button onClick={() => setShowCreator(true)} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95">Create New Exam</button>
      </div>

      {activeTab === 'papers' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {existingPapers.map(paper => (
            <div key={paper.id} className="bg-white rounded-[2rem] border border-slate-200 p-8 hover:shadow-xl transition-all relative group shadow-sm">
              <div className="flex gap-2 mb-4">
                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{paper.subject}</span>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Grade {paper.grade}</span>
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">{paper.title}</h3>
              <p className="text-slate-400 text-xs font-bold mb-4">{paper.questions.length} Questions • {paper.duration} Minutes</p>
              <button onClick={() => onPaperDeleted(paper.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map(sub => (
            <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-between hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center font-black text-indigo-600">{sub.studentName[0]}</div>
                <div>
                  <h4 className="font-black text-slate-800">{sub.studentName}</h4>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Class {sub.studentGrade} • {sub.paperTitle}</p>
                </div>
              </div>
              <button onClick={() => setSelectedSubmission(sub)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest">Review Script</button>
            </div>
          ))}
        </div>
      )}

      {showCreator && (
        <div className="fixed inset-0 bg-white z-[100] overflow-y-auto p-4 md:p-8 animate-in slide-in-from-bottom duration-300">
           <div className={`h-full flex flex-col md:flex-row gap-8 ${previewUrl ? 'max-w-full' : 'max-w-4xl mx-auto'}`}>
             
             {/* LEFT: SOURCE PREVIEW */}
             {previewUrl && (
                <div className="hidden md:flex w-1/2 bg-slate-900 rounded-[2.5rem] overflow-hidden flex-col h-[calc(100vh-6rem)] sticky top-4 shadow-2xl">
                  <div className="p-4 bg-slate-800 flex justify-between items-center text-white shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                       Question Paper Source
                    </span>
                    <button onClick={() => { setUploadedFile(null); setPreviewUrl(null); }} className="text-slate-400 hover:text-white text-[10px] font-bold uppercase">Remove File</button>
                  </div>
                  <div className="flex-1 bg-slate-200 relative">
                     <iframe src={previewUrl} className="w-full h-full border-none" title="Source Preview" />
                  </div>
                </div>
             )}

             {/* RIGHT: EDITOR */}
             <div className="flex-1 space-y-8">
                <div className="flex items-center justify-between">
                   <h2 className="text-3xl font-black text-slate-900">Configure Exam</h2>
                   <button onClick={() => setShowCreator(false)} className="p-2 hover:bg-slate-100 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <input placeholder="Exam Title" value={title} onChange={e=>setTitle(e.target.value)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none" />
                   <select value={grade} onChange={e=>setGrade(e.target.value)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none"><option value="">Class...</option>{SUPPORTED_GRADES.map(g=><option key={g} value={g}>Grade {g}</option>)}</select>
                   <input placeholder="Subject" value={subject} onChange={e=>setSubject(e.target.value)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none" />
                   <input type="number" placeholder="Duration (Mins)" value={duration} onChange={e=>setDuration(parseInt(e.target.value))} className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none" />
                </div>

                <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -z-0"></div>
                   <div className="relative z-10">
                      <h3 className="text-xl font-black mb-2">Build with AI</h3>
                      <p className="text-slate-400 text-sm mb-6">Upload your paper. AI scans the text and diagrams for you.</p>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,image/*" />
                      <button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isAnalyzing}
                        className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-50 transition-all flex items-center gap-3"
                      >
                        {isAnalyzing ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>}
                        {isAnalyzing ? 'Scanning Document...' : 'Select File'}
                      </button>
                      {uploadedFile && (
                        <p className="mt-4 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Active: {uploadedFile.name} ({(uploadedFile.size / 1024 / 1024).toFixed(1)} MB)</p>
                      )}
                   </div>
                </div>

                <div className="space-y-6">
                   <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                      <h3 className="text-xl font-black text-slate-900">Questions & Answer Slots</h3>
                      <div className="flex gap-2">
                         <button onClick={()=>addQuestion('subjective')} className="bg-slate-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">+ Subjective</button>
                         <button onClick={()=>addQuestion('mcq')} className="bg-slate-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">+ MCQ</button>
                      </div>
                   </div>

                   {questions.map((q, i) => (
                      <div key={q.id} className="p-6 bg-slate-50 border border-slate-200 rounded-2xl relative group hover:border-indigo-300 transition-all">
                         <button onClick={()=>removeQuestion(q.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                         <span className="text-[10px] font-black text-indigo-600 uppercase mb-4 block tracking-widest">Question {i+1} • {q.type}</span>
                         <textarea 
                           value={q.text} 
                           onChange={e=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, text:e.target.value}:qt))}
                           className="w-full p-4 bg-white border border-slate-200 rounded-xl mb-4 font-medium text-sm focus:ring-4 focus:ring-indigo-500/5 outline-none"
                           placeholder="Type question or instruction here..."
                           onPaste={(e) => handleQuestionPaste(e, q.id)}
                         />
                         
                         {q.image && (
                           <div className="relative inline-block mb-4">
                              <img src={q.image} className="h-32 rounded-xl border border-slate-200" alt="Snip" />
                              <button onClick={()=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, image: undefined}:qt))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                           </div>
                         )}

                         <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-slate-400 cursor-pointer hover:text-indigo-600 transition-colors">
                               <input type="file" className="hidden" onChange={(e)=>handleQuestionImageUpload(e, q.id)} />
                               + Attach Diagram
                            </label>
                            <div className="flex items-center gap-2">
                               <span className="text-[10px] font-black uppercase text-slate-400">Points:</span>
                               <input type="number" value={q.points} onChange={e=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, points: parseInt(e.target.value)}:qt))} className="w-16 p-2 border border-slate-200 rounded-lg text-center font-bold" />
                            </div>
                         </div>
                      </div>
                   ))}
                </div>

                <button 
                  onClick={savePaper} 
                  disabled={isSaving}
                  className="w-full bg-indigo-600 text-white py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? 'Storing to Secure Cloud...' : 'Finalize & Publish Exam'}
                </button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default TeacherView;