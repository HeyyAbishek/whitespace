'use client';

import React, { useState, useEffect } from 'react';
import { Square, Circle, Type, MousePointer2, Trash2, Undo } from 'lucide-react';

export default function Canvas() {
  const [elements, setElements] = useState<any[]>([]);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<'select' | 'rectangle' | 'circle' | 'text'>('rectangle');
  const [currentColor, setCurrentColor] = useState('#ffffff');
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
      if (e.key === 'c') setTool('circle');
      if (e.key === 't') setTool('text');
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

    // DRAWING
    if (tool === 'rectangle' || tool === 'circle') {
      const newId = crypto.randomUUID();
      setElements(prev => [...prev, { 
        id: newId, type: tool, x, y, width: 0, height: 0, 
        stroke: currentColor, fill: 'transparent' 
      }]);
      setDrawingId(newId);
    }
    // TEXT TOOL
    else if (tool === 'text') {
      const content = prompt("Enter text:");
      if (content && content.trim() !== "") {
        const newId = crypto.randomUUID();
        setElements(prev => [...prev, { 
          id: newId, type: 'text', x, y, width: 100, height: 40, 
          content: content, stroke: currentColor 
        }]);
      }
      setTool('select'); // Auto-switch to Select to move it immediately
    }
    // SELECT TOOL
    else if (tool === 'select') {
      const clickedShape = [...elements].reverse().find(el => {
        // Text detection (simpler box)
        if (el.type === 'text') {
            return x >= el.x && x <= el.x + 200 && y >= el.y && y <= el.y + 40;
        }
        // Shape detection
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

    if (drawingId && (tool === 'rectangle' || tool === 'circle')) {
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
        
        {/* NATIVE COLOR PICKER */}
        <input 
          type="color" 
          value={currentColor} 
          onChange={(e) => setCurrentColor(e.target.value)} 
          className="w-8 h-8 p-0 border-0 rounded cursor-pointer shrink-0" 
        />

        <div className="w-px bg-[#333] h-6 mx-1 shrink-0" />
        
        <button onClick={() => { setElements([]); localStorage.removeItem('whitespace-elements'); }} className="p-2 shrink-0 rounded hover:bg-red-900/50 text-red-400">
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
