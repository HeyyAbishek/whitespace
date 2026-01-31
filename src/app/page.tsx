import Canvas from '@/components/canvas/Canvas';

export default function Home() {
  console.log("Page Mounting..."); // Debug log
  return (
    <main className="w-screen h-screen overflow-hidden bg-black">
      <Canvas />
    </main>
  );
}
