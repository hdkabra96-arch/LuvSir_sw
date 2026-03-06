
export type UserRole = 'teacher' | 'student';

export const SUPPORTED_GRADES = ['8', '9', '10', '11', '12'] as const;

export interface Instructor {
  username: string;
  passwordHash: string; // Stored as plain string for this local simulation
  lastLogin: string;
}

export interface StudentProfile {
  id: string;
  name: string;
  grade: string;
  joinedAt: string;
}

export interface Question {
  id: string;
  text: string;
  type: 'subjective' | 'mcq';
  points: number;
  options?: string[];
  image?: string; // Base64 image data for diagrams
}

export interface QuestionPaper {
  id: string;
  title: string;
  subject: string;
  grade: string;
  duration: number; // in minutes
  questions: Question[];
  createdAt: string;
  pdfData?: string; // Base64 encoded PDF or Image data
  validFrom?: string; // ISO Date String
  validUntil?: string; // ISO Date String
}

export interface AnswerSubmission {
  questionId: string;
  answerText: string;
  imageUri?: string;
  tableData?: string[][];
}

export interface Submission {
  id: string;
  paperId: string;
  paperTitle: string;
  studentId: string;
  studentName: string;
  studentGrade: string;
  submittedAt: string;
  answers: Record<string, AnswerSubmission>;
}

export interface ExamSession {
  paper: QuestionPaper;
  startTime: number;
  answers: Record<string, AnswerSubmission>;
}

export enum KeyboardTab {
  ALPHA = 'Alpha',
  MATH = 'Math',
  STATS = 'Stats',
  SCIENCE = 'Science',
  SUPERSUB = 'Super/Sub',
  TABLE = 'Table'
}
