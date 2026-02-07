"use client";

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { 
  Square, Circle, Type, MousePointer2, Trash2, Undo, Redo, Camera, 
  StickyNote, Image as ImageIcon, Sun, Moon, MessageCircle, X, Send, 
  User, Pencil
} from 'lucide-react';
import { useStorage, useMutation, useUndo, useRedo, useOthers, useMyPresence, useHistory, useSelf } from "@/liveblocks.config";
import { LiveList } from "@liveblocks/client"; 
import { toPng } from 'html-to-image';
import { UserButton } from "@clerk/nextjs";

// ============================================================================
// CONSTANTS
// ============================================================================
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB total storage limit
const MAX_IMAGE_SIZE = 150 * 1024; // 150KB per image
const MAX_PENCIL_POINTS = 300; // Maximum points per pencil stroke
const MAX_ELEMENTS = 1000; // Maximum elements on board
const MIN_POINT_DISTANCE = 8; // Minimum distance between pencil points
const PATH_SIMPLIFY_EPSILON = 4; // Douglas-Peucker simplification threshold

// ============================================================================
// TYPES
// ============================================================================
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize shape coordinates to handle negative width/height
 */
function normalizeShape(el: Layer) {
  const x = el.width < 0 ? el.x + el.width : el.x;
  const y = el.height < 0 ? el.y + el.height : el.y;
  const width = Math.abs(el.width);
  const height = Math.abs(el.height);
  return { x, y, width, height };
}

/**
 * Estimate storage size for elements array
 */
function estimateStorageSize(elements: Layer[]): number {
  try {
    const jsonStr = JSON.stringify(elements);
    return new Blob([jsonStr]).size;
  } catch {
    return 0;
  }
}

/**
 * Simplify pencil path using Douglas-Peucker algorithm
 */
function simplifyPath(points: number[][]): number[][] {
  if (points.length <= 10) return points;
  
  const result: number[][] = [points[0]];
  let lastPoint = points[0];
  
  for (let i = 1; i < points.length; i++) {
    const dist = Math.hypot(
      points[i][0] - lastPoint[0],
      points[i][1] - lastPoint[1]
    );
    
    if (dist > PATH_SIMPLIFY_EPSILON || i === points.length - 1) {
      result.push(points[i]);
      lastPoint = points[i];
    }
  }
  
  return result;
}

// ============================================================================
// CURSOR COMPONENT
// ============================================================================
const Cursor = memo(({ connectionId, x, y, name, picture }: { 
  connectionId: number;
  x: number;
  y: number;
  name?: string;
  picture?: string;
}) => {
  const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];
  const color = colors[connectionId % colors.length];

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 transition-transform duration-100 ease-linear z-50"
      style={{ transform: `translateX(${x}px) translateY(${y}px)` }}
    >
      <MousePointer2 className="h-5 w-5" style={{ fill: color, color: color }} />
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full pl-1 pr-3 py-1 shadow-md" style={{ backgroundColor: color }}>
        {picture && (
          <div className="rounded-full overflow-hidden bg-white shrink-0" style={{ width: '20px', height: '20px' }}>
            <img src={picture} alt={name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="text-xs text-white font-semibold whitespace-nowrap">{name || "Guest"}</div>
      </div>
    </div>
  );
});
Cursor.displayName = "Cursor";

// ============================================================================
// MAIN CANVAS COMPONENT
// ============================================================================
export default function Canvas() {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => { 
    setIsMounted(true); 
  }, []);

  // ==========================================================================
  // LIVEBLOCKS STATE
  // ==========================================================================
  const root = useStorage((root) => root);
  const storageElements = useStorage((root) => root.elements);
  const elements = (storageElements || []) as Layer[];
  
  // Remove duplicate elements (safety check)
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
  const currentUser = useSelf();
  const [myPresence, updateMyPresence] = useMyPresence();
  
  const historyUndo = useUndo();
  const historyRedo = useRedo();
  const history = useHistory();

  // ==========================================================================
  // LOCAL STATE
  // ==========================================================================
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<LayerType | 'select'>('select');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentColor, setCurrentColor] = useState('#3b82f6');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  
  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
  const [resizeStart, setResizeStart] = useState<{ 
    x: number;
    y: number;
    width: number;
    height: number;
    startX: number;
    startY: number;
  } | null>(null);
  
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); 
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const clickPosition = useRef<{ x: number; y: number } | null>(null);
  
  // UI state
  const [username, setUsername] = useState("Guest");
  const [showNameModal, setShowNameModal] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempText, setTempText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set username from Clerk
  useEffect(() => {
    if (currentUser?.info?.name) {
      setUsername(currentUser.info.name);
    }
  }, [currentUser]);

  // ==========================================================================
  // SAFE UNDO/REDO WRAPPERS
  // ==========================================================================
  const undo = useCallback(() => {
    try { 
      historyUndo(); 
    } catch (error) { 
      console.error("Undo failed:", error); 
    }
  }, [historyUndo]);

  const redo = useCallback(() => {
    try { 
      historyRedo(); 
    } catch (error) { 
      console.error("Redo failed:", error); 
    }
  }, [historyRedo]);

  // ==========================================================================
  // COORDINATE TRANSFORMATION
  // ==========================================================================
  const screenToWorld = (clientX: number, clientY: number) => {
    return {
      x: (clientX - camera.x) / camera.zoom,
      y: (clientY - camera.y) / camera.zoom
    };
  };

  // ==========================================================================
  // HELPER: FIND ELEMENT INDEX IN LIVEBLOCKS LIST
  // ==========================================================================
  const findIndexById = (liveList: any, targetId: string) => {
    if (!liveList) return -1;
    for (let i = 0; i < liveList.length; i++) {
      const item = liveList.get(i);
      const itemId = item?.get ? item.get("id") : item?.id;
      if (itemId === targetId) return i;
    }
    return -1;
  };

  // ==========================================================================
  // MUTATIONS (WITH ERROR HANDLING & VALIDATION)
  // ==========================================================================
  
  /**
   * Add element with storage validation
   */
  const addElement = useMutation(({ storage }, newShape: Layer) => {
    try {
      const existingElements = storage.get("elements");
      if (!existingElements) {
        console.error("Elements storage not initialized");
        return false;
      }
      
      // Check element limit
      if (existingElements.length >= MAX_ELEMENTS) {
        alert('Board is full! Please delete some elements to continue.');
        return false;
      }
      
      // Check storage size
      const currentElements = existingElements.toArray ? existingElements.toArray() : [];
      const currentSize = estimateStorageSize(currentElements);
      const newSize = estimateStorageSize([newShape]);
      
      if (currentSize + newSize > MAX_STORAGE_SIZE) {
        alert('Board storage is full! Please clear some space to continue.');
        return false;
      }
      
      existingElements.push(newShape);
      return true;
    } catch (error) {
      console.error('Failed to add element:', error);
      alert('Failed to add element. Please try again.');
      return false;
    }
  }, []);

  /**
   * Update element safely
   */
  const updateElement = useMutation(({ storage }, { id, updates }: { id: string; updates: Partial<Layer> }) => {
    try {
      const liveElements = storage.get("elements");
      if (!liveElements) return false;
      
      const index = findIndexById(liveElements, id);
      if (index !== -1) {
        const current = liveElements.get(index);
        const currentObj = current?.toObject ? current.toObject() : current;
        liveElements.set(index, { ...currentObj, ...updates });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to update element:', error);
      return false;
    }
  }, []);

  /**
   * Delete element safely
   */
  const deleteElement = useMutation(({ storage }, id: string) => {
    try {
      const liveElements = storage.get("elements");
      if (liveElements) {
        const index = findIndexById(liveElements, id);
        if (index !== -1) {
          liveElements.delete(index);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to delete element:', error);
      return false;
    }
  }, []);
  
  /**
   * Clear entire board
   */
  const clearBoard = useMutation(({ storage }) => {
    try {
      const liveElements = storage.get("elements");
      if (liveElements) {
        while (liveElements.length > 0) {
          liveElements.delete(0);
        }
      }
    } catch (error) {
      console.error('Failed to clear board:', error);
    }
  }, []);

  /**
   * Clear chat messages
   */
  const clearChat = useMutation(({ storage }) => {
    try {
      const liveMessages = storage.get("messages");
      if (liveMessages) {
        while (liveMessages.length > 0) {
          liveMessages.delete(0);
        }
      }
    } catch (error) {
      console.error('Failed to clear chat:', error);
    }
  }, []);

  /**
   * Send chat message
   */
  const sendMessage = useMutation(({ storage }, { text, user }: { text: string; user: string }) => {
    try {
      if (!text.trim()) return;
      
      const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];
      const userColor = colors[user.length % colors.length];
      
      let liveMessages = storage.get("messages");
      // @ts-ignore 
      if (!liveMessages) {
        // @ts-ignore
        storage.set("messages", new LiveList([]));
        liveMessages = storage.get("messages");
      }
      
      if (liveMessages) {
        liveMessages.push({ user, text, color: userColor });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, []);

  // ==========================================================================
  // IMAGE UPLOAD HANDLER (WITH COMPRESSION & VALIDATION)
  // ==========================================================================
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size before processing
    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large. Please use an image smaller than 5MB.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      
      img.onload = () => {
        const MAX_DIMENSION = 350;
        let width = img.width;
        let height = img.height;
        
        // Scale down if too large
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = (height * MAX_DIMENSION) / width;
            width = MAX_DIMENSION;
          } else {
            width = (width * MAX_DIMENSION) / height;
            height = MAX_DIMENSION;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          
          // Progressive quality reduction to stay under size limit
          let quality = 0.6;
          let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          
          while (compressedDataUrl.length > MAX_IMAGE_SIZE && quality > 0.1) {
            quality -= 0.1;
            compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          
          // Final size check
          if (compressedDataUrl.length > MAX_IMAGE_SIZE * 2) {
            alert('Image is too complex to compress. Please try a simpler image.');
            return;
          }
          
          const startX = clickPosition.current 
            ? clickPosition.current.x 
            : (window.innerWidth / 2 - camera.x) / camera.zoom;
          const startY = clickPosition.current 
            ? clickPosition.current.y 
            : (window.innerHeight / 2 - camera.y) / camera.zoom;

          const success = addElement({
            id: crypto.randomUUID(), 
            type: 'image', 
            x: startX - (width / 2), 
            y: startY - (height / 2),
            width: width, 
            height: height, 
            content: compressedDataUrl
          });
          
          if (success) {
            setTool('select');
          }
        }
      };
      
      img.onerror = () => {
        alert('Failed to load image. Please try a different file.');
      };
      
      img.src = event.target?.result as string;
    };
    
    reader.onerror = () => {
      alert('Failed to read file. Please try again.');
    };
    
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ==========================================================================
  // EXPORT CANVAS AS IMAGE
  // ==========================================================================
  const handleExport = useCallback(() => {
    const node = document.getElementById('canvas-content');
    if (node) {
      const filter = (node: HTMLElement) => !node.classList?.contains('cursor-overlay');
      toPng(node, { 
        filter, 
        backgroundColor: isDarkMode ? '#121212' : '#f8f9fa' 
      })
        .then((dataUrl) => {
          const link = document.createElement('a');
          link.download = 'whitespace-export.png';
          link.href = dataUrl;
          link.click();
        })
        .catch(error => {
          console.error('Export failed:', error);
          alert('Failed to export. Try clearing some elements and try again.');
        });
    }
  }, [isDarkMode]);

  // ==========================================================================
  // TEXT EDITING
  // ==========================================================================
  const saveText = () => {
    if (editingId) {
      updateElement({ id: editingId, updates: { content: tempText } });
      setEditingId(null);
      setTempText("");
    }
  };

  // ==========================================================================
  // CHAT AUTO-SCROLL
  // ==========================================================================
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, isChatOpen]);

  // ==========================================================================
  // KEYBOARD SHORTCUTS
  // ==========================================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when editing text
      if (editingId || showNameModal || 
          (document.activeElement?.tagName === 'INPUT') || 
          (document.activeElement?.tagName === 'TEXTAREA')) {
        return;
      }
      
      if (e.key === ' ') setIsSpacePressed(true);
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { 
        deleteElement(selectedId); 
        setSelectedId(null); 
      }
      if (e.key === 'v') setTool('select');
      if (e.key === 'p') setTool('pencil');
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

  // ==========================================================================
  // POINTER EVENT HANDLERS
  // ==========================================================================
  
  /**
   * Handle resize handle grab
   */
  const handleResizeStart = (e: React.PointerEvent, id: string, handle: HandleType) => {
    e.stopPropagation();
    e.preventDefault();
    
    const el = elements.find(el => el.id === id);
    if (!el) return;

    history.pause(); 

    setSelectedId(id);
    setIsResizing(true);
    setActiveHandle(handle);
    
    const { x: pointerX, y: pointerY } = screenToWorld(e.clientX, e.clientY);
    const { x, y, width, height } = normalizeShape(el);

    setResizeStart({ 
      x, 
      y, 
      width, 
      height, 
      startX: pointerX, 
      startY: pointerY 
    });
  };

  /**
   * Handle pointer down - start drawing or selecting
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY);

    // Middle mouse or space+click = pan
    if (e.button === 1 || isSpacePressed) { 
      setIsPanning(true); 
      return; 
    }

    // Drawing mode
    if (tool !== 'select') {
      if (tool === 'image') { 
        clickPosition.current = { x, y };
        fileInputRef.current?.click(); 
        return; 
      }
      
      const newId = crypto.randomUUID();
      let newLayer: Layer = { 
        id: newId, 
        type: tool, 
        x, 
        y, 
        width: 0, 
        height: 0, 
        stroke: currentColor, 
        fill: 'transparent' 
      };

      if (tool === 'text') {
        addElement({ 
          ...newLayer, 
          width: 150, 
          height: 40, 
          content: "Double Click", 
          stroke: isDarkMode ? '#fff' : '#000' 
        });
        setTool('select'); 
        return;
      }
      
      if (tool === 'note') {
        addElement({ 
          ...newLayer, 
          width: 200, 
          height: 200, 
          content: "double click to edit note", 
          fill: '#facc15' 
        });
        setTool('select'); 
        return;
      }
      
      if (tool === 'pencil') {
        history.pause();
        addElement({ 
          ...newLayer, 
          width: 0, 
          height: 0, 
          points: [[0, 0]] 
        });
        setDrawingId(newId); 
        return;
      }
      
      // Rectangle or circle
      history.pause();
      addElement(newLayer);
      setDrawingId(newId);
      return;
    }

    // Selection mode
    if (tool === 'select') {
      const clickedShape = [...elements].reverse().find(el => {
        const { x: ex, y: ey, width: ew, height: eh } = normalizeShape(el);
        return x >= ex && x <= ex + ew && y >= ey && y <= ey + eh;
      });

      if (clickedShape) {
        history.pause();
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

  /**
   * Handle pointer move - update drawing/dragging/resizing
   */
  const handlePointerMove = (e: React.PointerEvent) => {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    
    // Update cursor position for other users
    updateMyPresence({ cursor: { x, y } });

    // Pan mode
    if (isPanning) {
      setCamera(prev => ({ 
        ...prev, 
        x: prev.x + e.movementX, 
        y: prev.y + e.movementY 
      }));
      return;
    }

    // Resize mode
    if (isResizing && selectedId && resizeStart && activeHandle) {
      const dx = x - resizeStart.startX;
      const dy = y - resizeStart.startY;

      let newX = resizeStart.x;
      let newY = resizeStart.y;
      let newW = resizeStart.width;
      let newH = resizeStart.height;

      // Handle horizontal resize
      if (['r', 'tr', 'br'].includes(activeHandle)) {
        newW = Math.max(10, resizeStart.width + dx);
      } else if (['l', 'tl', 'bl'].includes(activeHandle)) {
        newW = Math.max(10, resizeStart.width - dx);
        newX = resizeStart.x + dx;
        if (newW === 10) newX = resizeStart.x + resizeStart.width - 10;
      }

      // Handle vertical resize
      if (['b', 'bl', 'br'].includes(activeHandle)) {
        newH = Math.max(10, resizeStart.height + dy);
      } else if (['t', 'tl', 'tr'].includes(activeHandle)) {
        newH = Math.max(10, resizeStart.height - dy);
        newY = resizeStart.y + dy;
        if (newH === 10) newY = resizeStart.y + resizeStart.height - 10;
      }

      updateElement({ 
        id: selectedId, 
        updates: { x: newX, y: newY, width: newW, height: newH } 
      });
      return;
    }

    // Drawing mode
    if (drawingId) {
      const el = elements.find(e => e.id === drawingId);
      if (el) {
        if (el.type === 'pencil' && el.points) {
          const lastPoint = el.points[el.points.length - 1];
          const newPointX = Math.round(x - el.x);
          const newPointY = Math.round(y - el.y);
          const dist = Math.hypot(newPointX - lastPoint[0], newPointY - lastPoint[1]);
          
          // Only add point if moved enough distance
          if (dist > MIN_POINT_DISTANCE) { 
            const newPoints = [...el.points, [newPointX, newPointY]];
            
            // Limit total points to prevent memory issues
            const finalPoints = newPoints.length > MAX_PENCIL_POINTS 
              ? newPoints.slice(-MAX_PENCIL_POINTS)
              : newPoints;
            
            updateElement({ 
              id: drawingId, 
              updates: { points: finalPoints } 
            });
          }
        } else {
          // Rectangle or circle
          updateElement({ 
            id: drawingId, 
            updates: { width: x - el.x, height: y - el.y } 
          });
        }
      }
    }

    // Drag mode
    if (tool === 'select' && isDragging && selectedId) {
      updateElement({ 
        id: selectedId, 
        updates: { x: x - dragStart.x, y: y - dragStart.y } 
      });
    }
  };

  /**
   * Handle pointer up - finish drawing/dragging
   */
  const handlePointerUp = () => {
    // Simplify pencil strokes on finish
    if (drawingId) {
      const el = elements.find(e => e.id === drawingId);
      if (el?.type === 'pencil' && el.points && el.points.length > 20) {
        const simplified = simplifyPath(el.points);
        updateElement({ 
          id: drawingId, 
          updates: { points: simplified } 
        });
      }
    }
    
    history.resume();
    setDrawingId(null);
    setIsDragging(false);
    setIsPanning(false);
    setIsResizing(false);
    setResizeStart(null);
    setActiveHandle(null);
  };

  /**
   * Handle mouse wheel - zoom
   */
  const handleWheel = (e: React.WheelEvent) => {
    const scale = 1 - e.deltaY * 0.001;
    const newZoom = Math.max(0.1, Math.min(5, camera.zoom * scale));
    setCamera(prev => ({ ...prev, zoom: newZoom }));
  };

  /**
   * Handle double click - start editing text
   */
  const handleDoubleClick = (e: React.MouseEvent, id: string, content: string) => {
    e.stopPropagation();
    setEditingId(id);
    setTempText(content || "");
  };

  // ==========================================================================
  // LOADING GATE
  // ==========================================================================
  if (!isMounted || root === null) {
    return (
      <div className={`flex items-center justify-center w-screen h-screen ${isDarkMode ? 'bg-[#121212] text-white' : 'bg-gray-100 text-black'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="font-semibold">Loading Board...</div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // STYLE HELPERS
  // ==========================================================================
  const bgClass = isDarkMode ? 'bg-[#121212] text-white' : 'bg-[#f8f9fa] text-black';
  const toolbarClass = isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200 shadow-xl';
  const btnClass = (active: boolean) => 
    `p-2 shrink-0 rounded transition-colors ${
      active 
        ? 'bg-blue-600 text-white' 
        : isDarkMode 
          ? 'hover:bg-[#333] text-gray-400' 
          : 'hover:bg-gray-100 text-gray-600'
    }`;

  // ==========================================================================
  // RESIZE HANDLES RENDERER
  // ==========================================================================
  const renderHandles = (el: Layer, normalized: { x: number; y: number; width: number; height: number }) => {
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
          left: h.x, 
          top: h.y, 
          width: handleSize, 
          height: handleSize,
          cursor: h.cursor, 
          pointerEvents: 'auto'
        }}
        onPointerDown={(e) => handleResizeStart(e, el.id, h.type)}
      />
    ));
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className={`fixed inset-0 w-full h-full overflow-hidden ${bgClass}`}>
      
      {/* ====================================================================
          CUSTOM SCROLLBAR STYLES
          ==================================================================== */}
      <style>{`
        .chat-scroll {
          scrollbar-width: thin;
          scrollbar-color: #888 transparent;
        }
        .chat-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .chat-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-scroll::-webkit-scrollbar-thumb {
          background-color: #888;
          border-radius: 4px;
        }
        .chat-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #666;
        }
      `}</style>

      {/* ====================================================================
          NAME MODAL
          ==================================================================== */}
      {showNameModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className={`p-6 rounded-xl shadow-2xl border w-80 text-center ${isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200'}`}>
            <h2 className="text-lg font-bold mb-4">Set Your Name</h2>
            <input 
              autoFocus 
              placeholder="Enter name..." 
              className={`w-full p-2 rounded border mb-4 text-center ${isDarkMode ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-gray-50 border-gray-300 text-black'}`} 
              value={username === "Guest" ? "" : username} 
              onChange={e => setUsername(e.target.value)} 
              onKeyDown={e => { if(e.key === 'Enter') setShowNameModal(false); }} 
            />
            <button 
              onClick={() => setShowNameModal(false)} 
              className="w-full px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          TOOLBAR
          ==================================================================== */}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 p-2 rounded-lg flex gap-2 z-50 border items-center select-none pointer-events-auto ${toolbarClass}`}>
        <button onClick={() => setTool('select')} className={btnClass(tool === 'select')}>
          <MousePointer2 size={20} />
        </button>
        <button onClick={() => setTool('pencil')} className={btnClass(tool === 'pencil')}>
          <Pencil size={20} />
        </button>
        <button onClick={() => setTool('rectangle')} className={btnClass(tool === 'rectangle')}>
          <Square size={20} />
        </button>
        <button onClick={() => setTool('circle')} className={btnClass(tool === 'circle')}>
          <Circle size={20} />
        </button>
        <button onClick={() => setTool('text')} className={btnClass(tool === 'text')}>
          <Type size={20} />
        </button>
        <button onClick={() => setTool('note')} className={btnClass(tool === 'note')}>
          <StickyNote size={20} />
        </button>
        <button onClick={() => setTool('image')} className={btnClass(tool === 'image')}>
          <ImageIcon size={20} />
        </button>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleImageUpload} 
        />
        
        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        
        <UserButton />
        
        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        
        <button onClick={undo} className={btnClass(false)}>
          <Undo size={20} />
        </button>
        <button onClick={redo} className={btnClass(false)}>
          <Redo size={20} />
        </button>
        
        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        
        <button 
          onClick={() => { if(confirm('Clear board?')) clearBoard(); }} 
          className={`p-2 shrink-0 rounded ${isDarkMode ? 'hover:bg-red-900/30' : 'hover:bg-red-100'} text-red-500`}
        >
          <Trash2 size={20} />
        </button>
        
        <div className={`w-px h-6 mx-1 shrink-0 ${isDarkMode ? 'bg-[#333]' : 'bg-gray-300'}`} />
        
        <input 
          type="color" 
          value={currentColor} 
          onChange={(e) => setCurrentColor(e.target.value)} 
          className="w-8 h-8 p-0 border-0 rounded cursor-pointer shrink-0" 
        />
        
        <button onClick={() => setIsDarkMode(!isDarkMode)} className={btnClass(false)}>
          {isDarkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-600" />}
        </button>
        
        <button onClick={() => setIsChatOpen(!isChatOpen)} className={btnClass(isChatOpen)}>
          <MessageCircle size={20} />
        </button>
        
        <button 
          onClick={handleExport} 
          className={`p-2 shrink-0 rounded ${isDarkMode ? 'hover:bg-green-900/30' : 'hover:bg-green-100'} text-green-500`}
        >
          <Camera size={20} />
        </button>
      </div>

      {/* ====================================================================
          CHAT SIDEBAR
          ==================================================================== */}
      {isChatOpen && (
        <div 
          className={`fixed right-4 top-20 bottom-20 w-80 flex flex-col rounded-xl border shadow-2xl z-[999] pointer-events-auto touch-auto overflow-hidden ${isDarkMode ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white'}`}
          onPointerDown={(e) => e.stopPropagation()} 
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Chat Header */}
          <div className="p-3 border-b border-gray-700 flex justify-between items-center shrink-0">
            <h3 className="font-bold">Live Chat</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => { if(confirm('Clear chat history?')) clearChat(); }} 
                className="hover:text-red-500" 
                title="Clear Chat"
              >
                <Trash2 size={16} />
              </button>
              <button onClick={() => setIsChatOpen(false)}>
                <X size={18}/>
              </button>
            </div>
          </div>
          
          {/* Chat Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 chat-scroll select-auto touch-auto">
            {messages.map((msg, i) => (
              <div key={i} className="flex flex-col select-none">
                <span className="text-xs font-bold opacity-75" style={{color: msg.color}}>
                  {msg.user}
                </span>
                <div className={`p-2 rounded text-sm break-words ${isDarkMode ? 'bg-[#333] text-white' : 'bg-gray-100 text-black'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef}/>
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-gray-700 shrink-0 flex gap-2">
            <input 
              className={`flex-1 p-2 rounded border ${isDarkMode ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-white text-black'}`} 
              placeholder="Type..." 
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && (sendMessage({ text: chatInput, user: username }), setChatInput(''))} 
            />
            <button 
              onClick={() => (sendMessage({ text: chatInput, user: username }), setChatInput(''))} 
              className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Send size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          CANVAS
          ==================================================================== */}
      <div 
        className={`absolute inset-0 w-full h-full block touch-none select-none z-0 ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { 
          updateMyPresence({ cursor: null }); 
          setIsDragging(false); 
        }}
        onWheel={handleWheel}
      >
        <div 
          id="canvas-content" 
          className="w-full h-full origin-top-left pointer-events-none" 
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
        >
          {/* Grid Background */}
          <div 
            className="absolute inset-0 opacity-20" 
            style={{ 
              backgroundImage: `radial-gradient(${isDarkMode ? '#888' : '#ccc'} 1px, transparent 1px)`, 
              backgroundSize: '20px 20px' 
            }} 
          />
          
          {/* Elements */}
          {uniqueElements.map((el) => {
            const uniqueKey = el.id; 
            const isSelected = selectedId === el.id;
            const isEditing = editingId === el.id;
            const normalized = normalizeShape(el);
            const { x, y, width, height } = normalized;
            
            const pointerStyle = { 
              pointerEvents: tool === 'select' ? 'auto' : 'none', 
              cursor: tool === 'select' ? 'move' : 'default', 
              zIndex: isSelected ? 50 : 1 
            } as const;
            
            const baseStyle = { 
              position: 'absolute' as const, 
              left: x, 
              top: y, 
              ...pointerStyle 
            };

            const selectionBorderRadius = el.type === 'circle' ? '50%' : '0%';
            
            const SelectionBox = isSelected && tool === 'select' && !isEditing ? (
              <div 
                className="absolute -inset-1 border-2 border-blue-500 border-dashed pointer-events-none"
                style={{ borderRadius: selectionBorderRadius }} 
              />
            ) : null;

            const Handles = isSelected && tool === 'select' && !isEditing 
              ? renderHandles(el, normalized) 
              : null;

            // Pencil stroke
            if (el.type === 'pencil' && el.points) {
              const pathData = el.points
                .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
                .join(' ');
              
              return (
                <div key={uniqueKey} style={baseStyle}>
                  <svg style={{ overflow: 'visible' }}>
                    <path 
                      d={pathData} 
                      stroke={el.stroke} 
                      strokeWidth={3} 
                      fill="none" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                    />
                  </svg>
                  {isSelected && (
                    <div className="absolute inset-0 border-2 border-blue-500 border-dashed opacity-50 pointer-events-none" />
                  )}
                </div>
              );
            }

            // Image
            if (el.type === 'image') {
              return (
                <div 
                  key={uniqueKey} 
                  onDoubleClick={(e) => e.stopPropagation()} 
                  style={{ ...baseStyle, width, height }}
                >
                  <img 
                    src={el.content} 
                    className="w-full h-full object-contain" 
                    draggable={false} 
                    alt="" 
                  />
                  {SelectionBox}
                  {Handles}
                </div>
              );
            }
            
            // Sticky Note
            if (el.type === 'note') {
              return (
                <div 
                  key={uniqueKey} 
                  onDoubleClick={(e) => handleDoubleClick(e, el.id, el.content || "")} 
                  style={{ 
                    ...baseStyle, 
                    width, 
                    height, 
                    backgroundColor: el.fill, 
                    color: '#000', 
                    boxShadow: '4px 4px 10px rgba(0,0,0,0.2)', 
                    padding: '10px', 
                    fontSize: '18px', 
                    fontFamily: 'Comic Sans MS', 
                    border: 'none', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    textAlign: 'center', 
                    overflow: 'hidden' 
                  }}
                >
                  {isEditing ? (
                    <textarea 
                      autoFocus
                      value={tempText}
                      onChange={(e) => setTempText(e.target.value)}
                      onBlur={saveText}
                      onKeyDown={(e) => { 
                        if(e.key === 'Enter' && !e.shiftKey) { 
                          e.preventDefault(); 
                          saveText(); 
                        }
                      }}
                      onPointerDown={(e) => e.stopPropagation()} 
                      className="w-full h-full bg-transparent border-none outline-none resize-none text-center font-[inherit] text-[inherit] p-0 overflow-hidden pointer-events-auto"
                    />
                  ) : (
                    el.content
                  )}
                  {SelectionBox}
                  {Handles}
                </div>
              );
            }

            // Text
            if (el.type === 'text') {
              return (
                <div 
                  key={uniqueKey} 
                  onDoubleClick={(e) => handleDoubleClick(e, el.id, el.content || "")} 
                  style={{ 
                    ...baseStyle, 
                    border: 'none', 
                    fontSize: '24px', 
                    fontFamily: 'sans-serif', 
                    padding: '4px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    whiteSpace: 'pre-wrap', 
                    color: el.stroke 
                  }}
                >
                  {isEditing ? (
                    <textarea 
                      autoFocus
                      value={tempText}
                      onChange={(e) => setTempText(e.target.value)}
                      onBlur={saveText}
                      onKeyDown={(e) => { 
                        if(e.key === 'Enter' && !e.shiftKey) { 
                          e.preventDefault(); 
                          saveText(); 
                        }
                      }}
                      onPointerDown={(e) => e.stopPropagation()} 
                      className="w-full h-full bg-transparent border-none outline-none resize-none text-center font-[inherit] text-[inherit] p-0 overflow-hidden pointer-events-auto"
                    />
                  ) : (
                    el.content
                  )}
                  {SelectionBox}
                  {Handles}
                </div>
              );
            }

            // Rectangle or Circle
            return (
              <div 
                key={uniqueKey} 
                onDoubleClick={(e) => e.stopPropagation()} 
                className="absolute bg-transparent" 
                style={{ 
                  ...baseStyle, 
                  width, 
                  height, 
                  borderWidth: '2px', 
                  borderStyle: 'solid', 
                  borderColor: el.stroke, 
                  borderRadius: el.type === 'circle' ? '50%' : '0%' 
                }}
              >
                {SelectionBox}
                {Handles}
              </div>
            );
          })}

          {/* Other Users' Cursors */}
          <div className="cursor-overlay">
            {others.map(({ connectionId, presence, info }) => 
              presence?.cursor && (
                <Cursor 
                  key={connectionId} 
                  x={presence.cursor.x} 
                  y={presence.cursor.y} 
                  connectionId={connectionId} 
                  name={info?.name} 
                  picture={info?.picture} 
                />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
