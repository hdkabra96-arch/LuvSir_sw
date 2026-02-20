
import React, { useState } from 'react';
import { KeyboardTab } from '../types';

interface SpecializedKeyboardProps {
  onKeyPress: (char: string) => void;
  onDelete: () => void;
  onClear: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const KEYBOARD_DATA: Record<KeyboardTab, string[][]> = {
  [KeyboardTab.ALPHA]: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', ',', ' ']
  ],
  [KeyboardTab.MATH]: [
    ['+', '-', '*', '/', '=', '(', ')', '^', '√', '×10^'],
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    ['<', '>', '≤', '≥', '≠', '∞', '∫', '∑', 'π', 'log']
  ],
  [KeyboardTab.STATS]: [
    ['μ', 'σ', 'σ²', 'x̄', 'Σ', 'n', 'p', 'q', 'H₀', 'H₁'],
    ['α', 'β', 'γ', 'λ', 'χ²', 'z', 't', 'F', 'P(x)', 'E(x)'],
    ['∪', '∩', '∈', '∉', '⊂', 'ρ', 'r', 'Cov', 'Var', 'SD']
  ],
  [KeyboardTab.SCIENCE]: [
    ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne'],
    ['Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'],
    ['→', '⇌', 'Δ', 'λ', 'ν', 'ρ', 'Ω', '℃', '℉', 'atm']
  ],
  [KeyboardTab.SUPERSUB]: [
    ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'],
    ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'],
    ['⁺', '⁻', '⁼', '⁽', '⁾', '₊', '₋', '₌', '₍', '₎']
  ]
};

const SpecializedKeyboard: React.FC<SpecializedKeyboardProps> = ({ 
  onKeyPress, 
  onDelete, 
  onClear,
  isOpen,
  setIsOpen
}) => {
  const [activeTab, setActiveTab] = useState<KeyboardTab>(KeyboardTab.ALPHA);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-indigo-600 text-white p-4 rounded-full shadow-2xl hover:bg-indigo-700 transition-all z-50 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="font-semibold uppercase text-xs tracking-widest">Digital Input Tools</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white shadow-[0_-20px_60px_rgba(0,0,0,0.5)] z-50 transition-all animate-in slide-in-from-bottom duration-300">
      <div className="max-w-4xl mx-auto p-3">
        {/* Header/Tabs */}
        <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {Object.values(KeyboardTab).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab 
                    ? 'bg-indigo-600 text-white shadow-lg' 
                    : 'bg-slate-800 text-slate-500 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsOpen(false)}
              className="bg-slate-800 text-indigo-400 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 transition-colors border border-slate-700"
            >
              Use Normal Keyboard
            </button>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-slate-800 rounded-full transition-colors text-slate-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Keys Grid */}
        <div className="grid gap-2 h-48 md:h-56 select-none">
          {KEYBOARD_DATA[activeTab].map((row, rowIndex) => (
            <div key={rowIndex} className="flex justify-center gap-2">
              {row.map((key) => (
                <button
                  key={key}
                  onClick={() => onKeyPress(key)}
                  className={`
                    flex-1 max-w-[65px] h-11 md:h-14 bg-slate-800 hover:bg-slate-700 active:bg-indigo-900 active:scale-95
                    rounded-xl flex items-center justify-center font-bold transition-all shadow-md border border-white/5
                    ${key.length > 2 ? 'text-xs md:text-sm' : 'text-lg'}
                    ${activeTab !== KeyboardTab.ALPHA ? 'math-font' : ''}
                  `}
                >
                  {key}
                </button>
              ))}
              {rowIndex === 2 && (
                <>
                  <button
                    onClick={onDelete}
                    className="w-20 h-11 md:h-14 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl flex items-center justify-center shadow-md border border-red-500/10 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                    </svg>
                  </button>
                  <button
                    onClick={onClear}
                    className="w-16 h-11 md:h-14 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl flex items-center justify-center shadow-md border border-white/5 transition-colors text-[10px] font-black uppercase tracking-tighter"
                  >
                    CLR
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SpecializedKeyboard;
