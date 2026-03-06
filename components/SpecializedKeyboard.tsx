
import React, { useState } from 'react';
import { KeyboardTab } from '../types';

interface SpecializedKeyboardProps {
  onKeyPress: (char: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onInsertTable?: (rows: number, cols: number) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

interface TableModalState {
  isOpen: boolean;
  rows: number;
  cols: number;
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
  ],
  [KeyboardTab.TABLE]: [
    ['2×2', '2×3', '2×4', '3×2', '3×3', '3×4', '4×2', '4×3', '4×4', '5×5'],
    ['5×2', '5×3', '5×4', '6×2', '6×3', '6×4', '7×3', '8×3', 'Custom', ''],
    ['', '', '', '', '', '', '', '', '', '']
  ]
};

const SpecializedKeyboard: React.FC<SpecializedKeyboardProps> = ({
  onKeyPress,
  onDelete,
  onClear,
  onInsertTable,
  isOpen,
  setIsOpen
}) => {
  const [activeTab, setActiveTab] = useState<KeyboardTab>(KeyboardTab.ALPHA);
  const [tableModal, setTableModal] = useState<TableModalState>({ isOpen: false, rows: 3, cols: 3 });

  const handleTableInsert = (key: string) => {
    if (!key || !onInsertTable) return;

    if (key === 'Custom') {
      setTableModal({ ...tableModal, isOpen: true });
      return;
    }

    const [r, c] = key.split('×').map(Number);
    onInsertTable(r, c);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-indigo-600/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl hover:bg-indigo-700 transition-all z-50 flex items-center gap-3"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" /></svg>
        <span className="font-bold text-xs tracking-wide">Need Special Characters? Tap Here</span>
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
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab
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
                key ? (
                  <button
                    key={key}
                    onClick={() => {
                      if (activeTab === KeyboardTab.TABLE) {
                        handleTableInsert(key);
                      } else {
                        onKeyPress(key);
                      }
                    }}
                    className={`
                      flex-1 max-w-[65px] h-11 md:h-14 bg-slate-800 hover:bg-slate-700 active:bg-indigo-900 active:scale-95
                      rounded-xl flex items-center justify-center font-bold transition-all shadow-md border border-white/5
                      ${key.length > 2 ? 'text-xs md:text-sm' : 'text-lg'}
                      ${activeTab !== KeyboardTab.ALPHA ? 'math-font' : ''}
                      ${activeTab === KeyboardTab.TABLE ? 'bg-green-900/30 hover:bg-green-800/40 border-green-500/20' : ''}
                    `}
                  >
                    {key}
                  </button>
                ) : (
                  <div key={`empty-${rowIndex}`} className="flex-1 max-w-[65px]" />
                )
              ))}
              {rowIndex === 2 && activeTab !== KeyboardTab.TABLE && (
                <button
                  onClick={onDelete}
                  className="w-20 h-11 md:h-14 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl flex items-center justify-center shadow-md border border-red-500/10 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Table Modal */}
        {tableModal.isOpen && (
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-700">
              <h3 className="text-xl font-black text-white mb-6">Create Custom Table</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">Rows</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={tableModal.rows}
                    onChange={(e) => setTableModal({ ...tableModal, rows: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">Columns</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={tableModal.cols}
                    onChange={(e) => setTableModal({ ...tableModal, cols: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setTableModal({ ...tableModal, isOpen: false })}
                  className="flex-1 py-2 rounded-lg font-bold text-sm uppercase bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (onInsertTable) {
                      onInsertTable(tableModal.rows, tableModal.cols);
                    }
                    setTableModal({ ...tableModal, isOpen: false });
                  }}
                  className="flex-1 py-2 rounded-lg font-bold text-sm uppercase bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpecializedKeyboard;
