export interface Point {
  x: number
  y: number
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

export const screenToCanvas = (
  screenPoint: Point,
  camera: Camera,
  canvasRect: DOMRect
): Point => {
  // 1. Normalize mouse to the Canvas Element (0,0 is top-left of canvas)
  const relativeX = screenPoint.x - canvasRect.left
  const relativeY = screenPoint.y - canvasRect.top

  // 2. Apply Camera Transform
  return {
    x: (relativeX - camera.x) / camera.zoom,
    y: (relativeY - camera.y) / camera.zoom,
  }
}

export const canvasToScreen = (
  canvasPoint: Point,
  camera: Camera,
  canvasRect: DOMRect
): Point => {
  return {
    x: (canvasPoint.x * camera.zoom) + camera.x + canvasRect.left,
    y: (canvasPoint.y * camera.zoom) + camera.y + canvasRect.top,
  }
}
