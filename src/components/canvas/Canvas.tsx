"use client";

import React, { useState, useEffect } from 'react';
import { Square, Circle, Type, MousePointer2, Trash2, Undo } from 'lucide-react';
import { useStorage, useMutation, useUndo, useRedo } from "@/liveblocks.config";

export default function Canvas() {
  // --- 1. CLOUD STATE (The New Heart) ---
  const elements = useStorage((root) => root.elements);
  const undo = useUndo();
  const redo = useRedo();

  // --- 2. CLOUD ACTIONS (The New Muscles) ---
  const addElement = useMutation(({ storage }, newShape) => {
    storage.get("elements").push(newShape);
  }, []);

  const updateElement = useMutation(({ storage }, { id, updates }) => {
    const liveElements = storage.get("elements");
    const index = liveElements.findIndex((el) => el.id === id);
    if (index !== -1) {
      liveElements.set(index, { ...liveElements.get(index), ...updates });
    }
  }, []);

  const deleteElement = useMutation(({ storage }, id) => {
    const liveElements = storage.get("elements");
    const index = liveElements.findIndex((el) => el.id === id);
    if (index !== -1) liveElements.delete(index);
  }, []);
  
  const clearBoard = useMutation(({ storage }) => {
    const liveElements = storage.get("elements");
    while (liveElements.length > 0) liveElements.delete(0);
  }, []);

  // --- LOCAL INTERACTION STATE (UI Only) ---
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<'select' | 'rectangle' | 'circle' | 'text'>('rectangle');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [drawingId, setDrawingId] = useState<string | null>(null);

  // --- KEYBOARD LISTENERS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') setIsSpacePressed(true);
      
      // Undo/Redo (Bonus!)
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteElement(selectedId);
        setSelectedId(null);
      }
      if (e.key === 'v') setTool('select');
      if (e.key === 'r') setTool('rectangle');
      if (e.key === 'c') setTool('circle');
      if (e.key === 't') setTool('text');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedId, deleteElement, undo, redo]);

  // --- MATH ---
  const screenToWorld = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - camera.x) / camera.zoom,
      y: (e.clientY - rect.top - camera.y) / camera.zoom
    };
  };

  // --- INTERACTION HANDLERS ---
  const handlePointerDown = (e: React.PointerEvent) => {
    const { x, y } = screenToWorld(e);

    if (e.button === 1 || isSpacePressed) {
      setIsPanning(true);
      return;
    }

    // DRAWING
    if (tool === 'rectangle' || tool === 'circle') {
      const newId = crypto.randomUUID();
      addElement({
        id: newId, type: tool, x, y, width: 0, height: 0, 
        stroke: currentColor, fill: 'transparent'
      });
      setDrawingId(newId);
    }
    // TEXT TOOL
    else if (tool === 'text') {
      const content = prompt("Enter text:");
      if (content && content.trim() !== "") {
        addElement({
          id: crypto.randomUUID(), type: 'text', x, y, width: 100, height: 40, 
          content: content, stroke: currentColor 
        });
      }
      setTool('select');
    }
    // SELECT TOOL
    else if (tool === 'select') {
      // Use "elements || []" because cloud might be loading
      const clickedShape = [...(elements || [])].reverse().find(el => {
        if (el.type === 'text') return x >= el.x && x <= el.x + 200 && y >= el.y && y <= el.y + 40;
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

    // Live Update via Mutation
    if (drawingId && (tool === 'rectangle' || tool === 'circle')) {
      // We need to find the START position of the current drawing shape
      // For simplicity in this demo, we assume start was where we clicked.
      // A more robust way is to store "startPoint" in local state.
      // But let's try updating directly:
      const el = elements?.find(e => e.id === drawingId);
      if(el) {
          updateElement({ id: drawingId, updates: { width: x - el.x, height: y - el.y } });
      }
    }

    if (tool === 'select' && isDragging && selectedId) {
      updateElement({ id: selectedId, updates: { x: x - dragStart.x, y: y - dragStart.y } });
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

  if (!elements) return <div className="text-white p-10">Loading Cloud...</div>;

  return (
    <div className={`w-screen h-screen overflow-hidden bg-[#121212] text-white relative select-none ${isSpacePressed ? 'cursor-grab' : ''}`}>
      
      {/* TOOLBAR */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1e1e1e] p-2 rounded-lg flex gap-2 z-50 border border-[#333] shadow-xl items-center">
        <button onClick={() => setTool('select')} className={`p-2 shrink-0 rounded ${tool === 'select' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}>
          <MousePointer2 size={20} />
        </button>
        <button onClick={() => setTool('rectangle')} className={`p-2 shrink-0 rounded ${tool === 'rectangle' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}>
          <Square size={20} />
        </button>
        <button onClick={() => setTool('circle')} className={`p-2 shrink-0 rounded ${tool === 'circle' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}>
          <Circle size={20} />
        </button>
        <button onClick={() => setTool('text')} className={`p-2 shrink-0 rounded ${tool === 'text' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}>
          <Type size={20} />
        </button>
        
        <div className="w-px bg-[#333] h-6 mx-1 shrink-0" />
        <input type="color" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer shrink-0" />
        <div className="w-px bg-[#333] h-6 mx-1 shrink-0" />
        
        <button onClick={() => { if(confirm('Clear board?')) clearBoard(); }} className="p-2 shrink-0 rounded hover:bg-red-900/50 text-red-400">
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
           
           <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
           
           {/* RENDER ELEMENTS */}
           {elements.map(el => {
             const isSelected = selectedId === el.id;
             const baseStyle = {
               position: 'absolute' as const,
               left: Math.min(el.x, el.x + el.width),
               top: Math.min(el.y, el.y + el.height),
               width: Math.abs(el.width),
               height: Math.abs(el.height),
               borderColor: el.stroke,
               color: el.stroke
             };

             if (el.type === 'text') {
                return (
                    <div key={el.id}
                         style={{
                            position: 'absolute',
                            left: el.x, top: el.y,
                            color: el.stroke,
                            fontSize: '24px',
                            fontFamily: 'sans-serif',
                            border: isSelected ? '1px solid #3b82f6' : 'none',
                            padding: '4px'
                         }}
                    >
                        {el.content}
                    </div>
                );
             }

             return (
               <div 
                 key={el.id} 
                 className={`absolute bg-transparent ${isSelected ? 'ring-2 ring-blue-500 shadow-xl' : ''}`} 
                 style={{ 
                   ...baseStyle, 
                   borderWidth: '2px', 
                   borderStyle: 'solid', 
                   borderRadius: el.type === 'circle' ? '50%' : '0%' 
                 }} 
               />
             );
           })}
        </div>
      </div>
    </div>
  );
}
