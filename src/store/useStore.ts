import { create } from 'zustand'

export interface CanvasElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  strokeColor: string
  backgroundColor: string
}

interface AppState {
  camera: {
    x: number
    y: number
    zoom: number
  }
  elements: Map<string, CanvasElement>
  activeTool: 'select' | 'rectangle' | 'circle' | 'pencil'
  selectedElementId: string | null

  // Actions
  setCamera: (camera: AppState['camera']) => void
  setActiveTool: (tool: AppState['activeTool']) => void
  addElement: (element: CanvasElement) => void
  updateElement: (id: string, updates: Partial<CanvasElement>) => void
  removeElement: (id: string) => void
  selectElement: (id: string | null) => void
  updateElementPosition: (id: string, x: number, y: number) => void
}

export const useStore = create<AppState>((set) => ({
  camera: { x: 0, y: 0, zoom: 1 },
  elements: new Map(),
  activeTool: 'select',
  selectedElementId: null,

  setCamera: (camera) => set({ camera }),
  setActiveTool: (activeTool) => set({ activeTool, selectedElementId: null }), // Clear selection when switching tools
  
  addElement: (element) => set((state) => {
    const newElements = new Map(state.elements)
    newElements.set(element.id, element)
    return { elements: newElements }
  }),

  updateElement: (id, updates) => set((state) => {
    const newElements = new Map(state.elements)
    const element = newElements.get(id)
    if (element) {
      newElements.set(id, { ...element, ...updates })
    }
    return { elements: newElements }
  }),

  removeElement: (id) => set((state) => {
    const newElements = new Map(state.elements)
    newElements.delete(id)
    return { elements: newElements }
  }),

  selectElement: (id) => set({ selectedElementId: id }),

  updateElementPosition: (id, x, y) => set((state) => {
    const newElements = new Map(state.elements)
    const element = newElements.get(id)
    if (element) {
      newElements.set(id, { ...element, x, y })
    }
    return { elements: newElements }
  }),
}))
