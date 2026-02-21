import React, { useState, useRef, useEffect } from 'react';
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
  
  // Creation State
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [duration, setDuration] = useState(60);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // File Upload State
  const [uploadedFile, setUploadedFile] = useState<{name: string, data: string, type: string, size: number} | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => { if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const addQuestion = () => setQuestions([...questions, { id: Math.random().toString(36).substr(2, 9), text: '', type: 'subjective', points: 5 }]);
  const removeQuestion = (id: string) => setQuestions(questions.filter(q => q.id !== id));

  const savePaper = async () => {
    if (!title || !subject || !grade) return alert("Missing Exam Title, Subject, or Class.");
    setIsSaving(true);
    const result = await onPaperCreated({ id: `paper-${Date.now()}`, title, subject, grade, duration, questions, createdAt: new Date().toISOString(), pdfData: uploadedFile?.data });
    setIsSaving(false);
    if (result !== 'failed') {
      alert(result === 'success' ? "Exam Published!" : "Exam Published (Attachment too large for cloud, saved to device).");
      setShowCreator(false);
      setQuestions([]); setTitle(''); setSubject(''); setGrade(''); setUploadedFile(null); setPreviewUrl(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Full = event.target?.result as string;
      setUploadedFile({ name: file.name, data: base64Full, type: file.type || 'application/pdf', size: file.size });

      if (process.env.API_KEY) {
        setIsAnalyzing(true);
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [ { inlineData: { mimeType: file.type || 'application/pdf', data: base64Full.split(',')[1] } }, { text: `Extract: title, subject, grade, and questions list.` } ] },
            config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, subject: { type: Type.STRING }, grade: { type: Type.STRING }, questions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, type: { type: Type.STRING, enum: ['mcq', 'subjective'] }, points: { type: Type.NUMBER } } } } } } }
          });
          const data = JSON.parse(response.text || '{}');
          if (data.title) setTitle(data.title);
          if (data.subject) setSubject(data.subject);
          if (data.grade) setGrade(data.grade);
          if (data.questions) setQuestions(data.questions.map((q: any) => ({ id: Math.random().toString(36).substr(2, 9), text: q.text, type: q.type || 'subjective', points: q.points || 5 })));
        } catch (err) { console.error(err); } finally { setIsAnalyzing(false); }
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className="max-w-6xl mx-auto p-6 print:hidden">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black">Teacher Dashboard</h1>
        <button onClick={() => setShowCreator(true)} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-indigo-700">New Exam</button>
      </div>

      <div className="flex gap-4 mb-8">
        <button onClick={() => setActiveTab('papers')} className={`px-4 py-2 font-bold uppercase text-xs tracking-widest border-b-2 ${activeTab === 'papers' ? 'border-indigo-600' : 'border-transparent text-slate-400'}`}>Exam Papers</button>
        <button onClick={() => setActiveTab('submissions')} className={`px-4 py-2 font-bold uppercase text-xs tracking-widest border-b-2 ${activeTab === 'submissions' ? 'border-indigo-600' : 'border-transparent text-slate-400'}`}>Submissions</button>
      </div>

      {activeTab === 'papers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {existingPapers.map(paper => (
            <div key={paper.id} className="bg-white rounded-[2rem] border border-slate-200 p-8 hover:shadow-xl relative shadow-sm">
              <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[9px] font-black uppercase mb-4 inline-block">{paper.subject}</span>
              <h3 className="text-2xl font-black text-slate-800 mb-2">{paper.title}</h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Grade {paper.grade} • {paper.questions.length} Questions</p>
              <button onClick={() => onPaperDeleted(paper.id)} className="absolute top-8 right-8 text-slate-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
          {existingPapers.length === 0 && (
            <div className="col-span-full text-center py-20 bg-white rounded-[2rem] border border-slate-100">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No exams created yet</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'submissions' && (
        <div className="space-y-4">
          {submissions.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-100">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No submissions yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {submissions.map(sub => (
                <div key={sub.id} onClick={() => setSelectedSubmission(sub)} className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center hover:border-indigo-500 cursor-pointer transition-all shadow-sm">
                  <div>
                    <h4 className="font-black text-slate-800">{sub.studentName}</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{sub.paperTitle} • Class {sub.studentGrade}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{new Date(sub.submittedAt).toLocaleDateString()}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(sub.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreator && (
        <div className="fixed inset-0 bg-white z-[100] overflow-y-auto p-8 animate-in slide-in-from-bottom duration-300">
           <div className={`h-full flex gap-8 ${previewUrl ? 'max-w-full' : 'max-w-4xl mx-auto'}`}>
             {previewUrl && (
                <div className="hidden md:flex w-1/2 bg-slate-900 rounded-[2rem] overflow-hidden flex-col h-[calc(100vh-6rem)] shadow-2xl relative">
                  <div className="p-4 bg-slate-800 text-white text-[10px] font-black uppercase flex justify-between">Source View <button onClick={()=>setPreviewUrl(null)} className="text-slate-400">Close</button></div>
                  <iframe key={previewUrl} src={previewUrl} className="flex-1 border-none bg-white" title="Preview" />
                  <a href={previewUrl} target="_blank" rel="noreferrer" className="absolute bottom-6 right-6 bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] shadow-2xl">Open in New Tab</a>
                </div>
             )}
             <div className="flex-1 space-y-8">
                <div className="flex justify-between items-center"><h2 className="text-3xl font-black">Configure Exam</h2><button onClick={()=>setShowCreator(false)} className="p-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" /></svg></button></div>
                <div className="grid grid-cols-2 gap-4">
                   <input placeholder="Exam Title" value={title} onChange={e=>setTitle(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                   <select value={grade} onChange={e=>setGrade(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"><option value="">Class...</option>{SUPPORTED_GRADES.map(g=><option key={g} value={g}>Grade {g}</option>)}</select>
                   <input placeholder="Subject" value={subject} onChange={e=>setSubject(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                   <input type="number" placeholder="Duration (Mins)" value={duration} onChange={e=>setDuration(parseInt(e.target.value))} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                </div>
                <div className="p-8 bg-slate-900 rounded-[2rem] text-white">
                   <h3 className="text-xl font-black mb-2">Build with AI</h3>
                   <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,image/*" />
                   <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="bg-white text-slate-900 px-8 py-4 rounded-xl font-black uppercase text-xs flex items-center gap-3">
                      {isAnalyzing ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6" /></svg>}
                      {isAnalyzing ? 'Scanning Document...' : 'Select Question Paper'}
                   </button>
                   {uploadedFile && <p className="mt-4 text-[10px] font-bold text-indigo-400 uppercase">{uploadedFile.name} ({(uploadedFile.size / 1024 / 1024).toFixed(1)} MB)</p>}
                </div>
                <div className="space-y-6">
                   <div className="flex justify-between items-center"><h3 className="text-xl font-black">Questions</h3><button onClick={addQuestion} className="bg-slate-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase">+ Add Slot</button></div>
                   {questions.map((q) => (
                      <div key={q.id} className="p-6 bg-slate-50 border border-slate-200 rounded-2xl relative">
                         <button onClick={()=>removeQuestion(q.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" /></svg></button>
                         <textarea value={q.text} onChange={e=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, text:e.target.value}:qt))} className="w-full p-4 border border-slate-200 rounded-xl mb-4 text-sm" placeholder="Question text..." />
                         <div className="flex justify-between items-center">
                            <label className="flex items-center gap-2 cursor-pointer group">
                               <input type="checkbox" checked={q.requiresImage} onChange={e=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, requiresImage: e.target.checked}:qt))} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                               <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-slate-600 transition-colors">Requires Image Answer</span>
                            </label>
                            <div className="flex gap-2 items-center"><span className="text-[10px] font-black uppercase text-slate-400">Points:</span><input type="number" value={q.points} onChange={e=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, points: parseInt(e.target.value)}:qt))} className="w-16 p-2 border border-slate-200 rounded-lg text-center font-bold" /></div>
                         </div>
                      </div>
                   ))}
                </div>
                <button onClick={savePaper} disabled={isSaving} className="w-full bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl disabled:opacity-50">{isSaving ? 'Processing...' : 'Publish Exam'}</button>
             </div>
           </div>
        </div>
      )}

      {selectedSubmission && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-900">{selectedSubmission.studentName}</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedSubmission.paperTitle} • Class {selectedSubmission.studentGrade}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()} 
                  className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print to PDF
                </button>
                <button onClick={() => setSelectedSubmission(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {Object.entries(selectedSubmission.answers).map(([qId, ans], idx) => {
                const paper = existingPapers.find(p => p.id === selectedSubmission.paperId);
                const question = paper?.questions.find(q => q.id === qId);
                return (
                  <div key={qId} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-900 text-white w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs">{idx + 1}</div>
                      <p className="font-bold text-slate-800">{question?.text || 'Question Deleted'}</p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <p className="font-mono text-slate-700 whitespace-pre-wrap">{ans.answerText || 'No text answer provided.'}</p>
                      {ans.imageUri && (
                        <div className="mt-4">
                          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Captured Workspace:</p>
                          <img src={ans.imageUri} className="max-w-full h-auto rounded-xl border border-slate-200 shadow-sm" alt="Student Work" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      </div>

      {selectedSubmission && (
        <div className="hidden print:block absolute top-0 left-0 w-full bg-white z-[9999] p-10 text-slate-900">
          <div className="border-b-4 border-indigo-600 pb-6 mb-10">
            <h1 className="text-4xl font-black mb-2 uppercase tracking-tighter">Examination Result</h1>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-xl font-bold text-slate-800">{selectedSubmission.studentName}</p>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Student ID: {selectedSubmission.studentId} • Class {selectedSubmission.studentGrade}</p>
              </div>
              <div className="text-right">
                <p className="font-black text-indigo-600 text-lg">{selectedSubmission.paperTitle}</p>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Submitted: {new Date(selectedSubmission.submittedAt).toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="space-y-12">
            {Object.entries(selectedSubmission.answers).map(([qId, ans], idx) => {
              const paper = existingPapers.find(p => p.id === selectedSubmission.paperId);
              const question = paper?.questions.find(q => q.id === qId);
              return (
                <div key={qId} className="break-inside-avoid">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center font-black">{idx + 1}</div>
                    <p className="text-xl font-bold text-slate-800">{question?.text || 'Question Deleted'}</p>
                  </div>
                  <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
                    <p className="font-mono text-lg text-slate-700 whitespace-pre-wrap leading-relaxed">{ans.answerText || 'No text answer provided.'}</p>
                    {ans.imageUri && (
                      <div className="mt-6">
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3">Captured Workspace Attachment:</p>
                        <img src={ans.imageUri} className="max-w-full h-auto rounded-2xl border border-slate-300 shadow-sm" alt="Student Work" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-20 pt-10 border-t border-slate-200 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Generated by EduAssess Pro • Official Assessment Record</p>
          </div>
        </div>
      )}
    </>
  );
};

export default TeacherView;