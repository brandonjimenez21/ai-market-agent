'use client';

import { useState } from 'react';

export default function Home() {
  const [message, setMessage] = useState('Waiting for a response from Go...');
  const [loading, setLoading] = useState(false);

  const pingGateway = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8080/api/ask-ai');
      const data = await res.json();
      // Updated to match the new Python JSON response ("answer" instead of "agent_response")
      setMessage(data.answer || data.error);
    } catch {
      setMessage('❌ Error: Could not connect to Go.');
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      <h1 className="text-4xl font-extrabold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
        🤖 AI Market Agent
      </h1>
      
      <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl flex flex-col items-center space-y-6 max-w-md w-full border border-gray-700">
        <p className="text-gray-400 text-center">
          Test of communication between the Frontend (React) and the API Gateway (Go).
        </p>
        
        <button 
          onClick={pingGateway}
          disabled={loading}
          className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Ping Go ⚡'}
        </button>

        <div className="w-full p-4 bg-gray-950 rounded-lg border border-gray-700 text-center min-h-[60px] flex items-center justify-center">
          <span className="font-mono text-emerald-400">{message}</span>
        </div>
      </div>
    </main>
  );
}