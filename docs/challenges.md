# 💥 Technical Challenges & Solutions

## 1. Conflict-Free State Synchronization

**Challenge:** In a distributed system, if User A moves an object while User B deletes it at the exact same millisecond, the app crashes or desyncs.
**Solution:** Implemented **CRDTs (Conflict-free Replicated Data Types)**.

- We treat state changes as a stream of commutative operations rather than absolute values.
- This ensures "Eventual Consistency"—all clients act on the same data stream and arrive at the exact same visual state without needing a central locking mechanism.

## 2. The "Canvas" Rendering Performance

**Challenge:** Standard HTML5 Canvas is raster-based and difficult to make interactive (e.g., selecting a specific circle).
**Solution:** Built a **Scene Graph** using SVG and DOM elements.

- Every shape is a distinct DOM node.
- Leveraged React's Virtual DOM to efficiently update only the changed attributes (x, y, fill) rather than re-painting the entire canvas on every frame (60FPS optimization).
