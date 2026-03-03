"use client";

import { useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Room } from "@/components/Room";
import Canvas from "@/components/canvas/Canvas";

export default function Home() {
  const { isSignedIn, isLoaded } = useUser();
  const [isGuest, setIsGuest] = useState(false);

  if (!isLoaded) return null;

  if (isSignedIn || isGuest) {
    return (
      <Room>
        <Canvas />
      </Room>
    );
  }

  return (
    <main 
      style={{ 
        backgroundColor: '#000000', 
        color: '#ffffff', 
        minHeight: '100vh', 
        width: '100%',
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        margin: 0,
        padding: '20px'
      }}
    >
      <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        
        {/* Title */}
        <h1 style={{ fontSize: '4rem', fontWeight: 'bold', margin: '0 0 10px 0', letterSpacing: '-0.05em' }}>
          Whitespace
        </h1>
        
        {/* Author */}
        <p style={{ color: '#9ca3af', fontSize: '1.125rem', margin: '0' }}>
          Built by Abishek Jha
        </p>

        {/* --- THE GAP (Requested) --- */}
        <div style={{ height: '80px' }}></div> 
        
        {/* Subtitle */}
        <p style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.3em', marginBottom: '40px' }}> 
           Real-time collaborative design engine
        </p>

        {/* Buttons Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* Clerk Sign In Button */}
          <SignInButton mode="modal">
            <button style={{ width: '100%', height: '56px', backgroundColor: '#ffffff', color: '#000000', fontWeight: 'bold', borderRadius: '9999px', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
              Sign In to Collaborate
            </button>
          </SignInButton>

          {/* Styled OR Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
            <div style={{ height: '1px', flex: 1, backgroundColor: '#1f2937' }}></div>
            <span style={{ color: '#4b5563', fontSize: '10px', fontWeight: '900' }}>OR</span>
            <div style={{ height: '1px', flex: 1, backgroundColor: '#1f2937' }}></div>
          </div>

          {/* Try as Guest Button (Forced Visible) */}
          <button 
            onClick={() => setIsGuest(true)}
            style={{ 
              width: '100%', 
              height: '56px', 
              backgroundColor: 'transparent', 
              color: '#ffffff', 
              fontWeight: 'bold', 
              borderRadius: '9999px', 
              border: '2px solid #374151', 
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'border-color 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = '#ffffff')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = '#374151')}
          >
            Try as Guest
          </button>
          
        </div>
      </div>
    </main>
  );
}