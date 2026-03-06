import React, { useState } from 'react';

interface EditableTableProps {
  rows: number;
  cols: number;
  initialData?: string[][];
  onUpdate: (data: string[][]) => void;
  onRemove: () => void;
}

const EditableTable: React.FC<EditableTableProps> = ({ rows, cols, initialData, onUpdate, onRemove }) => {
  const [tableData, setTableData] = useState<string[][]>(
    initialData && initialData.length > 0
      ? initialData
      : Array(rows)
        .fill(null)
        .map(() => Array(cols).fill(''))
  );

  const handleCellChange = (row: number, col: number, value: string) => {
    const newData = tableData.map(r => [...r]);
    newData[row][col] = value;
    setTableData(newData);
    onUpdate(newData);
  };

  return (
    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">📊 Edit Your Table</p>
        <button
          onClick={onRemove}
          className="text-xs font-bold text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
        >
          ✕ Remove Table
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {tableData.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, colIdx) => (
                  <td
                    key={`${rowIdx}-${colIdx}`}
                    className="border border-slate-300 p-2"
                  >
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                      className="w-full px-2 py-1 rounded border border-slate-300 focus:border-indigo-500 focus:outline-none text-sm"
                      placeholder={`R${rowIdx + 1}C${colIdx + 1}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 mt-3">Click cells to edit • Changes auto-save</p>
    </div>
  );
};

export default EditableTable;
