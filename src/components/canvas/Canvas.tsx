"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Square, Circle, Type, MousePointer2, Trash2, Undo, Redo, Camera, 
  StickyNote, Image as ImageIcon, Sun, Moon, MessageCircle, X, Send, 
  User, Pencil
} from 'lucide-react';
import { useStorage, useMutation, useUndo, useRedo, useOthers, useMyPresence, useHistory } from "@/liveblocks.config";
import { toPng } from 'html-to-image';
import Cursor from './Cursor';

// --- TYPES ---
type LayerType = 'rectangle' | 'circle' | 'text' | 'note' | 'image' | 'pencil';
type HandleType = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l';

interface Layer {
  id: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  content?: string;
  points?: number[][];
}

interface Message {
  user: string;
  text: string;
  color: string;
}

// --- NORMALIZATION HELPER (CRITICAL FOR MATH) ---
function normalizeShape(el: Layer) {
    const x = el.width < 0 ? el.x + el.width : el.x;
    const y = el.height < 0 ? el.y + el.height : el.y;
    const width = Math.abs(el.width);
    const height = Math.abs(el.height);
    return { x, y, width, height };
}

export default function Canvas() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // --- LIVEBLOCKS ---
  const storageElements = useStorage((root) => root.elements);
  const elements = (storageElements || []) as Layer[];
  
  // --- SAFE RENDERING (DEDUPLICATION) ---
  // Fixes "Encountered two children with the same key" error
  const uniqueElements = React.useMemo(() => {
    const seen = new Set();
    return elements.filter(el => {
      if (seen.has(el.id)) return false;
      seen.add(el.id);
      return true;
    });
  }, [elements]);

  const storageMessages = useStorage((root) => root.messages);
  const messages = (storageMessages || []) as Message[];
  const others = useOthers();
  const [myPresence, updateMyPresence] = useMyPresence();
  const undo = useUndo();
  const redo = useRedo();
  const history = useHistory();

  // --- STATE ---
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<LayerType | 'select'>('select');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentColor, setCurrentColor] = useState('#3b82f6');
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  
  // RESIZE STATE (The Brain)
  const [isResizing, setIsResizing] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
  const [resizeStart, setResizeStart] = useState<{ 
      x: number, y: number, width: number, height: number, 
      startX: number, startY: number 
  } | null>(null);
  
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); 
  const [drawingId, setDrawingId] = useState<string | null>(null);

  // UI State
  const [username, setUsername] = useState("Guest");
  const [showNameModal, setShowNameModal] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempText, setTempText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- HELPERS ---
  const findIndexById = (liveList: any, targetId: string) => {
    if (!liveList) return -1;
    for (let i = 0; i < liveList.length; i++) {
        const item = liveList.get(i);
        const itemId = item?.get ? item.get("id") : item?.id;
        if (itemId === targetId) return i;
    }
    return -1;
  };

  const screenToWorld = (clientX: number, clientY: number) => {
    return {
      x: (clientX - camera.x) / camera.zoom,
      y: (clientY - camera.y) / camera.zoom
    };
  };

  // --- MUTATIONS ---
  const addElement = useMutation(({ storage }, newShape: Layer) => {
    const existingElements = storage.get("elements");
    if (existingElements) existingElements.push(newShape);
  }, []);

  const updateElement = useMutation(({ storage }, { id, updates }: { id: string; updates: Partial<Layer> }) => {
    const liveElements = storage.get("elements");
    if (!liveElements) return;
    const index = findIndexById(liveElements, id);
    if (index !== -1) liveElements.set(index, { ...liveElements.get(index), ...updates });
  }, []);

  const deleteElement = useMutation(({ storage }, id: string) => {
    const liveElements = storage.get("elements");
    if (liveElements) {
        const index = findIndexById(liveElements, id);
        if (index !== -1) liveElements.delete(index);
    }
  }, []);
  
  const clearBoard = useMutation(({ storage }) => {
    const liveElements = storage.get("elements");
    if (liveElements) while (liveElements.length > 0) liveElements.delete(0);
  }, []);

  const sendMessage = useMutation(({ storage }, { text, user }: { text: string, user: string }) => {
    if (!text.trim()) return;
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];
    const userColor = colors[user.length % colors.length];
    const liveMessages = storage.get("messages");
    if (liveMessages) liveMessages.push({ user, text, color: userColor });
  }, []);

  const handleExport = useCallback(() => {
    const node = document.getElementById('canvas-content');
    if (node) {
        const filter = (node: HTMLElement) => !node.classList?.contains('cursor-overlay');
        toPng(node, { filter, backgroundColor: isDarkMode ? '#121212' : '#f8f9fa' })
          .then((dataUrl) => {
            const link = document.createElement('a');
            link.download = 'whitespace-export.png';
            link.href = dataUrl;
            link.click();
          });
    }
  }, [isDarkMode]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
          const maxSize = 300; 
          let width = img.width;
          let height = img.height;
          if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if(ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.3);
              const startX = (window.innerWidth / 2 - camera.x) / camera.zoom;
              const startY = (window.innerHeight / 2 - camera.y) / camera.zoom;
              addElement({
                  id: crypto.randomUUID(), type: 'image', x: startX - (width/2), y: startY - (height/2),
                  width: width, height: height, content: compressedDataUrl
              });
              setTool('select');
          }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveText = () => {
    if (editingId) {
        updateElement({ id: editingId, updates: { content: tempText } });
        setEditingId(null);
        setTempText("");
    }
  };

  useEffect(() => { if (isChatOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isChatOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingId || showNameModal || (document.activeElement?.tagName === 'INPUT') || (document.activeElement?.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') setIsSpacePressed(true);
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { deleteElement(selectedId); setSelectedId(null); }
      if (e.key === 'v') setTool('select');
      if (e.key === 'p') setTool('pencil');
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') setIsSpacePressed(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedId, deleteElement, undo, redo, editingId, showNameModal]);

  // --- HANDLERS ---

  // 1. Start Resize
  const handleResizeStart = (e: React.PointerEvent, id: string, handle: HandleType) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find(el => el.id === id);
    if (!el) return;

    setSelectedId(id);
    setIsResizing(true);
    setActiveHandle(handle);
    
    // Use Pointer Position directly from event for start reference
    const { x: pointerX, y: pointerY } = screenToWorld(e.clientX, e.clientY);
    const { x, y, width, height } = normalizeShape(el);

    setResizeStart({ x, y, width, height, startX: pointerX, startY: pointerY });
  };

  // 2. Main Pointer Down (Select/Draw)
  const handlePointerDown = (e: React.PointerEvent) => {
    history.pause();
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    if (e.button === 1 || isSpacePressed) { setIsPanning(true); return; }

    if (tool !== 'select') {
       if (tool === 'image') { fileInputRef.current?.click(); return; }
       
       const newId = crypto.randomUUID();
       let newLayer: Layer = { id: newId, type: tool, x, y, width: 0, height: 0, stroke: currentColor, fill: 'transparent' };

       if (tool === 'text') {
           addElement({ ...newLayer, width: 150, height: 40, content: "Double Click", stroke: isDarkMode?'#fff':'#000' });
           setTool('select'); return;
       }
       if (tool === 'note') {
           addElement({ ...newLayer, width: 200, height: 200, content: "Note", fill: '#facc15' });
           setTool('select'); return;
       }
       if (tool === 'pencil') {
           addElement({ ...newLayer, width: 0, height: 0, points: [[0, 0], [0, 0]] });
           setDrawingId(newId); return;
       }
       addElement(newLayer);
       setDrawingId(newId);
       return;
    }

    if (tool === 'select') {
      const clickedShape = [...elements].reverse().find(el => {
        const { x: ex, y: ey, width: ew, height: eh } = normalizeShape(el);
        return x >= ex && x <= ex + ew && y >= ey && y <= ey + eh;
      });

      if (clickedShape) {
        setSelectedId(clickedShape.id);
        setIsDragging(true);
        const { x: ex, y: ey } = normalizeShape(clickedShape);
        setDragStart({ x: x - ex, y: y - ey });
      } else {
        setSelectedId(null);
        setIsPanning(true);
      }
    }
  };

  // 3. Pointer Move (Resize Logic Here)
  const handlePointerMove = (e: React.PointerEvent) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    updateMyPresence({ cursor: { x, y } });

    if (isPanning) {
      setCamera(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
      return;
    }

    // --- RESIZE LOGIC START ---
    if (isResizing && selectedId && resizeStart && activeHandle) {
        const dx = x - resizeStart.startX; // Delta X from Start Mouse
        const dy = y - resizeStart.startY; // Delta Y from Start Mouse

        let newX = resizeStart.x;
        let newY = resizeStart.y;
        let newW = resizeStart.width;
        let newH = resizeStart.height;

        // Horizontal Logic
        if (['r', 'tr', 'br'].includes(activeHandle)) {
            newW = Math.max(10, resizeStart.width + dx);
        } else if (['l', 'tl', 'bl'].includes(activeHandle)) {
            newW = Math.max(10, resizeStart.width - dx);
            newX = resizeStart.x + dx;
            // Clamp X if width is minimum
            if (newW === 10) newX = resizeStart.x + resizeStart.width - 10;
        }

        // Vertical Logic
        if (['b', 'bl', 'br'].includes(activeHandle)) {
            newH = Math.max(10, resizeStart.height + dy);
        } else if (['t', 'tl', 'tr'].includes(activeHandle)) {
            newH = Math.max(10, resizeStart.height - dy);
            newY = resizeStart.y + dy;
            // Clamp Y if height is minimum
            if (newH === 10) newY = resizeStart.y + resizeStart.height - 10;
        }

        updateElement({ id: selectedId, updates: { x: newX, y: newY, width: newW, height: newH } });
        return;
    }
    // --- RESIZE LOGIC END ---

    if (drawingId) {
      const el = elements.find(e => e.id === drawingId);
      if (el) {
          if (el.type === 'pencil' && el.points) {
              const lastPoint = el.points[el.points.length - 1];
              const newPointX = Math.round(x - el.x);
              const newPointY = Math.round(y - el.y);
              const dist = Math.hypot(newPointX - lastPoint[0], newPointY - lastPoint[1]);
              if (dist > 5) { 
                  const newPoints = [...el.points, [newPointX, newPointY]];
                  updateElement({ id: drawingId, updates: { points: newPoints } });
              }
          } else {
              updateElement({ id: drawingId, updates: { width: x - el.x, height: y - el.y } });
          }
      }
    }

    if (tool === 'select' && isDragging && selectedId) {
      updateElement({ id: selectedId, updates: { x: x - dragStart.x, y: y - dragStart.y } });
    }
  };

  const handlePointerUp = () => {
    history.resume();
    setDrawingId(null);
    setIsDragging(false);
    setIsPanning(false);
    setIsResizing(false);
    setResizeStart(null);
    setActiveHandle(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scale = 1 - e.deltaY * 0.001;
    const newZoom = Math.max(0.1, Math.min(5, camera.zoom * scale));
    setCamera(prev => ({ ...prev, zoom: newZoom }));
  };

  const handleDoubleClick = (e: React.MouseEvent, id: string, content: string) => {
    e.stopPropagation();
    setEditingId(id);
    setTempText(content || "");
  };

  if (!isMounted) return <div className="flex items-center justify-center w-screen h-screen">Loading...</div>;

  const bgClass = isDarkMode ? 'bg-[#121212] text-white' : 'bg-[#f8f9fa] text-black';
  const toolbarClass = isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200 shadow-xl';
  const btnClass = (active: boolean) => `p-2 shrink-0 rounded transition-colors ${active ? 'bg-blue-600 text-white' : isDarkMode ? 'hover:bg-[#333] text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`;

  // Helper for rendering the 8 handles
  const renderHandles = (el: Layer, normalized: { x: number, y: number, width: number, height: number }) => {
      const { width: w, height: h } = normalized;
      const handleSize = 10;
      const offset = handleSize / 2;
      
      const handles = [
          { type: 'tl' as const, x: -offset, y: -offset, cursor: 'nwse-resize' },
          { type: 't' as const, x: w / 2 - offset, y: -offset, cursor: 'ns-resize' },
          { type: 'tr' as const, x: w - offset, y: -offset, cursor: 'nesw-resize' },
          { type: 'r' as const, x: w - offset, y: h / 2 - offset, cursor: 'ew-resize' },
          { type: 'br' as const, x: w - offset, y: h - offset, cursor: 'nwse-resize' },
          { type: 'b' as const, x: w / 2 - offset, y: h - offset, cursor: 'ns-resize' },
          { type: 'bl' as const, x: -offset, y: h - offset, cursor: 'nesw-resize' },
          { type: 'l' as const, x: -offset, y: h / 2 - offset, cursor: 'ew-resize' },
      ];

      return handles.map(h => (
          <div
              key={h.type}
              className="absolute bg-white border border-blue-500 z-50"
              style={{
                  left: h.x, top: h.y, width: handleSize, height: handleSize,
                  cursor: `cursor-${h.cursor}`, pointerEvents: 'auto'
              }}
              onPointerDown={(e) => handleResizeStart(e, el.id, h.type)}
          />
      ));
  };

  return (
    <div className={`w-screen h-screen overflow-hidden relative select-none ${bgClass} ${isSpacePressed || isPanning ? 'cursor-grab' : ''}`}>
      
      {/* MODALS */}
      {editingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
             <div className={`p-6 rounded-xl shadow-2xl border w-96 ${isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200'}`}>
                <h2 className="text-lg font-bold mb-4">Edit Content</h2>
                <textarea autoFocus rows={4} className={`w-full p-2 rounded border mb-4 resize-none ${isDarkMode ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-gray-50 border-gray-300 text-black'}`} value={tempText} onChange={e => setTempText(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) saveText(); }} />
                <div className="flex justify-end gap-2"><button onClick={() => setEditingId(null)} className="px-4 py-2 rounded text-gray-500 hover:bg-gray-100/10">Cancel</button><button onClick={saveText} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Save</button></div>
             </div>
          </div>
      )}
      {showNameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
             <div className={`p-6 rounded-xl shadow-2xl border w-80 text-center ${isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200'}`}>
                <h2 className="text-lg font-bold mb-4">Set Your Name</h2>
                <input autoFocus placeholder="Enter name..." className={`w-full p-2 rounded border mb-4 text-center ${isDarkMode ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-gray-50 border-gray-300 text-black'}`} value={username === "Guest" ? "" : username} onChange={e => setUsername(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') setShowNameModal(false); }} />
                <button onClick={() => setShowNameModal(false)} className="w-full px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 font-bold">Done</button>
             </div>
          </div>
      )}

      {/* TOOLBAR */}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 p-2 rounded-lg flex gap-2 z-50 border items-center ${toolbarClass}`}>
        <button onClick={() => setTool('select')} className={btnClass(tool === 'select')}><MousePointer2 size={20} /></button>
        <button onClick={() => setTool('pencil')} className={btnClass(tool === 'pencil')}><Pencil size={20} /></button>
        <button onClick={() => setTool('rectangle')} className={btnClass(tool === 'rectangle')}><Square size={20} /></button>
        <button onClick={() => setTool('circle')} className={btnClass(tool === 'circle')}><Circle size={20} /></button>
        <button onClick={() => setTool('text')} className={btnClass(tool === 'text')}><Type size={20} /></button>
        <button onClick={() => setTool('note')} className={btnClass(tool === 'note')}><StickyNote size={20} /></button>
        <button onClick={() => setTool('image')} className={btnClass(tool === 'image')}><ImageIcon size={20} /></button>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        <button onClick={() => setShowNameModal(true)} className={`flex items-center gap-2 px-3 py-2 rounded font-medium text-sm transition-all ${isDarkMode ? 'bg-[#333] hover:bg-[#444] text-white' : 'bg-gray-100 hover:bg-gray-200 text-black'}`}><User size={16} />{username}</button>
        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        <button onClick={undo} className={btnClass(false)}><Undo size={20} /></button>
        <button onClick={redo} className={btnClass(false)}><Redo size={20} /></button>
        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        <button onClick={() => { if(confirm('Clear board?')) clearBoard(); }} className={`p-2 shrink-0 rounded ${isDarkMode ? 'hover:bg-red-900/30' : 'hover:bg-red-100'} text-red-500`}><Trash2 size={20} /></button>
        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        <input type="color" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer shrink-0" />
        <button onClick={() => setIsDarkMode(!isDarkMode)} className={btnClass(false)}>{isDarkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-600" />}</button>
        <button onClick={() => setIsChatOpen(!isChatOpen)} className={btnClass(isChatOpen)}><MessageCircle size={20} /></button>
        <button onClick={handleExport} className={`p-2 shrink-0 rounded ${isDarkMode ? 'hover:bg-green-900/30' : 'hover:bg-green-100'} text-green-500`}><Camera size={20} /></button>
      </div>

      {/* CHAT */}
      {isChatOpen && (
        <div className={`fixed right-4 top-20 bottom-20 w-80 flex flex-col rounded-xl border shadow-2xl pointer-events-auto z-50 ${isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white'}`}>
            <div className="p-3 border-b border-gray-700 flex justify-between items-center shrink-0"><h3 className="font-bold">Live Chat</h3><button onClick={() => setIsChatOpen(false)}><X size={18}/></button></div>
            <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">{messages.map((msg, i) => (<div key={i} className="flex flex-col"><span className="text-xs font-bold opacity-75" style={{color: msg.color}}>{msg.user}</span><div className={`p-2 rounded text-sm break-words ${isDarkMode ? 'bg-[#333] text-white' : 'bg-gray-100 text-black'}`}>{msg.text}</div></div>))}<div ref={chatEndRef}/></div>
            <div className="p-3 border-t border-gray-700 shrink-0 flex gap-2"><input className={`flex-1 p-2 rounded border ${isDarkMode ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-white text-black'}`} placeholder="Type..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (sendMessage({ text: chatInput, user: username }), setChatInput(''))} /><button onClick={() => (sendMessage({ text: chatInput, user: username }), setChatInput(''))} className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"><Send size={16}/></button></div>
        </div>
      )}

      {/* CANVAS */}
      <div 
        className={`w-full h-full block touch-none ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { updateMyPresence({ cursor: null }); setIsDragging(false); }}
        onWheel={handleWheel}
      >
        <div id="canvas-content" className="w-full h-full origin-top-left pointer-events-none" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
           <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(${isDarkMode ? '#888' : '#ccc'} 1px, transparent 1px)`, backgroundSize: '20px 20px' }} />
           
           {uniqueElements.map((el) => {
             const uniqueKey = el.id; 
             const isSelected = selectedId === el.id;
             // Normalize for consistent rendering (Fixes jumpy handles)
             const normalized = normalizeShape(el);
             const { x, y, width, height } = normalized;
             
             const pointerStyle = { pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: tool === 'select' ? 'move' : 'default', zIndex: isSelected ? 50 : 1 } as const;
             const baseStyle = { position: 'absolute' as const, left: x, top: y, ...pointerStyle };

             // --- SELECTION UI ---
             const selectionBorderRadius = el.type === 'circle' ? '50%' : '0%';
             const SelectionBox = isSelected && tool === 'select' ? (
                 <div className="absolute -inset-1 border-2 border-blue-500 border-dashed pointer-events-none"
                      style={{ borderRadius: selectionBorderRadius }} />
             ) : null;

             const Handles = isSelected && tool === 'select' ? renderHandles(el, normalized) : null;

             if (el.type === 'pencil' && el.points) {
                 const pathData = el.points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
                 return (
                     <div key={uniqueKey} style={baseStyle}>
                         <svg style={{ overflow: 'visible' }}><path d={pathData} stroke={el.stroke} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                         {isSelected && <div className="absolute inset-0 border-2 border-blue-500 border-dashed opacity-50 pointer-events-none" />}
                     </div>
                 );
             }

             if (el.type === 'image') return ( <div key={uniqueKey} onDoubleClick={(e) => e.stopPropagation()} style={{ ...baseStyle, width, height }}><img src={el.content} className={`w-full h-full object-contain`} draggable={false} />{SelectionBox}{Handles}</div> );
             if (el.type === 'note') return ( <div key={uniqueKey} onDoubleClick={(e) => handleDoubleClick(e, el.id, el.content || "")} style={{ ...baseStyle, width, height, backgroundColor: el.fill, color: '#000', boxShadow: '4px 4px 10px rgba(0,0,0,0.2)', padding: '10px', fontSize: '18px', fontFamily: 'Comic Sans MS', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden' }}>{el.content}{SelectionBox}{Handles}</div> );
             if (el.type === 'text') return ( <div key={uniqueKey} onDoubleClick={(e) => handleDoubleClick(e, el.id, el.content || "")} style={{ ...baseStyle, border: 'none', fontSize: '24px', fontFamily: 'sans-serif', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'pre-wrap', color: el.stroke }}>{el.content}{SelectionBox}{Handles}</div> );

             return ( <div key={uniqueKey} onDoubleClick={(e) => e.stopPropagation()} className={`absolute bg-transparent`} style={{ ...baseStyle, width, height, borderWidth: '2px', borderStyle: 'solid', borderColor: el.stroke, borderRadius: el.type === 'circle' ? '50%' : '0%' }}>{SelectionBox}{Handles} </div> );
           })}

           <div className="cursor-overlay">
               {others.map(({ connectionId, presence }) => presence?.cursor && <Cursor key={connectionId} x={presence.cursor.x} y={presence.cursor.y} connectionId={connectionId} /> )}
           </div>
        </div>
      </div>
    </div>
  );
}