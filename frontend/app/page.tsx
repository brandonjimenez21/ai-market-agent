'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { signOut, getSession } from 'next-auth/react';

interface Message {
  id: string; 
  role: 'user' | 'bot' | 'system';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init-1', role: 'bot', content: 'Hello. I am your AI Agent. Ask me anything or upload a document to query your private data.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [documents, setDocuments] = useState<string[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeSession = async () => {
      const session = await getSession();
      
      if (!session?.user?.email) return;

      const realUserId = session.user.email;
      setUserId(realUserId);

      try {
        const res = await fetch(`http://localhost:8080/api/history?user_id=${realUserId}`);
        const data = await res.json();
        
        if (data.history && data.history.length > 0) {
          const loadedMessages = data.history.map((msg: { role: 'user' | 'bot' | 'system', content: string }) => ({
            id: crypto.randomUUID(),
            role: msg.role,
            content: msg.content
          }));
          setMessages(loadedMessages);
        } else {
          setMessages([]);
        }
      } catch (error) {
        console.error("No se pudo cargar el historial", error);
      }
    };
    
    initializeSession();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const fetchDocs = async () => {
      if (!showDocsModal || !userId) return;
      
      setLoadingDocs(true); 
      try {
        const res = await fetch(`http://localhost:8080/api/documents?user_id=${encodeURIComponent(userId)}`);
        const data = await res.json();
        if (data.documents) {
          setDocuments(data.documents);
        }
      } catch (e) {
        console.error("Failed to load documents", e);
      }
      setLoadingDocs(false);
    };

    fetchDocs();
  }, [showDocsModal, userId]);

  const handleDeleteDocument = async (filename: string) => {
    try {
      const res = await fetch(`http://localhost:8080/api/documents?user_id=${encodeURIComponent(userId)}&filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(doc => doc !== filename));
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Document "${filename}" deleted permanently.` }]);
      }
    } catch (e) {
      console.error("Failed to delete document", e);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    
    const historyToSend = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));

    const tempBotId = crypto.randomUUID(); 
    setMessages(prev => [
      ...prev, 
      { id: crypto.randomUUID(), role: 'user', content: userMessage },
      { id: tempBotId, role: 'bot', content: '' } 
    ]);
    
    setLoading(true); 

    try {
      const res = await fetch('http://localhost:8080/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: userMessage, 
          user_id: userId,
          history: historyToSend 
        })
      });
      
      if (!res.body) throw new Error('No response body');

      setLoading(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let botResponse = '';
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                done = true;
                break;
              }
              
              const textToAppend = data.replace(/\\n/g, '\n');
              botResponse += textToAppend;
              
              setMessages(prev => prev.map(msg => 
                msg.id === tempBotId ? { ...msg, content: botResponse } : msg
              ));
            }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: 'Connection error.' }]);
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);

    try {
      const res = await fetch('http://localhost:8080/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Document "${file.name}" uploaded successfully.` }]);
      } else {
        throw new Error('Upload failed');
      }
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Error uploading "${file.name}".` }]);
    }
    
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col font-sans">
      
      <header className="w-full p-4 border-b border-neutral-800 bg-[#0a0a0a]">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Agent<span className="text-neutral-500">.ai</span>
          </h1>

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs font-medium bg-[#111111] hover:bg-red-900/30 text-neutral-400 hover:text-red-400 px-4 py-2 rounded-lg transition-all border border-neutral-800 hover:border-red-900/50"
          >
            Cerrar Sesión
          </button>
          
        </div>
      </header>

      <main className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-neutral-200 font-sans p-4 relative">

        {showDocsModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#111111] border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                <h2 className="text-white font-medium">Your Documents</h2>
                <button 
                  onClick={() => setShowDocsModal(false)}
                  className="text-neutral-500 hover:text-white transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>

              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {loadingDocs ? (
                  <div className="text-neutral-500 text-sm text-center py-4">Loading documents...</div>
                ) : documents.length === 0 ? (
                  <div className="text-neutral-500 text-sm text-center py-4">No documents uploaded yet.</div>
                ) : (
                  <ul className="space-y-2">
                    {documents.map((doc, idx) => (
                      <li key={idx} className="flex justify-between items-center p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 transition-colors">
                        <span className="text-sm text-neutral-300 truncate pr-4" title={doc}>📄 {doc}</span>
                        <button 
                          onClick={() => handleDeleteDocument(doc)}
                          className="text-red-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                          title="Delete document"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-3xl flex flex-col h-[85vh] bg-[#111111] rounded-xl border border-neutral-800 overflow-hidden">

          <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-[#111111] flex-wrap gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Agent<span className="text-neutral-500">.ai</span>
            </h1>

            <div className="flex gap-2">
              <button 
                onClick={() => setMessages([{ id: crypto.randomUUID(), role: 'bot', content: 'Chat cleared. Ask me anything or upload a document to query your private data.' }])}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors"
                title="Clear conversation"
              >
                🧹 Clear
              </button>
              <button 
                onClick={() => setShowDocsModal(true)}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors"
              >
                📁 Manage Docs
              </button>

              <input 
                type="file" 
                accept=".txt,.pdf" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : '+ Upload File'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#0a0a0a]">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-neutral-800 text-white py-2 px-4 rounded-2xl rounded-tr-sm' 
                    : msg.role === 'system' 
                    ? 'text-neutral-500 text-xs font-mono py-1' 
                    : 'text-neutral-300 py-2 flex flex-col'
                }`}>
                  {msg.role === 'bot' && (
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-bold text-white">AI:</div>
                      <button 
                        onClick={() => navigator.clipboard.writeText(msg.content)} 
                        className="text-neutral-500 hover:text-white transition-colors p-1"
                        title="Copy to clipboard"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                    </div>
                  )}

                  {msg.role === 'bot' ? (
                    <ReactMarkdown
                      components={{
                        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc ml-5 mb-2 space-y-1" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal ml-5 mb-2 space-y-1" {...props} />,
                        li: ({node, ...props}) => <li className="text-neutral-300" {...props} />,
                        strong: ({node, ...props}) => <strong className="font-semibold text-white" {...props} />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="text-neutral-500 text-sm py-2 animate-pulse flex items-center gap-2">
                  <span className="font-bold text-neutral-400">AI:</span> Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-3 bg-[#111111] border-t border-neutral-800 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything or query your docs..."
              className="flex-1 bg-[#0a0a0a] border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-500 transition-colors"
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={loading || !input.trim()}
              className="bg-white hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-black font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
            >
              Send
            </button>
          </form>

        </div>
      </main>
    </div>
  );
}