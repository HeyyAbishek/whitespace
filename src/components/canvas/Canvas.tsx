'use client';

import React, { useState, useEffect } from 'react';
import { Square, MousePointer2, Trash2, Undo } from 'lucide-react';

export default function Canvas() {
  const [elements, setElements] = useState<any[]>([]);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<'select' | 'rectangle'>('rectangle');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // --- PERSISTENCE ---
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('whitespace-elements');
    if (saved) try { setElements(JSON.parse(saved)); } catch (e) {}
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem('whitespace-elements', JSON.stringify(elements));
  }, [elements, mounted]);

  // --- SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setElements(prev => prev.filter(el => el.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === 'v') setTool('select');
      if (e.key === 'r') setTool('rectangle');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  // --- MATH ---
  const screenToWorld = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - camera.x) / camera.zoom,
      y: (e.clientY - rect.top - camera.y) / camera.zoom
    };
  };

  // --- INTERACTION ---
  const handlePointerDown = (e: React.PointerEvent) => {
    const { x, y } = screenToWorld(e);

    // Pan
    if (e.button === 1 || e.getModifierState('Space')) {
      setIsPanning(true);
      return;
    }

    if (tool === 'rectangle') {
      const newId = crypto.randomUUID();
      setElements(prev => [...prev, { id: newId, type: 'rectangle', x, y, width: 0, height: 0, fill: '#fff' }]);
      setDrawingId(newId);
    }
    else if (tool === 'select') {
      // FIX: Robust Hit Testing (Handles negative width/height)
      const clickedShape = [...elements].reverse().find(el => {
        const left = Math.min(el.x, el.x + el.width);
        const right = Math.max(el.x, el.x + el.width);
        const top = Math.min(el.y, el.y + el.height);
        const bottom = Math.max(el.y, el.y + el.height);
        return x >= left && x <= right && y >= top && y <= bottom;
      });

      if (clickedShape) {
        setSelectedId(clickedShape.id);
        setIsDragging(true);
        setDragStart({ x: x - clickedShape.x, y: y - clickedShape.y });
      } else {
        setSelectedId(null);
        setIsPanning(true);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setCamera(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
      return;
    }

    const { x, y } = screenToWorld(e);

    if (tool === 'rectangle' && drawingId) {
      setElements(prev => prev.map(el => el.id === drawingId ? { ...el, width: x - el.x, height: y - el.y } : el));
    }

    if (tool === 'select' && isDragging && selectedId) {
      setElements(prev => prev.map(el => el.id === selectedId ? { ...el, x: x - dragStart.x, y: y - dragStart.y } : el));
    }
  };

  const handlePointerUp = () => {
    setDrawingId(null);
    setIsDragging(false);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scale = 1 - e.deltaY * 0.001;
    const newZoom = Math.max(0.1, Math.min(5, camera.zoom * scale));
    setCamera(prev => ({ ...prev, zoom: newZoom }));
  };

  if (!mounted) return null;

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#121212] text-white relative select-none">
      
      {/* TOOLBAR */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1e1e1e] p-2 rounded-lg flex gap-2 z-50 border border-[#333] shadow-xl">
        <button onClick={() => setTool('select')} className={`p-2 rounded ${tool === 'select' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}>
          <MousePointer2 size={20} />
        </button>
        <button onClick={() => setTool('rectangle')} className={`p-2 rounded ${tool === 'rectangle' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}>
          <Square size={20} />
        </button>
        <div className="w-px bg-[#333] mx-1" />
        <button onClick={() => { setElements([]); localStorage.removeItem('whitespace-elements'); }} className="p-2 rounded hover:bg-red-900/50 text-red-400">
          <Trash2 size={20} />
        </button>
      </div>

      {/* CANVAS */}
      <div 
        className={`w-full h-full touch-none ${isPanning ? 'cursor-grabbing' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="w-full h-full origin-top-left pointer-events-none" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
           
           {/* Grid */}
           <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
           
           {/* Elements */}
           {elements.map(el => (
             <div 
               key={el.id} 
               className={`absolute bg-white/10 ${selectedId === el.id ? 'border-2 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'border border-white/50'}`}
               style={{ 
                 left: Math.min(el.x, el.x + el.width), 
                 top: Math.min(el.y, el.y + el.height), 
                 width: Math.abs(el.width), 
                 height: Math.abs(el.height) 
               }} 
             />
           ))}
        </div>
      </div>
    </div>
  );
}
