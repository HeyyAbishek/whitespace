"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Square, Circle, Type, MousePointer2, Trash2, Camera, FileText } from 'lucide-react';
import { useStorage, useMutation, useUndo, useRedo, useOthers, useMyPresence } from "@/liveblocks.config";
import { toPng } from 'html-to-image'; 
import Cursor from './Cursor'; 

export default function Canvas() {
  const elements = useStorage((root) => root.elements);
  const others = useOthers();
  const [myPresence, updateMyPresence] = useMyPresence();
  const undo = useUndo();
  const redo = useRedo();

  // --- ACTIONS ---
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

  // --- STATE ---
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<'select' | 'rectangle' | 'circle' | 'text' | 'note'>('rectangle');
  const [currentColor, setCurrentColor] = useState('#ffffff'); 
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Interaction States
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  
  // DRAG & RESIZE MATH STATE
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); 
  const [resizeStart, setResizeStart] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  
  const [drawingId, setDrawingId] = useState<string | null>(null);

  // --- EXPORT ---
  const handleExport = useCallback(() => {
    const node = document.getElementById('canvas-content');
    if (!node) return;
    const filter = (node: HTMLElement) => !node.classList?.contains('cursor-overlay');
    toPng(node, { filter, backgroundColor: '#121212' })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = 'whitespace-export.png';
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => console.error(err));
  }, []);

  // --- KEYBOARD ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') setIsSpacePressed(true);
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteElement(selectedId);
        setSelectedId(null);
      }
      if (e.key === 'v') setTool('select');
      if (e.key === 'n') setTool('note');
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

  // --- POINTER DOWN (CLICK) ---
  const handlePointerDown = (e: React.PointerEvent) => {
    const { x, y } = screenToWorld(e);

    if (e.button === 1 || isSpacePressed) {
      setIsPanning(true);
      return;
    }

    // 1. Drawing Tools (Now initializing content: "" for shapes)
    if (tool === 'rectangle' || tool === 'circle') {
      const newId = crypto.randomUUID();
      addElement({ id: newId, type: tool, x, y, width: 0, height: 0, stroke: currentColor, fill: 'transparent', content: "" });
      setDrawingId(newId);
      return;
    } 
    else if (tool === 'text') {
      addElement({ id: crypto.randomUUID(), type: 'text', x, y, width: 100, height: 40, content: "Double Click to Edit", stroke: currentColor });
      setTool('select'); 
      return;
    }
    else if (tool === 'note') {
       addElement({ id: crypto.randomUUID(), type: 'note', x, y, width: 200, height: 200, content: "Double Click to Edit", fill: '#facc15' });
       setTool('select');
       return;
    }

    // 2. SELECTION & RESIZE CHECK
    if (tool === 'select') {
      if (selectedId) {
         const el = elements?.find(e => e.id === selectedId);
         if (el) {
             const cornerX = el.x + el.width;
             const cornerY = el.y + el.height;
             const dist = Math.hypot(x - cornerX, y - cornerY);
             
             // Check if clicking the Blue Handle
             if (dist < 30 / camera.zoom) {
                 setResizeStart({ x, y, w: el.width, h: el.height });
                 return; 
             }
         }
      }

      const clickedShape = [...(elements || [])].reverse().find(el => {
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

  // --- POINTER MOVE ---
  const handlePointerMove = (e: React.PointerEvent) => {
    const { x, y } = screenToWorld(e);
    updateMyPresence({ cursor: { x, y } });

    if (isPanning) {
      setCamera(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
      return;
    }

    if (resizeStart && selectedId) {
        const deltaX = x - resizeStart.x;
        const deltaY = y - resizeStart.y;
        updateElement({ 
            id: selectedId, 
            updates: { 
                width: Math.max(10, resizeStart.w + deltaX),
                height: Math.max(10, resizeStart.h + deltaY)
            } 
        });
        return; 
    }

    if (drawingId && (tool === 'rectangle' || tool === 'circle')) {
      const el = elements?.find(e => e.id === drawingId);
      if(el) updateElement({ id: drawingId, updates: { width: x - el.x, height: y - el.y } });
    }

    if (tool === 'select' && isDragging && selectedId && !resizeStart) {
      updateElement({ id: selectedId, updates: { x: x - dragStart.x, y: y - dragStart.y } });
    }
  };

  const handlePointerUp = () => { 
      setDrawingId(null); 
      setIsDragging(false); 
      setIsPanning(false); 
      setResizeStart(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scale = 1 - e.deltaY * 0.001;
    const newZoom = Math.max(0.1, Math.min(5, camera.zoom * scale));
    setCamera(prev => ({ ...prev, zoom: newZoom }));
  };

  if (!elements) return <div className="text-white p-10">Loading Board...</div>;

  return (
    <div className={`w-screen h-screen overflow-hidden bg-[#121212] text-white relative select-none ${isSpacePressed ? 'cursor-grab' : ''}`}>
      
      {/* TOOLBAR */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1e1e1e] p-2 rounded-lg flex gap-2 z-50 border border-[#333] shadow-xl items-center">
        <button onClick={() => setTool('select')} className={`p-2 shrink-0 rounded ${tool === 'select' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}><MousePointer2 size={20} /></button>
        <button onClick={() => setTool('rectangle')} className={`p-2 shrink-0 rounded ${tool === 'rectangle' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}><Square size={20} /></button>
        <button onClick={() => setTool('circle')} className={`p-2 shrink-0 rounded ${tool === 'circle' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}><Circle size={20} /></button>
        <button onClick={() => setTool('text')} className={`p-2 shrink-0 rounded ${tool === 'text' ? 'bg-blue-600' : 'hover:bg-[#333]'}`}><Type size={20} /></button>
        <button onClick={() => setTool('note')} className={`p-2 shrink-0 rounded ${tool === 'note' ? 'bg-blue-600' : 'hover:bg-[#333]'}`} title="Sticky Note (N)"><FileText size={20} /></button>
        <div className="w-px bg-[#333] h-6 mx-1 shrink-0" />
        <input type="color" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer shrink-0" />
        <div className="w-px bg-[#333] h-6 mx-1 shrink-0" />
        <button onClick={handleExport} className="p-2 shrink-0 rounded hover:bg-green-900/50 text-green-400"><Camera size={20} /></button>
        <button onClick={() => { if(confirm('Clear board?')) clearBoard(); }} className="p-2 shrink-0 rounded hover:bg-red-900/50 text-red-400"><Trash2 size={20} /></button>
      </div>

      {/* CANVAS LAYER */}
      <div 
        className={`w-full h-full touch-none ${isPanning ? 'cursor-grabbing' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => updateMyPresence({ cursor: null })}
        onWheel={handleWheel}
      >
        <div id="canvas-content" className="w-full h-full origin-top-left pointer-events-none" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
           <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
           
           {elements.map((el: any, index: number) => {
             const uniqueKey = `${el.id}-${index}`; 
             const isSelected = selectedId === el.id;
             const baseStyle = {
               position: 'absolute' as const,
               left: Math.min(el.x, el.x + el.width),
               top: Math.min(el.y, el.y + el.height),
               width: Math.abs(el.width),
               height: Math.abs(el.height),
               borderColor: el.stroke,
               color: el.stroke,
               pointerEvents: 'auto' as const,
               display: 'flex',             // NEW: Allows text centering
               alignItems: 'center',        // NEW
               justifyContent: 'center',    // NEW
               textAlign: 'center' as const,
               overflow: 'hidden'
             };

             const resizeHandle = isSelected ? (
                 <div 
                    className="absolute bottom-0 right-0 w-8 h-8 bg-blue-500 border-2 border-white z-50 shadow-xl rounded-full"
                    style={{ transform: 'translate(50%, 50%)', cursor: 'nwse-resize' }}
                 />
             ) : null;

             const handleDoubleClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (typeof window !== 'undefined' && window.prompt) {
                    const newText = window.prompt("Edit text:", el.content || "");
                    if (newText !== null) updateElement({ id: el.id, updates: { content: newText } });
                }
             };

             // --- RENDERERS ---

             if (el.type === 'text') {
                return ( 
                    <div key={uniqueKey} onDoubleClick={handleDoubleClick}
                         style={{ ...baseStyle, border: isSelected ? '1px solid #3b82f6' : 'none', fontSize: '24px', fontFamily: 'sans-serif', padding: '4px' }}>
                        {el.content}
                    </div> 
                );
             }

             if (el.type === 'note') {
                return (
                    <div key={uniqueKey} onDoubleClick={handleDoubleClick}
                        style={{ ...baseStyle, backgroundColor: el.fill, color: '#000', boxShadow: '4px 4px 10px rgba(0,0,0,0.5)', padding: '10px', fontSize: '18px', fontFamily: 'Comic Sans MS, sans-serif', border: isSelected ? '2px solid #3b82f6' : 'none' }}
                    >
                        {el.content}
                        {resizeHandle} 
                    </div>
                );
             }

             // GENERIC SHAPES (RECTANGLE / CIRCLE)
             // Now with Text Support + Resize Handles
             return ( 
                 <div key={uniqueKey} 
                      onDoubleClick={handleDoubleClick} // Enable writing
                      className={`absolute bg-transparent ${isSelected ? 'ring-2 ring-blue-500 shadow-xl' : ''}`} 
                      style={{ 
                          ...baseStyle, 
                          borderWidth: '2px', 
                          borderStyle: 'solid', 
                          borderRadius: el.type === 'circle' ? '50%' : '0%',
                          fontSize: '16px',
                          fontFamily: 'sans-serif'
                      }}
                 >
                    {el.content} {/* Show text inside the box */}
                    {resizeHandle} 
                 </div> 
             );
           })}

           <div className="cursor-overlay">
               {others.map(({ connectionId, presence }) => {
                  if (!presence || !presence.cursor) return null;
                  return ( <Cursor key={connectionId} x={presence.cursor.x} y={presence.cursor.y} connectionId={connectionId} /> );
               })}
           </div>
        </div>
      </div>
    </div>
  );
}