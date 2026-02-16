
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New Upload Mode Toggle
  const [uploadMode, setUploadMode] = useState<'full_paper' | 'question_snips'>('full_paper');
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [totalToAnalyze, setTotalToAnalyze] = useState(0);

  // Bulk Tagging State
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [bulkTags, setBulkTags] = useState('');

  // --- HELPER: Image Compression ---
  const compressImage = (base64Str: string, maxWidth = 800, quality = 0.6): Promise<string> => {
    return new Promise((resolve) => {
      // If it's a PDF or not an image string, return as is
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

        // Resize if too big
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'white'; // Fill transparent background (e.g. png) with white for jpeg
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            // Convert to JPEG to save space
            resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
            resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str); // Fallback on error
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
        const compressed = await compressImage(base64);
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
             const compressed = await compressImage(base64);
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

    let finalQuestions = [...questions];
    if (finalQuestions.length === 0) {
      if (uploadedFile && uploadMode === 'full_paper') {
        if (confirm("You attached a Question Paper but added no answer slots. \n\nAdd 10 generic answer slots automatically?")) {
           finalQuestions = Array.from({ length: 10 }).map((_, i) => ({
            id: Math.random().toString(36).substr(2, 9) + i,
            text: `Question ${i + 1} (Refer to attached PDF)`,
            type: 'subjective',
            points: 5
          }));
        } else {
          return; 
        }
      } else {
        return alert("Please add at least one question.");
      }
    }
    
    if (uploadedFile && uploadedFile.size > 2 * 1024 * 1024) {
        if (!confirm(`⚠️ Large File Detected (${(uploadedFile.size / 1024 / 1024).toFixed(1)}MB)\n\nUploading large files often fails in this demo database environment. \n\nAre you sure you want to proceed? \n(The text questions will be saved even if the file upload fails)`)) {
            return;
        }
    }
    
    setIsSaving(true);
    
    const result = await onPaperCreated({ 
      id: `paper-${Date.now()}`, 
      title, 
      subject, 
      grade, 
      duration, 
      questions: finalQuestions.map(({ _needsImage, ...q }: any) => q), 
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
      alert("⚠️ Paper saved, but the attachment was too large for the database.\n\nThe questions and configuration have been saved. You can edit the paper later to try uploading a smaller compressed PDF/Image.");
      setShowCreator(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setQuestions([]); setTitle(''); setSubject(''); setGrade(''); setDuration(60); 
    setValidFrom(''); setValidUntil('');
    setUploadedFile(null); setIsAnalyzing(false); setUploadMode('full_paper');
    setAnalyzedCount(0); setTotalToAnalyze(0); setPendingFiles([]); setShowTagModal(false); setBulkTags('');
  };

  const handleLoadSample = async () => {
     if (!confirm("Import 'Economics Final Exam (2025-26)' into the database for Class 10?")) return;

     setIsSaving(true);
     const sampleQuestions: Question[] = [
        { id: 'q1', text: "The word ‘Economics’ is most closely connected with the word:", type: 'mcq', points: 1, options: ["Free", "Scarcity", "Unlimited", "Restricted"] },
        { id: 'q2', text: "When price falls with rise in output, TR is ______ when MR is Zero.", type: 'mcq', points: 1, options: ["Maximum", "Minimum", "Zero", "None of these"] },
        { id: 'q3', text: "In case of perfect competition , a firm is in equilibrium when :", type: 'mcq', points: 1, options: ["MC=MR", "MC cuts MR from below", "MC is rising when it cuts MR", "All of these"] },
        { id: 'q4', text: "In the long period , the supply for a commodity is :-", type: 'mcq', points: 1, options: ["Perfectly inelastic", "High Elastic", "Less Elastic", "Perfect Elastic"] },
        { id: 'q5', text: "Freedom of entry and exit is possible in the Economics.", type: 'mcq', points: 1, options: ["Short run", "long run", "Both (a) and (b)", "None of the above"] },
        { id: 'q6', text: "PPF is concave to the origin because of :", type: 'mcq', points: 1, options: ["Increase MRT", "Diminishing MRT", "Constant MRT", "None of these"] },
        { id: 'q7', text: "The product of ‘quantity’ and ‘AR’ at every unit sold is the firm’s", type: 'mcq', points: 1, options: ["TR", "TVC", "MR", "None of these"] },
        { id: 'q8', text: "If MR more than MC at a particular level of Output, then producer will:", type: 'mcq', points: 1, options: ["Reduce production", "Keep the production at current level", "Increase production", "None of these"] },
        { id: 'q9', text: "In case of __________ , supply falls at the same price.", type: 'mcq', points: 1, options: ["Decrease in supply", "Increase in supply", "Contraction in supply", "Expansion in supply"] },
        { id: 'q10', text: "In perfect competition, which of the following remains constant?", type: 'mcq', points: 1, options: ["AR", "MR", "Both (a) and (b)", "None of the above"] },
        { id: 'q11', text: "What are three central problems of an economy? Why do they arise?", type: 'subjective', points: 3 },
        { id: 'q12', text: "How do change in marginal revenue affect total revenue?", type: 'subjective', points: 3 },
        { id: 'q13', text: "The equality of marginal cost and marginal revenue is a condition necessary for equilibrium, but it is not by itself sufficient to ensure the attainment of producer’s equilibrium. Comment.", type: 'subjective', points: 3 },
        { id: 'q14', text: "Give one point of difference between individual supply and market supply.", type: 'subjective', points: 3 },
        { id: 'q15', text: "State any three characteristics of a perfectly competitive market.", type: 'subjective', points: 3 },
        { id: 'q16', text: "Distinguish between Microeconomics and Macroeconomics, with suitable examples.", type: 'subjective', points: 4 },
        { id: 'q17', text: "What is the relationship between (a) marginal Revenue and Average Revenue; (b) Total Revenue and marginal Revenue.", type: 'subjective', points: 4 },
        { id: 'q18', text: "Explain the conditions of producer’s equilibrium under perfect competition.", type: 'subjective', points: 4 },
        { id: 'q19', text: "Difference between Contraction in Supply and Decrease in Supply.", type: 'subjective', points: 4 },
        { id: 'q20', text: "Explain the implication of the following features of perfect competition (a) large number of buyers and sellers; (b) Freedom of entry and exits of firms.", type: 'subjective', points: 4 },
        { id: 'q21', text: "Discuss the nature of the demand curve under perfect competition in brief.", type: 'subjective', points: 4 }
     ];

     const result = await onPaperCreated({
        id: `paper-eco-${Date.now()}`,
        title: "Class Test for Final exam (2025-26)",
        subject: "ECONOMICS",
        grade: "10", 
        duration: 60,
        questions: sampleQuestions,
        createdAt: new Date().toISOString()
     });
     
     setIsSaving(false);
     if (result === 'success') {
         alert("✅ Sample Economics Paper (Class 10) uploaded successfully to Database!");
     }
  };

  const analyzeImageForQuestions = async (base64Data: string, mimeType: string, context?: string): Promise<any[]> => {
      if (!process.env.API_KEY) return [{ text: "AI Unavailable - No API Key", type: 'subjective', points: 5 }];
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const rawBase64 = base64Data.split(',')[1];

      const prompt = `Analyze this image. It may contain one single question OR multiple questions (e.g. a worksheet or exam page).
      ${context ? `CONTEXT/TAGS: "${context}".` : ''}
      
      Task:
      1. Identify ALL distinct questions in the image.
      2. For EACH question, extract the text verbatim.
      3. Determine if it's 'mcq' or 'subjective'.
      4. For MCQs, list all options.
      5. Estimate points (default 5).
      6. IMPORTANT: Check if the question refers to a diagram, graph, or figure PRESENT in this image. If yes, set 'hasDiagram' to true.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: rawBase64 } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['mcq', 'subjective'] },
                  points: { type: Type.NUMBER },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  hasDiagram: { type: Type.BOOLEAN }
                },
                required: ['text', 'type', 'points']
            }
          }
        }
      });
      
      const data = JSON.parse(response.text || '[]');
      return Array.isArray(data) ? data : [data];
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (uploadMode === 'question_snips' || files.length > 1) { 
       setPendingFiles(files);
       setBulkTags('');
       setShowTagModal(true);
       setUploadMode('question_snips');
       return;
    }

    const file = files[0];
    let mimeType = file.type;
    if (!mimeType) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') mimeType = 'application/pdf';
        else if (ext?.match(/(jpg|jpeg|png)/)) mimeType = 'image/jpeg';
    }
    
    if (mimeType.startsWith('image/')) mimeType = 'image/jpeg';

    const reader = new FileReader();
    reader.onload = async (event) => {
      let base64Full = event.target?.result as string;
      const sizeInBytes = base64Full.length;
      
      if (mimeType.startsWith('image/') && sizeInBytes > 2 * 1024 * 1024) {
          base64Full = await compressImage(base64Full, 1024, 0.7);
      }

      setUploadedFile({ name: file.name, data: base64Full, type: mimeType, size: base64Full.length });

      if (process.env.API_KEY) {
        setIsAnalyzing(true);
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
              parts: [
                { inlineData: { mimeType: mimeType, data: base64Full.split(',')[1] } },
                { text: `Extract full exam details from this document.
                  Return JSON object with: 
                  - title, subject, grade (8,9,10,11,12)
                  - questions: array of {text, type (mcq/subjective), points, options, hasDiagram}` 
                }
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
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        hasDiagram: { type: Type.BOOLEAN }
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
          
          if (data.questions && Array.isArray(data.questions)) {
            setQuestions(data.questions.map((q: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                text: q.text,
                type: q.type || 'subjective',
                points: q.points || 5,
                options: q.type === 'mcq' && (!q.options || q.options.length === 0) ? ['Option 1', 'Option 2', 'Option 3', 'Option 4'] : q.options,
                image: undefined,
                _needsImage: q.hasDiagram
            })));
          }
        } catch (err: any) {
          console.error("AI Analysis Failed", err);
          if (err.message?.includes('429')) {
             alert("⚠️ AI Limit Reached: File attached, but questions could not be auto-generated. Please add questions manually.");
          }
        } finally {
          setIsAnalyzing(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const processBulkUpload = async () => {
      setShowTagModal(false);
      setIsAnalyzing(true);
      setTotalToAnalyze(pendingFiles.length);
      setAnalyzedCount(0);

      const newQuestions: Question[] = [];

      try {
        for (let i = 0; i < pendingFiles.length; i++) {
            const file = pendingFiles[i];
            if (!file.type.includes('image')) continue;
    
            await new Promise<void>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (event) => {
                  const base64Full = event.target?.result as string;
                  try {
                      const extractedQuestions = await analyzeImageForQuestions(base64Full, file.type, bulkTags);
                      const compressedImage = await compressImage(base64Full, 600, 0.5);
    
                      extractedQuestions.forEach((aiData: any, idx: number) => {
                           newQuestions.push({
                              id: Math.random().toString(36).substr(2, 9) + i + idx,
                              text: aiData.text || `Question ${idx+1} from Image ${i+1}`,
                              type: aiData.type || 'subjective',
                              points: aiData.points || 5,
                              options: aiData.options,
                              image: aiData.hasDiagram ? compressedImage : undefined,
                              _needsImage: aiData.hasDiagram
                          } as any);
                      });
                      resolve();
                  } catch (err: any) {
                      resolve(); 
                  }
                  setAnalyzedCount(prev => prev + 1);
                };
                reader.readAsDataURL(file);
            });
          }
      } catch (e) { console.error(e); }

      setQuestions(prev => [...prev, ...newQuestions]);
      setIsAnalyzing(false);
      setPendingFiles([]); 
  };

  const ScriptView = ({ submission }: { submission: Submission }) => {
    const paper = existingPapers.find(p => p.id === submission.paperId);
    if (!paper) return <div className="p-8">Paper details not found for this submission.</div>;

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("Please allow popups to print the script.");
            return;
        }

        const content = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Script: ${submission.studentName}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Inter', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .math-font { font-family: 'JetBrains Mono', monospace; }
                    @page { margin: 2cm; }
                    @media print {
                      .no-print { display: none; }
                    }
                </style>
            </head>
            <body class="bg-white text-slate-900 p-8 max-w-4xl mx-auto">
                <!-- Header -->
                <div class="border-b-2 border-slate-900 pb-6 mb-8 text-center">
                    <h1 class="text-3xl font-black uppercase tracking-tight mb-2">Examination Script</h1>
                    <p class="text-xl font-bold text-slate-700">${paper.title}</p>
                    <div class="flex justify-center gap-6 mt-4 text-xs font-black uppercase tracking-widest text-slate-500">
                         <span>Student: ${submission.studentName}</span>
                         <span>Class: ${submission.studentGrade}</span>
                         <span>Submitted: ${new Date(submission.submittedAt).toLocaleDateString()}</span>
                    </div>
                </div>

                <!-- Content -->
                <div class="space-y-12">
                    ${paper.questions.map((q, i) => {
                        const ans = submission.answers[q.id];
                        return `
                            <div class="break-inside-avoid">
                                <div class="text-xs font-black text-slate-400 mb-2 uppercase">Question ${i+1} (${q.points} Pts)</div>
                                <h3 class="text-lg font-bold text-slate-900 mb-4 leading-relaxed">${q.text.replace(/\n/g, '<br>')}</h3>
                                
                                ${q.image ? `<div class="mb-4"><img src="${q.image}" class="max-w-full max-h-64 rounded-lg border border-slate-200" /></div>` : ''}

                                <div class="bg-slate-50 p-6 rounded-xl border-l-4 border-indigo-500">
                                    <div class="text-lg text-slate-800 math-font italic whitespace-pre-wrap leading-relaxed">
                                        ${ans?.answerText || '<span class="text-slate-400">No text answer provided.</span>'}
                                    </div>
                                </div>

                                ${ans?.imageUri ? `
                                    <div class="mt-4 pt-4 border-t border-slate-100">
                                        <p class="text-[10px] font-black uppercase text-indigo-500 mb-2">Student Attachment</p>
                                        <img src="${ans.imageUri}" class="max-w-full rounded-xl border border-slate-200 shadow-sm" style="max-height: 400px;" />
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>

                <!-- Footer -->
                <div class="mt-16 pt-8 border-t border-slate-200 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Generated by EduAssess Pro • Secure Assessment Platform
                </div>

                <script>
                   window.onload = function() {
                      setTimeout(() => {
                         window.print();
                      }, 1000);
                   }
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(content);
        printWindow.document.close();
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-4xl h-full rounded-[2rem] overflow-hidden flex flex-col shadow-2xl">
          <div className="bg-slate-900 p-6 flex items-center justify-between text-white shrink-0">
             <div className="flex items-center gap-4">
               <div className="bg-indigo-600 p-3 rounded-xl"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
               <div>
                 <h2 className="text-xl font-black">{submission.studentName}</h2>
                 <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Class {submission.studentGrade} • {submission.paperTitle}</p>
               </div>
             </div>
             <div className="flex gap-3">
                <button onClick={handlePrint} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-colors font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2-2v4h10z" /></svg>
                  Print Script
                </button>
                <button onClick={() => setSelectedSubmission(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-12 bg-slate-50 no-scrollbar">
             <div className="max-w-2xl mx-auto bg-white shadow-xl rounded-lg p-16 min-h-screen border border-slate-200">
               <div className="border-b-2 border-slate-900 pb-10 mb-10 text-center uppercase tracking-widest">
                  <h1 className="text-3xl font-black mb-2 tracking-tighter">Official Examination Script</h1>
                  <p className="text-sm font-bold text-slate-500">{submission.paperTitle}</p>
                  <div className="flex justify-center gap-8 mt-6 text-[10px] font-black">
                     <div>STUDENT: {submission.studentName}</div>
                     <div>CLASS: {submission.studentGrade}</div>
                     <div>DATE: {new Date(submission.submittedAt).toLocaleDateString()}</div>
                  </div>
               </div>
               <div className="space-y-16">
                 {paper.questions.map((q, idx) => {
                   const ans = submission.answers[q.id];
                   return (
                     <div key={q.id}>
                        <div className="text-xs font-black text-slate-400 mb-4 uppercase">Question {idx + 1} ({q.points} Pts)</div>
                        <h4 className="text-lg font-bold text-slate-900 mb-4 leading-relaxed">{q.text}</h4>
                        {q.image && <div className="mb-6"><img src={q.image} className="max-w-full max-h-[300px] rounded-xl border border-slate-200" /></div>}
                        <div className="pl-6 border-l-4 border-indigo-100 italic text-slate-700 text-lg math-font leading-relaxed mb-6 whitespace-pre-wrap min-h-[50px]">
                           {ans?.answerText || <span className="text-slate-300">No response recorded.</span>}
                        </div>
                        {ans?.imageUri && <div className="mt-8"><p className="text-[10px] font-black uppercase text-indigo-400 mb-3 tracking-widest">Workspace Attachment</p><img src={ans.imageUri} className="max-w-full rounded-2xl shadow-lg border border-slate-100" /></div>}
                     </div>
                   );
                 })}
               </div>
               <div className="mt-20 pt-10 border-t border-slate-100 text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em]">
                 End of Script • EduAssess Pro Secure Protocol
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Dashboard</h1>
          <div className="flex gap-4 mt-2">
            <button onClick={() => setActiveTab('papers')} className={`text-xs font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'papers' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Papers</button>
            <button onClick={() => setActiveTab('submissions')} className={`text-xs font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'submissions' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Submissions ({submissions.length})</button>
          </div>
        </div>
        <div className="flex gap-2">
           {activeTab === 'papers' && (
             <button onClick={handleLoadSample} className="bg-teal-600 text-white px-5 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all active:scale-95 hover:bg-teal-700 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Import 'Economics Final' Sample
             </button>
           )}
           {activeTab === 'papers' && (
             <button onClick={() => setShowCreator(true)} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95">Create New Paper</button>
           )}
        </div>
      </div>

      {activeTab === 'papers' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {existingPapers.map(paper => (
            <div key={paper.id} className="bg-white rounded-[2rem] border border-slate-200 p-8 hover:shadow-xl transition-all relative group">
              <div className="flex gap-2 mb-4">
                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{paper.subject}</span>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Class {paper.grade}</span>
                {paper.pdfData && <span className="bg-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">PDF Attached</span>}
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">{paper.title}</h3>
              <p className="text-slate-400 text-xs font-bold mb-4">{paper.questions.length} Questions • {paper.duration} Minutes</p>
              
              <div className="flex gap-2">
                  <button onClick={() => { setActiveTab('submissions'); }} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">View Results</button>
              </div>

              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPaperDeleted(paper.id);
                }} 
                className="absolute top-4 right-4 text-slate-400 hover:text-red-600 transition-colors z-20 p-3 rounded-full hover:bg-red-50 bg-white shadow-sm border border-slate-100"
                title="Delete Paper"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
          {existingPapers.length === 0 && (
             <div className="col-span-2 text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
               <p className="text-slate-400 font-bold">No exams created yet.</p>
               <p className="text-xs text-slate-400 mt-2">Create a new exam or import the sample above.</p>
             </div>
           )}
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map(sub => (
            <div key={sub.id} className="bg-white rounded-[1.5rem] border border-slate-200 p-6 flex items-center justify-between hover:border-indigo-200 transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center font-black text-indigo-600">{sub.studentName[0]}</div>
                <div>
                  <h4 className="font-black text-slate-800">{sub.studentName}</h4>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Class {sub.studentGrade} • {sub.paperTitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                 <div className="text-right hidden sm:block">
                    <p className="text-[10px] font-black text-slate-300 uppercase">Submitted</p>
                    <p className="text-xs font-bold text-slate-500">{new Date(sub.submittedAt).toLocaleTimeString()}</p>
                 </div>
                 <button onClick={() => setSelectedSubmission(sub)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all group-hover:bg-indigo-600">View & Print</button>
              </div>
            </div>
          ))}
          {submissions.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-[2rem]">
               <p className="text-slate-400 font-bold uppercase tracking-widest">No student submissions found.</p>
            </div>
          )}
        </div>
      )}

      {selectedSubmission && <ScriptView submission={selectedSubmission} />}
      
      {showTagModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in slide-in-from-bottom-8">
            <div className="text-center mb-6">
              <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
              </div>
              <h2 className="text-2xl font-black text-slate-900">Add Context Tags</h2>
              <p className="text-slate-500 text-sm mt-2">
                Help the AI categorize these {pendingFiles.length} images by providing keywords (e.g., "Geometry, Circles, 5 Marks").
              </p>
            </div>
            <input 
              autoFocus
              type="text" 
              value={bulkTags}
              onChange={e => setBulkTags(e.target.value)}
              placeholder="e.g. Calculus, Difficult, Section B..." 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none"
            />
            <div className="flex gap-3">
               <button 
                 onClick={processBulkUpload}
                 className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-50"
               >
                 Skip Tags
               </button>
               <button 
                 onClick={processBulkUpload}
                 className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-700"
               >
                 Start Processing
               </button>
            </div>
          </div>
        </div>
      )}

      {showCreator && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto p-4 animate-in slide-in-from-bottom duration-300">
           <div className={`h-full flex flex-col md:flex-row gap-6 ${uploadedFile && uploadMode === 'full_paper' ? 'max-w-full' : 'max-w-4xl mx-auto'}`}>
             
             {/* LEFT COLUMN: PDF Preview */}
             {uploadedFile && uploadMode === 'full_paper' && (
                <div className="hidden md:flex w-1/2 bg-slate-100 rounded-3xl border border-slate-200 overflow-hidden flex-col h-[calc(100vh-4rem)] sticky top-4">
                  <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                       {uploadedFile.name}
                    </h3>
                    <span className="text-[10px] uppercase font-bold bg-white/20 px-2 py-1 rounded">Source Preview</span>
                  </div>
                  {uploadedFile.type.includes('image') ? (
                    <div className="flex-1 overflow-auto bg-slate-200 p-4">
                       <img src={uploadedFile.data} className="w-full shadow-lg" />
                    </div>
                  ) : (
                    <iframe src={uploadedFile.data} className="flex-1 w-full h-full bg-white" title="PDF Preview" />
                  )}
                  <div className="bg-white p-3 text-[10px] text-center text-slate-500 font-bold border-t border-slate-200">
                     PRO TIP: Take screenshots (Win+Shift+S) of diagrams from here and PASTE them into questions on the right.
                  </div>
                </div>
             )}

             {/* RIGHT COLUMN: Editor */}
             <div className={`flex-1 ${uploadedFile && uploadMode === 'full_paper' ? 'overflow-y-auto' : ''}`}>
                 <div className="flex items-center justify-between mb-8">
                   <div>
                      <h2 className="text-3xl font-black text-slate-900">Create Exam Paper</h2>
                      <p className="text-slate-400 mt-1 font-medium text-sm">Configure exam details and questions.</p>
                   </div>
                   <button onClick={() => { setShowCreator(false); resetForm(); }} className="bg-slate-100 p-3 rounded-2xl hover:bg-slate-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                 </div>

                 {/* Metadata Form */}
                 <div className="grid grid-cols-2 gap-4 mb-6">
                   <input placeholder="Exam Title" value={title} onChange={e=>setTitle(e.target.value)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none" />
                   <select value={grade} onChange={e=>setGrade(e.target.value)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none"><option value="">Select Class...</option>{SUPPORTED_GRADES.map(g=><option key={g} value={g}>Class {g}</option>)}</select>
                   <input placeholder="Subject" value={subject} onChange={e=>setSubject(e.target.value)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none" />
                   <div className="relative">
                      <input type="number" value={duration} onChange={e=>setDuration(parseInt(e.target.value))} className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-slate-400 pointer-events-none">Mins</span>
                   </div>
                 </div>

                 {/* Date Scheduling */}
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-8">
                    <p className="text-xs font-black uppercase text-slate-400 mb-3 ml-1 tracking-widest">Exam Schedule (Optional)</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Start Date & Time</label>
                            <input 
                                type="datetime-local" 
                                value={validFrom} 
                                onChange={e => setValidFrom(e.target.value)}
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs" 
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">End Date & Time</label>
                            <input 
                                type="datetime-local" 
                                value={validUntil} 
                                onChange={e => setValidUntil(e.target.value)}
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs" 
                            />
                        </div>
                    </div>
                 </div>

                 {/* Upload Section */}
                 <div className="mb-8">
                    <div className="bg-slate-900 rounded-[2rem] p-6 text-white relative overflow-hidden transition-all duration-300">
                        {/* Mode Toggle */}
                        <div className="flex justify-center mb-6">
                          <div className="bg-slate-800 p-1 rounded-xl flex">
                            <button 
                              onClick={() => setUploadMode('full_paper')}
                              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${uploadMode === 'full_paper' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                            >
                              Single PDF Reference
                            </button>
                            <button 
                              onClick={() => setUploadMode('question_snips')}
                              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${uploadMode === 'question_snips' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                            >
                              Bulk Images
                            </button>
                          </div>
                        </div>

                        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                           <div className="flex-1 text-center md:text-left">
                              <div className="flex items-center gap-3 justify-center md:justify-start mb-2">
                                 <div className="bg-indigo-500 p-2 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></div>
                                 <h3 className="text-lg font-black">{uploadMode === 'full_paper' ? 'AI Paper Constructor' : 'Bulk Image Importer'}</h3>
                              </div>
                              <p className="text-slate-400 text-xs mb-4 max-w-md">
                                 {uploadMode === 'full_paper' 
                                   ? 'Upload a PDF. AI extracts text. You can then PASTE screenshots of diagrams directly into questions.' 
                                   : 'Select multiple images (e.g., screenshots of Q1, Q2). Each image becomes a question.'}
                              </p>
                              <div className="flex gap-3 justify-center md:justify-start">
                                 <input 
                                   type="file" 
                                   ref={fileInputRef} 
                                   onChange={handleFileUpload} 
                                   accept={uploadMode === 'full_paper' ? ".pdf,image/*" : "image/*"}
                                   multiple={uploadMode === 'question_snips'}
                                   className="hidden" 
                                 />
                                 <button 
                                   onClick={() => fileInputRef.current?.click()} 
                                   disabled={isAnalyzing}
                                   className="bg-white text-slate-900 px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-50 transition-colors disabled:opacity-50"
                                 >
                                   {isAnalyzing 
                                     ? (uploadMode === 'question_snips' ? `Processing ${analyzedCount}/${totalToAnalyze}...` : 'Scanning...') 
                                     : (uploadedFile && uploadMode === 'full_paper' ? 'Change File' : (uploadMode === 'question_snips' ? 'Select Images' : 'Upload & Build'))
                                   }
                                 </button>
                              </div>
                              {uploadedFile && !isAnalyzing && uploadMode === 'full_paper' && (
                                <div className="mt-3 flex items-center gap-2 text-green-400 bg-white/10 p-2 rounded-lg inline-flex animate-in fade-in">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  <span className="text-[10px] font-bold">{uploadedFile.name} processed</span>
                                </div>
                              )}
                           </div>
                           
                           {isAnalyzing && (
                             <div className="flex-1 flex flex-col items-center justify-center animate-pulse">
                                <div className="h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">
                                   {uploadMode === 'question_snips' ? 'Analyzing Images...' : 'AI is reading...'}
                                </p>
                             </div>
                           )}
                        </div>
                    </div>
                 </div>

                 {/* Questions List */}
                 <div className="space-y-6 mb-12">
                   <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 gap-4">
                     <h3 className="text-xl font-black text-slate-800">Answer Slots ({questions.length})</h3>
                     
                     <div className="flex gap-2">
                        <button onClick={()=>addQuestion('subjective')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors">+ Subj</button>
                        <button onClick={()=>addQuestion('mcq')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors">+ MCQ</button>
                     </div>
                   </div>
                   
                   {questions.map((q, i) => (
                     <div 
                        key={q.id || i} 
                        className={`p-6 bg-slate-50 rounded-2xl relative border-2 transition-colors animate-in slide-in-from-bottom-2 duration-300 ${((q as any)._needsImage && !q.image) ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:border-indigo-300'}`}
                        onPaste={(e) => handleQuestionPaste(e, q.id)}
                     >
                       {/* AI Hint for Diagram */}
                       {((q as any)._needsImage && !q.image) && (
                          <div className="absolute -top-3 left-6 bg-amber-400 text-amber-900 text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-sm flex items-center gap-1 z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            Diagram Detected - Paste Image Here
                          </div>
                       )}

                       <div className="flex justify-between items-start mb-4">
                          <span className="bg-slate-200 text-slate-500 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">Q{i+1} • {q.type.toUpperCase()}</span>
                          <button onClick={()=>removeQuestion(q.id)} className="text-slate-300 hover:text-red-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                       </div>
                       
                       <textarea 
                         value={q.text} 
                         onChange={e=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, text:e.target.value}:qt))} 
                         className="w-full p-4 border border-slate-200 rounded-xl mb-4 bg-white focus:ring-2 focus:ring-indigo-500/10 outline-none font-medium text-sm" 
                         placeholder="Enter question text or 'Refer to PDF'..." 
                       />
                       
                       {/* Question Image Attachment */}
                       <div className="mb-4">
                         {q.image ? (
                           <div className="relative inline-block group">
                             <img src={q.image} alt="Question" className="h-32 rounded-xl border border-slate-200 shadow-sm bg-white" />
                             <button onClick={()=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, image: undefined}:qt))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                           </div>
                         ) : (
                           <div className="flex items-center gap-2">
                             <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                               <span className="text-xs font-bold text-slate-500">Browse Image</span>
                               <input type="file" accept="image/*" className="hidden" onChange={(e) => handleQuestionImageUpload(e, q.id)} />
                             </label>
                             <span className="text-[10px] text-slate-400 font-bold uppercase">OR Paste Screenshot (Ctrl+V)</span>
                           </div>
                         )}
                       </div>
                       
                       {q.type === 'mcq' && (
                         <div className="grid grid-cols-2 gap-3 mb-4">
                            {q.options?.map((opt, optIdx) => (
                               <input 
                                 key={optIdx}
                                 value={opt}
                                 onChange={(e) => {
                                   const newOptions = [...(q.options || [])];
                                   newOptions[optIdx] = e.target.value;
                                   setQuestions(questions.map(qt=>qt.id===q.id?{...qt, options: newOptions}:qt));
                                 }}
                                 className="p-3 border border-slate-200 rounded-xl text-sm bg-white"
                                 placeholder={`Option ${optIdx + 1}`}
                               />
                            ))}
                         </div>
                       )}

                       <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs font-bold text-slate-400 uppercase">Points:</span>
                          <input 
                            type="number" 
                            value={q.points} 
                            onChange={e=>setQuestions(questions.map(qt=>qt.id===q.id?{...qt, points: parseInt(e.target.value)}:qt))}
                            className="w-16 p-2 border border-slate-200 rounded-lg text-center font-bold bg-white"
                          />
                       </div>
                     </div>
                   ))}
                   
                   {questions.length === 0 && (
                     <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
                        <p className="text-slate-400 font-bold">No questions detected yet.</p>
                        <p className="text-slate-300 text-xs mt-1">
                           {uploadMode === 'full_paper' 
                              ? "Upload a PDF to auto-generate." 
                              : "Select one or more images to auto-convert them into questions."}
                        </p>
                     </div>
                   )}
                 </div>
                 
                 <div className="sticky bottom-0 bg-white pt-4 pb-2 border-t border-slate-100">
                    <button 
                      onClick={savePaper} 
                      disabled={isSaving}
                      className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {isSaving && <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                      {isSaving ? 'Saving...' : 'Store to Database'}
                    </button>
                 </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default TeacherView;
