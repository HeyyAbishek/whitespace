'use client'

import React, { useEffect } from 'react'
import { MousePointer2, Square, Circle, Pencil } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { clsx } from 'clsx'

const Toolbar = () => {
  const activeTool = useStore((state) => state.activeTool)
  const setActiveTool = useStore((state) => state.setActiveTool)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input (though we don't have inputs yet)
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      switch (e.key.toLowerCase()) {
        case 'v':
          setActiveTool('select')
          break
        case 'r':
          setActiveTool('rectangle')
          break
        case 'c':
          setActiveTool('circle')
          break
        case 'p':
          setActiveTool('pencil')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTool])

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select (V)' },
    { id: 'rectangle', icon: Square, label: 'Rectangle (R)' },
    // Adding these placeholders as they are in the store type definition, 
    // even though the task focused on Select/Rectangle.
    { id: 'circle', icon: Circle, label: 'Circle (C)' }, 
    { id: 'pencil', icon: Pencil, label: 'Pencil (P)' },
  ] as const

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex gap-2 pointer-events-auto">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          className={clsx(
            'p-3 rounded-md transition-colors',
            activeTool === tool.id
              ? 'bg-blue-100 text-blue-600'
              : 'hover:bg-gray-100 text-gray-600'
          )}
          title={tool.label}
        >
          <tool.icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  )
}

export default Toolbar
