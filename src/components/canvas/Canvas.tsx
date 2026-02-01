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
  timestamp: number;
}

export default function Canvas() {
  // --- HYDRATION SAFETY ---
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // --- LIVEBLOCKS STATE ---
  const storageElements = useStorage((root) => root.elements);
  const elements = (storageElements || []) as Layer[];
  
  const storageMessages = useStorage((root) => root.messages);
  const messages = (storageMessages || []) as Message[];

  const others = useOthers();
  const [myPresence, updateMyPresence] = useMyPresence();
  
  const undo = useUndo();
  const redo = useRedo();
  const history = useHistory();

  // --- MUTATIONS ---
  const addElement = useMutation(({ storage }, newShape: Layer) => {
    const existingElements = storage.get("elements");
    if (!existingElements) return;
    existingElements.push(newShape);
  }, []);

  const updateElement = useMutation(({ storage }, { id, updates }: { id: string; updates: Partial<Layer> }) => {
    const liveElements = storage.get("elements");
    if (!liveElements) return;
    
    const index = liveElements.findIndex((el) => el.id === id);
    if (index !== -1) {
      liveElements.set(index, { ...liveElements.get(index), ...updates });
    }
  }, []);

  const deleteElement = useMutation(({ storage }, id: string) => {
    const liveElements = storage.get("elements");
    if (!liveElements) return;
    
    const index = liveElements.findIndex((el) => el.id === id);
    if (index !== -1) liveElements.delete(index);
  }, []);
  
  const clearBoard = useMutation(({ storage }) => {
    const liveElements = storage.get("elements");
    if (!liveElements) return;
    while (liveElements.length > 0) liveElements.delete(0);
  }, []);

  const sendMessage = useMutation(({ storage }, { text, user }: { text: string, user: string }) => {
    if (!text.trim()) return;
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];
    const colorIndex = user.length % colors.length;
    const userColor = colors[colorIndex];
    
    const liveMessages = storage.get("messages");
    if (liveMessages) {
        liveMessages.push({ 
            user: user, 
            text: text,
            color: userColor,
        });
    }
  }, []);

  // --- LOCAL STATE ---
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<LayerType | 'select'>('select');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentColor, setCurrentColor] = useState('#3b82f6');
  
  // Interaction
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // Coordinates
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); 
  const [resizeStart, setResizeStart] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [drawingId, setDrawingId] = useState<string | null>(null);

  // User & Chat
  const [username, setUsername] = useState("Guest");
  const [showNameModal, setShowNameModal] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempText, setTempText] = useState("");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- HELPERS ---
  const screenToWorld = (clientX: number, clientY: number) => {
    return {
      x: (clientX - camera.x) / camera.zoom,
      y: (clientY - camera.y) / camera.zoom
    };
  };

  const handleExport = useCallback(() => {
    const node = document.getElementById('canvas-content');
    if (!node) return;
    const filter = (node: HTMLElement) => !node.classList?.contains('cursor-overlay');
    const bgColor = isDarkMode ? '#121212' : '#f8f9fa';

    toPng(node, { filter, backgroundColor: bgColor })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = 'whitespace-export.png';
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => console.error(err));
  }, [isDarkMode]);

  // --- IMAGE COMPRESSION & UPLOAD (ULTRA-AGGRESSIVE) ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        const img = new Image();
        img.onload = () => {
            const maxSize = 300;
            let width = img.width;
            let height = img.height;
            
            if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
            }

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
                    id: crypto.randomUUID(),
                    type: 'image',
                    x: startX - (width/2),
                    y: startY - (height/2),
                    width: width,
                    height: height,
                    content: compressedDataUrl
                });
                setTool('select');
            }
        };
        img.src = result;
      }
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

  // --- SCROLL CHAT ---
  useEffect(() => {
    if (isChatOpen) {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isChatOpen]);

  // --- KEYBOARD LISTENERS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingId || showNameModal || (document.activeElement?.tagName === 'INPUT') || (document.activeElement?.tagName === 'TEXTAREA')) return;

      if (e.key === ' ') setIsSpacePressed(true);
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteElement(selectedId);
        setSelectedId(null);
      }

      if (e.key === 'v') setTool('select');
      if (e.key === 'p') setTool('pencil');
      if (e.key === 'r') setTool('rectangle');
      if (e.key === 'c') setTool('circle');
      if (e.key === 't') setTool('text');
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
  }, [selectedId, deleteElement, undo, redo, editingId, showNameModal]);

  // --- POINTER EVENTS ---
  const handlePointerDown = (e: React.PointerEvent) => {
    history.pause();
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    // 0. Pan / Middle Click
    if (e.button === 1 || isSpacePressed) {
      setIsPanning(true);
      return;
    }

    // 1. Drawing Logic
    if (tool === 'pencil') {
        const newId = crypto.randomUUID();
        addElement({ 
            id: newId, 
            type: 'pencil', 
            x, y, 
            width: 0, height: 0, 
            points: [[0, 0], [0, 0]], 
            stroke: currentColor, 
            fill: 'transparent' 
        });
        setDrawingId(newId);
        return;
    }

    if (tool === 'rectangle' || tool === 'circle') {
      const newId = crypto.randomUUID();
      addElement({ 
          id: newId, 
          type: tool, 
          x, y, 
          width: 0, height: 0, 
          stroke: currentColor, 
          fill: 'transparent' 
      });
      setDrawingId(newId);
      return;
    }
    
    // 2. Click-to-Add Tools
    if (tool === 'text') {
        addElement({ id: crypto.randomUUID(), type: 'text', x, y, width: 150, height: 40, content: "Double Click to Edit", stroke: isDarkMode ? '#fff' : '#000' });
        setTool('select');
        return;
    }
    if (tool === 'note') {
        addElement({ id: crypto.randomUUID(), type: 'note', x, y, width: 200, height: 200, content: "New Note", fill: '#facc15' });
        setTool('select');
        return;
    }
    if (tool === 'image') {
        fileInputRef.current?.click();
        return;
    }

    // 3. Selection / Resize Logic
    if (tool === 'select') {
      if (selectedId) {
         const el = elements.find(e => e.id === selectedId);
         if (el) {
             const cornerX = el.x + el.width;
             const cornerY = el.y + el.height;
             const dist = Math.hypot(x - cornerX, y - cornerY);
             if (dist < 20 / camera.zoom) {
                 setResizeStart({ x, y, w: el.width, h: el.height });
                 setIsResizing(true);
                 return;
             }
         }
      }

      // Hit Test
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
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    updateMyPresence({ cursor: { x, y } });

    if (isPanning) {
      setCamera(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
      return;
    }

    if (isResizing && selectedId && resizeStart) {
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

    if (drawingId) {
      const el = elements.find(e => e.id === drawingId);
      if (el) {
          if (el.type === 'pencil' && el.points) {
              const lastPoint = el.points[el.points.length - 1];
              // OPTIMIZATION: Integer Rounding
              const newPointX = Math.round(x - el.x);
              const newPointY = Math.round(y - el.y);
              const dist = Math.hypot(newPointX - lastPoint[0], newPointY - lastPoint[1]);
              
              // OPTIMIZATION: Increase Threshold to 5
              if (dist > 5) { 
                  const newPoints = [...el.points, [newPointX, newPointY]];
                  updateElement({ 
                      id: drawingId, 
                      updates: { points: newPoints } 
                  });
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

  // --- RENDER HELPERS ---
  const bgClass = isDarkMode ? 'bg-[#121212] text-white' : 'bg-[#f8f9fa] text-black';
  const toolbarClass = isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200 shadow-xl';
  const buttonClass = (isActive: boolean) => 
     `p-2 shrink-0 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : isDarkMode ? 'hover:bg-[#333] text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`;

  // --- MAIN RENDER ---
  if (!isMounted) return <div className="flex items-center justify-center w-screen h-screen">Loading...</div>;

  return (
    <div className={`w-screen h-screen overflow-hidden relative select-none ${bgClass} ${isSpacePressed || isPanning ? 'cursor-grab' : ''}`}>
      
      {/* 1. EDIT MODAL */}
      {editingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
             <div className={`p-6 rounded-xl shadow-2xl border w-96 ${isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200'}`}>
                <h2 className="text-lg font-bold mb-4">Edit Content</h2>
                <textarea 
                    autoFocus
                    rows={4}
                    className={`w-full p-2 rounded border mb-4 resize-none ${isDarkMode ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-gray-50 border-gray-300 text-black'}`}
                    value={tempText}
                    onChange={(e) => setTempText(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) saveText(); }}
                />
                <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded text-gray-500 hover:bg-gray-100/10">Cancel</button>
                    <button onClick={saveText} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Save</button>
                </div>
             </div>
          </div>
      )}

      {/* 2. NAME MODAL */}
      {showNameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
             <div className={`p-6 rounded-xl shadow-2xl border w-80 text-center ${isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200'}`}>
                <h2 className="text-lg font-bold mb-4">Set Your Name</h2>
                <input 
                    autoFocus
                    placeholder="Enter name..."
                    className={`w-full p-2 rounded border mb-4 text-center ${isDarkMode ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-gray-50 border-gray-300 text-black'}`}
                    value={username === "Guest" ? "" : username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') setShowNameModal(false); }}
                />
                <button onClick={() => setShowNameModal(false)} className="w-full px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 font-bold">Done</button>
             </div>
          </div>
      )}

      {/* 3. TOOLBAR */}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 p-2 rounded-lg flex gap-2 z-50 border items-center ${toolbarClass}`}>
        <button onClick={() => setTool('select')} className={buttonClass(tool === 'select')} title="Select (V)"><MousePointer2 size={20} /></button>
        <button onClick={() => setTool('pencil')} className={buttonClass(tool === 'pencil')} title="Pencil (P)"><Pencil size={20} /></button>
        <button onClick={() => setTool('rectangle')} className={buttonClass(tool === 'rectangle')} title="Rectangle (R)"><Square size={20} /></button>
        <button onClick={() => setTool('circle')} className={buttonClass(tool === 'circle')} title="Circle (C)"><Circle size={20} /></button>
        <button onClick={() => setTool('text')} className={buttonClass(tool === 'text')} title="Text (T)"><Type size={20} /></button>
        <button onClick={() => setTool('note')} className={buttonClass(tool === 'note')} title="Sticky Note (N)"><StickyNote size={20} /></button>
        <button onClick={() => setTool('image')} className={buttonClass(tool === 'image')} title="Upload Image"><ImageIcon size={20} /></button>
        
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageUpload} 
        />

        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        
        <button 
            onClick={() => setShowNameModal(true)} 
            className={`flex items-center gap-2 px-3 py-2 rounded font-medium text-sm transition-all ${isDarkMode ? 'bg-[#333] hover:bg-[#444] text-white' : 'bg-gray-100 hover:bg-gray-200 text-black'}`}
        >
            <User size={16} />
            {username}
        </button>

        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        
        <button onClick={undo} className={buttonClass(false)} title="Undo"><Undo size={20} /></button>
        <button onClick={redo} className={buttonClass(false)} title="Redo"><Redo size={20} /></button>
        <button onClick={() => { if(confirm('Clear board?')) clearBoard(); }} className={`p-2 shrink-0 rounded ${isDarkMode ? 'hover:bg-red-900/30' : 'hover:bg-red-100'} text-red-500`}><Trash2 size={20} /></button>

        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />

        <input type="color" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer shrink-0" />
        
        <button onClick={() => setIsDarkMode(!isDarkMode)} className={buttonClass(false)}>
            {isDarkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-600" />}
        </button>

        <button onClick={() => setIsChatOpen(!isChatOpen)} className={buttonClass(isChatOpen)} title="Chat"><MessageCircle size={20} /></button>

        <button onClick={handleExport} className={`p-2 shrink-0 rounded ${isDarkMode ? 'hover:bg-green-900/30' : 'hover:bg-green-100'} text-green-500`}><Camera size={20} /></button>
      </div>

      {/* 4. CHAT SIDEBAR */}
      {isChatOpen && (
        <div className={`fixed right-4 top-20 bottom-20 w-80 flex flex-col rounded-xl border shadow-2xl pointer-events-auto z-50 ${isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white'}`}>
            <div className="p-3 border-b border-gray-700 flex justify-between items-center shrink-0">
                <h3 className="font-bold">Live Chat</h3>
                <button onClick={() => setIsChatOpen(false)}><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
                {messages.map((msg, i) => (
                    <div key={i} className="flex flex-col">
                        <span className="text-xs font-bold opacity-75" style={{color: msg.color}}>{msg.user}</span>
                        <div className={`p-2 rounded text-sm break-words ${isDarkMode ? 'bg-[#333] text-white' : 'bg-gray-100 text-black'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef}/>
            </div>
            <div className="p-3 border-t border-gray-700 shrink-0 flex gap-2">
                <input 
                    className={`flex-1 p-2 rounded border ${isDarkMode ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-white text-black'}`}
                    placeholder="Type..."
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && (sendMessage({ text: chatInput, user: username }), setChatInput(''))} 
                />
                <button onClick={() => (sendMessage({ text: chatInput, user: username }), setChatInput(''))} className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Send size={16}/>
                </button>
            </div>
        </div>
      )}

      {/* 5. MAIN CANVAS WRAPPER (Unified Container) */}
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
           
           {/* RENDER ELEMENTS */}
           {elements.map((el, index) => {
             const uniqueKey = `${el.id}-${index}`; 
             const isSelected = selectedId === el.id;
             // Dynamic CSS for Shapes: Ghosts when drawing, Solid when selecting
             const pointerStyle = { 
                pointerEvents: tool === 'select' ? 'auto' : 'none',
                cursor: tool === 'select' ? 'move' : 'default' 
             } as const;

             const baseStyle = {
               position: 'absolute' as const,
               left: el.x,
               top: el.y,
               ...pointerStyle
             };

             // Resize Handle (Only visible in Select Mode & Selected)
             const resizeHandle = isSelected && tool === 'select' ? (
                 <div className="absolute bottom-0 right-0 w-6 h-6 bg-blue-500 border-2 border-white z-50 shadow-xl rounded-full cursor-nwse-resize"
                    style={{ transform: 'translate(50%, 50%)', pointerEvents: 'auto' }}
                 />
             ) : null;

             if (el.type === 'pencil' && el.points) {
                 const pathData = el.points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
                 return (
                     <div key={uniqueKey} style={baseStyle}>
                         <svg style={{ overflow: 'visible' }}>
                             <path d={pathData} stroke={el.stroke} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                         </svg>
                         {/* Optional: Add selection box for pencil if needed */}
                         {isSelected && <div className="absolute inset-0 border-2 border-blue-500 opacity-50 pointer-events-none" />}
                     </div>
                 );
             }

             if (el.type === 'image') {
                return (
                    <div key={uniqueKey} onDoubleClick={(e) => e.stopPropagation()} 
                         style={{ 
                             ...baseStyle, 
                             width: el.width, 
                             height: el.height 
                         }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={el.content} alt="upload" className={`w-full h-full object-contain ${isSelected ? 'ring-2 ring-blue-500' : ''}`} draggable={false} />
                        {resizeHandle}
                    </div>
                );
             }

             if (el.type === 'note') {
                return (
                    <div key={uniqueKey} onDoubleClick={(e) => handleDoubleClick(e, el.id, el.content || "")} 
                        style={{ 
                            ...baseStyle, 
                            width: el.width, 
                            height: el.height,
                            backgroundColor: el.fill, 
                            color: '#000', 
                            boxShadow: '4px 4px 10px rgba(0,0,0,0.2)', 
                            padding: '10px', 
                            fontSize: '18px', 
                            fontFamily: 'Comic Sans MS, sans-serif', 
                            border: isSelected ? '2px solid #3b82f6' : 'none', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            textAlign: 'center', 
                            overflow: 'hidden' 
                        }}>
                        {el.content} 
                        {resizeHandle} 
                    </div>
                );
             }

             if (el.type === 'text') {
                return ( 
                    <div key={uniqueKey} onDoubleClick={(e) => handleDoubleClick(e, el.id, el.content || "")} 
                         style={{ 
                             ...baseStyle, 
                             border: isSelected ? '1px solid #3b82f6' : 'none', 
                             fontSize: '24px', 
                             fontFamily: 'sans-serif', 
                             padding: '4px', 
                             display: 'flex', 
                             alignItems: 'center', 
                             justifyContent: 'center', 
                             whiteSpace: 'pre-wrap',
                             color: el.stroke
                         }}>
                        {el.content} 
                        {resizeHandle}
                    </div> 
                );
             }

             // Rectangle / Circle
             return ( 
                 <div key={uniqueKey} onDoubleClick={(e) => e.stopPropagation()} 
                      className={`absolute bg-transparent ${isSelected ? 'ring-2 ring-blue-500 shadow-xl' : ''}`} 
                      style={{ 
                          ...baseStyle, 
                          width: el.width, 
                          height: el.height,
                          left: Math.min(el.x, el.x + el.width), // Override baseStyle left for shapes that might have negative width
                          top: Math.min(el.y, el.y + el.height), // Override baseStyle top
                          width: Math.abs(el.width),
                          height: Math.abs(el.height),
                          borderWidth: '2px', 
                          borderStyle: 'solid', 
                          borderColor: el.stroke,
                          borderRadius: el.type === 'circle' ? '50%' : '0%' 
                      }}>
                    {resizeHandle} 
                 </div> 
             );
           })}

           {/* CURSORS */}
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
