import React, { useMemo, useState } from 'react'

export type PuzzleBlock = {
  id: string
  label: string
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export default function PuzzleBuilder() {
  const [blocks, setBlocks] = useState<PuzzleBlock[]>([])
  const [newLabel, setNewLabel] = useState('')

  const canAdd = useMemo(() => newLabel.trim().length > 0, [newLabel])

  const addBlock = () => {
    if (!canAdd) return
    setBlocks(prev => [...prev, { id: generateId(), label: newLabel.trim() }])
    setNewLabel('')
  }

  const clearBlocks = () => setBlocks([])

  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id))

  return (
    <div className="puzzle-builder">
      <div className="builder-toolbar">
        <input 
          className="builder-input" 
          placeholder="Block label..." 
          value={newLabel} 
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button className="btn-primary" disabled={!canAdd} onClick={addBlock}>Add Block</button>
        <button className="btn-secondary" onClick={clearBlocks}>Clear</button>
      </div>

      <div className="builder-canvas">
        {blocks.length === 0 ? (
          <div className="builder-empty">Use the toolbar to add blocks.</div>
        ) : (
          <div className="builder-grid">
            {blocks.map((b) => (
              <div key={b.id} className="puzzle-block puzzle-block--workspace" style={{ padding: '10px 12px', gap: 8 }}>
                <span>{b.label}</span>
                <button className="btn-secondary" onClick={() => removeBlock(b.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
