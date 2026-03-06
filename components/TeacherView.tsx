import React, { useState, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { QuestionPaper, Question, SUPPORTED_GRADES, Submission } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

interface TeacherViewProps {
  onPaperCreated: (paper: QuestionPaper) => Promise<'success' | 'saved_without_file' | 'failed'>;
  onPaperDeleted: (id: string) => void;
  onPaperEdited: (paper: QuestionPaper) => void;
  existingPapers: QuestionPaper[];
  submissions: Submission[];
}

const TeacherView: React.FC<TeacherViewProps> = ({ onPaperCreated, onPaperDeleted, onPaperEdited, existingPapers, submissions }) => {
  const [activeTab, setActiveTab] = useState<'papers' | 'submissions'>('papers');
  const [showCreator, setShowCreator] = useState(false);
  const [editingPaper, setEditingPaper] = useState<QuestionPaper | null>(null);

  // Prefill edit modal fields when opening
  useEffect(() => {
    if (editingPaper) {
      setTitle(editingPaper.title);
      setSubject(editingPaper.subject);
      setGrade(editingPaper.grade);
      setDuration(editingPaper.duration);
      setQuestions(editingPaper.questions.map(q => ({ ...q })));
      // pdfData/editing for file not supported in edit modal for now
    }
  }, [editingPaper]);

  // Creation State
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [duration, setDuration] = useState(60);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // File Upload State
  const [uploadedFile, setUploadedFile] = useState<{ name: string, data: string, type: string, size: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
      if (result === 'success') {
        alert("✅ Exam Published successfully!");
      } else if (result === 'saved_without_file') {
        alert("✅ Exam Published!\n\n⚠️ Note: File attachment was too large for cloud storage but has been saved locally. Students can still access the exam.");
      }
      setShowCreator(false);
      setQuestions([]); setTitle(''); setSubject(''); setGrade(''); setUploadedFile(null); setPreviewUrl(null);
    } else {
      alert("❌ Failed to publish exam. Please try again.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 40MB)
    if (file.size > 40 * 1024 * 1024) {
      alert("File size must be less than 40 MB");
      e.target.value = '';
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let base64Full = event.target?.result as string;
        let compressed = false;

        // If PDF and > 5MB, compress using pdf-lib
        if (file.type === 'application/pdf' && file.size > 5 * 1024 * 1024) {
          try {
            const pdfBytes = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(pdfBytes);
            // Remove metadata and try to compress images
            pdfDoc.setTitle('');
            pdfDoc.setAuthor('');
            pdfDoc.setSubject('');
            pdfDoc.setKeywords([]);
            pdfDoc.setProducer('');
            pdfDoc.setCreator('');
            // Remove unused objects (pdf-lib does this on save)
            // Save with max compression
            const compressedBytes = await pdfDoc.save({ useObjectStreams: true });
            // If still too large, warn user
            if (compressedBytes.byteLength > 3 * 1024 * 1024) {
              alert('PDF could not be compressed below 3MB. Please use a smaller file or compress manually.');
              setUploadedFile(null);
              setPreviewUrl(null);
              e.target.value = '';
              return;
            }
            // Convert to base64
            base64Full = 'data:application/pdf;base64,' + btoa(String.fromCharCode(...new Uint8Array(compressedBytes)));
            compressed = true;
          } catch (err) {
            alert('Failed to compress PDF. Please use a smaller file or compress manually.');
            setUploadedFile(null);
            setPreviewUrl(null);
            e.target.value = '';
            return;
          }
        }

        setUploadedFile({ name: file.name, data: base64Full, type: file.type || 'application/pdf', size: file.size });

        if (process.env.API_KEY) {
          setIsAnalyzing(true);
          try {
            if (file.size > 20 * 1024 * 1024) {
              alert("Large file detected. AI analysis may take longer. Please wait...");
            }

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: { parts: [{ inlineData: { mimeType: file.type || 'application/pdf', data: base64Full.split(',')[1] } }, { text: `Extract: title, subject, grade, and questions list.` }] },
              config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, subject: { type: Type.STRING }, grade: { type: Type.STRING }, questions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, type: { type: Type.STRING, enum: ['mcq', 'subjective'] }, points: { type: Type.NUMBER } } } } } } }
            });
            const data = JSON.parse(response.text || '{}');
            if (data.title) setTitle(data.title);
            if (data.subject) setSubject(data.subject);
            if (data.grade) setGrade(data.grade);
            if (data.questions) setQuestions(data.questions.map((q: any) => ({ id: Math.random().toString(36).substr(2, 9), text: q.text, type: q.type || 'subjective', points: q.points || 5 })));
          } catch (err) {
            console.error("AI Analysis Error:", err);
            alert("AI analysis failed for large file. You can still create the exam manually.");
          } finally {
            setIsAnalyzing(false);
          }
        }
      } catch (error) {
        console.error("File processing error:", error);
        alert("Failed to process file. Please try again.");
        setUploadedFile(null);
        setPreviewUrl(null);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black">Teacher Dashboard</h1>
        <button onClick={() => setShowCreator(true)} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-indigo-700">New Exam</button>
      </div>

      <div className="flex gap-4 mb-8">
        <button onClick={() => setActiveTab('papers')} className={`px-4 py-2 font-bold uppercase text-xs tracking-widest border-b-2 ${activeTab === 'papers' ? 'border-indigo-600' : 'border-transparent text-slate-400'}`}>Exam Papers</button>
        <button onClick={() => setActiveTab('submissions')} className={`px-4 py-2 font-bold uppercase text-xs tracking-widest border-b-2 ${activeTab === 'submissions' ? 'border-indigo-600' : 'border-transparent text-slate-400'}`}>Submissions</button>
      </div>

      {activeTab === 'papers' && (
        <div>
          {existingPapers && existingPapers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {existingPapers.map(paper => (
                <div key={paper.id} className="bg-white rounded-[2rem] border border-slate-200 p-8 hover:shadow-xl relative shadow-sm transition-all">
                  <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[9px] font-black uppercase mb-4 inline-block">{paper.subject}</span>
                  <h3 className="text-2xl font-black text-slate-800 mb-2">{paper.title}</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Grade {paper.grade} • {paper.questions.length} Questions • {paper.duration} mins</p>
                  <div className="absolute top-8 right-8 flex gap-2">
                    <button
                      onClick={() => setEditingPaper(paper)}
                      className="text-slate-300 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                      title="Edit Paper"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13h3l8-8a2.828 2.828 0 00-4-4l-8 8v3h3z" /></svg>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete exam "${paper.title}"? This cannot be undone.`)) {
                          // If editing or creating this paper, close modal to avoid white screen
                          if (editingPaper && editingPaper.id === paper.id) setEditingPaper(null);
                          setShowCreator(false);
                          onPaperDeleted(paper.id);
                        }
                      }}
                      className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50"
                      title="Delete Paper"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-slate-200 p-16 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-2xl font-black text-slate-400 mb-2">No Exams Created</h3>
              <p className="text-slate-500">Click "New Exam" to create your first question paper.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'submissions' && (
        <div className="space-y-6">
          {submissions && submissions.length > 0 ? (
            submissions.map(submission => {
              // Find the original paper to get question order
              const originalPaper = existingPapers.find(p => p.id === submission.paperId);
              // Build ordered answers: use paper question order if available, fallback to Object.entries
              const orderedAnswers: { questionId: string; questionText: string; answer: typeof submission.answers[string] }[] = [];
              if (originalPaper && originalPaper.questions.length > 0) {
                originalPaper.questions.forEach((q) => {
                  const answer = submission.answers[q.id];
                  if (answer) {
                    orderedAnswers.push({ questionId: q.id, questionText: q.text, answer });
                  }
                });
                // Also include any answers not matched to a question (edge case)
                Object.entries(submission.answers).forEach(([qId, answer]) => {
                  if (!orderedAnswers.find(oa => oa.questionId === qId)) {
                    orderedAnswers.push({ questionId: qId, questionText: '', answer });
                  }
                });
              } else {
                Object.entries(submission.answers).forEach(([qId, answer]) => {
                  orderedAnswers.push({ questionId: qId, questionText: '', answer });
                });
              }

              return (
                <div key={submission.id} className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-shadow">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Paper</p>
                      <h3 className="text-xl font-black text-slate-800">{submission.paperTitle}</h3>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Student</p>
                      <p className="text-lg font-bold text-slate-700">{submission.studentName}</p>
                      <p className="text-xs text-slate-500">Class {submission.studentGrade}</p>
                    </div>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Submitted</p>
                        <p className="text-sm font-bold text-slate-700">{new Date(submission.submittedAt).toLocaleString()}</p>
                      </div>
                      <button
                        onClick={() => {
                          const printWindow = window.open('', '', 'width=900,height=1200');
                          if (printWindow) {
                            printWindow.document.write(`
                            <html>
                              <head>
                                <title>${submission.paperTitle} - ${submission.studentName}</title>
                                <style>
                                  body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
                                  h1 { color: #1f2937; border-bottom: 3px solid #4f46e5; padding-bottom: 10px; }
                                  h2 { color: #374151; margin-top: 30px; border-left: 4px solid #4f46e5; padding-left: 10px; }
                                  .header { background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                                  .header p { margin: 8px 0; }
                                  .question { background: #f9fafb; padding: 15px; border-left: 4px solid #4f46e5; margin: 20px 0; }
                                  .question-text { color: #374151; font-weight: bold; margin-bottom: 8px; font-style: italic; }
                                  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                                  td { border: 1px solid #d1d5db; padding: 10px; }
                                  img { max-width: 100%; height: auto; margin: 15px 0; border: 1px solid #d1d5db; border-radius: 4px; }
                                  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; }
                                </style>
                              </head>
                              <body>
                                <h1>${submission.paperTitle}</h1>
                                <div class="header">
                                  <p><strong>Student Name:</strong> ${submission.studentName}</p>
                                  <p><strong>Class:</strong> ${submission.studentGrade}</p>
                                  <p><strong>Submitted:</strong> ${new Date(submission.submittedAt).toLocaleString()}</p>
                                </div>
                                ${orderedAnswers.map(({ questionText, answer }, idx) => `
                                  <div class="question">
                                    <h2>Question ${idx + 1}</h2>
                                    ${questionText ? `<p class="question-text">Q: ${questionText}</p>` : ''}
                                    <p><strong>Answer:</strong></p>
                                    <p>${(answer.answerText || '(No text answer)').replace(/\[TABLE[^\]]*\]/g, '').replace(/\n/g, '<br>')}</p>
                                    ${answer.imageUri ? `<img src="${answer.imageUri}" alt="Student work - Question ${idx + 1}">` : ''}
                                    ${answer.tableData ? `
                                      <p><strong>Table Data:</strong></p>
                                      <table>
                                        ${answer.tableData.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
                                      </table>
                                    ` : ''}
                                  </div>
                                `).join('')}
                                <div class="footer">
                                  <p>Generated on ${new Date().toLocaleString()}</p>
                                </div>
                              </body>
                            </html>
                          `);
                            printWindow.document.close();
                            printWindow.print();
                          }
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase hover:bg-blue-700 transition-colors"
                      >
                        📄 Print PDF
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Answers ({orderedAnswers.length} Questions)</p>
                    <div className="bg-slate-50 rounded-2xl p-6 max-h-96 overflow-y-auto space-y-4">
                      {orderedAnswers.map(({ questionId, questionText, answer }, idx) => (
                        <div key={questionId} className="border-b border-slate-200 pb-4 last:border-0">
                          <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">Question {idx + 1}</p>
                          {questionText && (
                            <p className="text-xs text-slate-500 italic mb-2">{questionText}</p>
                          )}
                          {answer.answerText && (
                            <p className="text-sm font-mono text-slate-700 whitespace-pre-wrap break-words mb-3">{answer.answerText.replace(/\[TABLE[^\]]*\]/g, '')}</p>
                          )}
                          {answer.imageUri && (
                            <div className="mt-3 mb-3">
                              <p className="text-xs font-bold text-green-600 mb-2">📸 Image uploaded:</p>
                              <img src={answer.imageUri} alt="Student work" className="max-w-xs max-h-48 rounded-lg border border-slate-200" />
                            </div>
                          )}
                          {answer.tableData && answer.tableData.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-bold text-blue-600 mb-2">📊 Table Data:</p>
                              <div className="overflow-x-auto">
                                <table className="border-collapse text-sm bg-white">
                                  <tbody>
                                    {answer.tableData.map((row, rIdx) => (
                                      <tr key={rIdx}>
                                        {row.map((cell, cIdx) => (
                                          <td key={`${rIdx}-${cIdx}`} className="border border-slate-300 px-4 py-2 bg-white font-medium">
                                            {cell || '-'}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-white rounded-[2rem] border border-slate-200 p-16 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-2xl font-black text-slate-400 mb-2">No Submissions Yet</h3>
              <p className="text-slate-500">Student submissions will appear here once they submit their exams.</p>
            </div>
          )}
        </div>
      )}

      {showCreator && (
        <div className="fixed inset-0 bg-white z-[100] overflow-y-auto p-8 animate-in slide-in-from-bottom duration-300">
          <div className={`h-full flex gap-8 ${previewUrl ? 'max-w-full' : 'max-w-4xl mx-auto'}`}>
            {previewUrl && (
              <div className="hidden md:flex w-1/2 bg-slate-900 rounded-[2rem] overflow-hidden flex-col h-[calc(100vh-6rem)] shadow-2xl relative">
                <div className="p-4 bg-slate-800 text-white text-[10px] font-black uppercase flex justify-between">Source View <button onClick={() => setPreviewUrl(null)} className="text-slate-400">Close</button></div>
                <iframe key={previewUrl} src={previewUrl} className="flex-1 border-none bg-white" title="Preview" />
                <a href={previewUrl} target="_blank" rel="noreferrer" className="absolute bottom-6 right-6 bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] shadow-2xl">Open in New Tab</a>
              </div>
            )}
            <div className="flex-1 space-y-8">
              <div className="flex justify-between items-center"><h2 className="text-3xl font-black">Configure Exam</h2><button onClick={() => setShowCreator(false)} className="p-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" /></svg></button></div>
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="Exam Title" value={title} onChange={e => setTitle(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                <select value={grade} onChange={e => setGrade(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"><option value="">Class...</option>{SUPPORTED_GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}</select>
                <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                <input type="number" placeholder="Duration (Mins)" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
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
                {questions.map((q, i) => (
                  <div key={q.id} className="p-6 bg-slate-50 border border-slate-200 rounded-2xl relative">
                    <button onClick={() => removeQuestion(q.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" /></svg></button>
                    <textarea value={q.text} onChange={e => setQuestions(questions.map(qt => qt.id === q.id ? { ...qt, text: e.target.value } : qt))} className="w-full p-4 border border-slate-200 rounded-xl mb-4 text-sm" placeholder="Question text..." />
                    <div className="flex justify-end gap-2 items-center"><span className="text-[10px] font-black uppercase text-slate-400">Points:</span><input type="number" value={q.points} onChange={e => setQuestions(questions.map(qt => qt.id === q.id ? { ...qt, points: parseInt(e.target.value) } : qt))} className="w-16 p-2 border border-slate-200 rounded-lg text-center font-bold" /></div>
                  </div>
                ))}
              </div>
              <button onClick={savePaper} disabled={isSaving} className="w-full bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl disabled:opacity-50">{isSaving ? 'Processing...' : 'Publish Exam'}</button>
            </div>
          </div>
        </div>
      )}

      {editingPaper && (
        <div className="fixed inset-0 bg-white z-[101] overflow-y-auto p-8 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-4xl mx-auto flex flex-col gap-8">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black">Edit Exam</h2>
              <button onClick={() => setEditingPaper(null)} className="p-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" /></svg></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input placeholder="Exam Title" value={title} onChange={e => setTitle(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
              <select value={grade} onChange={e => setGrade(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold"><option value="">Class...</option>{SUPPORTED_GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}</select>
              <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
              <input type="number" placeholder="Duration (Mins)" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
            </div>
            <div className="space-y-6">
              <div className="flex justify-between items-center"><h3 className="text-xl font-black">Questions</h3><button onClick={addQuestion} className="bg-slate-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase">+ Add Slot</button></div>
              {questions.map((q, i) => (
                <div key={q.id} className="p-6 bg-slate-50 border border-slate-200 rounded-2xl relative">
                  <button onClick={() => removeQuestion(q.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" /></svg></button>
                  <textarea value={q.text} onChange={e => setQuestions(questions.map(qt => qt.id === q.id ? { ...qt, text: e.target.value } : qt))} className="w-full p-4 border border-slate-200 rounded-xl mb-4 text-sm" placeholder="Question text..." />
                  <div className="flex justify-end gap-2 items-center"><span className="text-[10px] font-black uppercase text-slate-400">Points:</span><input type="number" value={q.points} onChange={e => setQuestions(questions.map(qt => qt.id === q.id ? { ...qt, points: parseInt(e.target.value) } : qt))} className="w-16 p-2 border border-slate-200 rounded-lg text-center font-bold" /></div>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                if (!title || !subject || !grade) {
                  alert("Missing Exam Title, Subject, or Class.");
                  return;
                }
                // Build updated paper object
                const updatedPaper: QuestionPaper = {
                  ...editingPaper!,
                  title,
                  subject,
                  grade,
                  duration,
                  questions: questions.map(q => ({ ...q })),
                };
                onPaperEdited(updatedPaper);
                setEditingPaper(null);
              }}
              className="w-full bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl"
            >Save Changes</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherView;