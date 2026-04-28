'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as BaseSyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { signOut, getSession } from 'next-auth/react';

const SyntaxHighlighter = BaseSyntaxHighlighter as unknown as React.FC<Record<string, unknown>>;

interface Message {
  id: string;
  role: 'user' | 'bot' | 'system';
  content: string;
  citations?: { file: string; page: number }[];
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
  
  const [pdfPosition, setPdfPosition] = useState<'left' | 'right'>('left');
  const [activePdf, setActivePdf] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeSession = async () => {
      const session = await getSession();
      if (!session?.user?.email) return;
      const realUserId = session.user.email;
      setUserId(realUserId);

      try {
        const res = await fetch(`/api/ai/history?user_id=${realUserId}`);
        const data = await res.json();
        if (data.history && data.history.length > 0) {
          const loadedMessages = data.history.map((msg: Omit<Message, 'id'>) => ({
            id: crypto.randomUUID(),
            role: msg.role,
            content: msg.content,
            citations: msg.citations 
              ? (typeof msg.citations === 'string' ? JSON.parse(msg.citations) : msg.citations) 
              : undefined
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
        const res = await fetch(`/api/ai/documents?user_id=${encodeURIComponent(userId)}`);
        const data = await res.json();
        if (data.documents) setDocuments(data.documents);
      } catch (e) {
        console.error("Failed to load documents", e);
      }
      setLoadingDocs(false);
    };
    fetchDocs();
  }, [showDocsModal, userId]);

  const handleCitationClick = (filename: string, page: number) => {
    setActivePdf(filename);
    setCurrentPage(page);

    if (pdfPosition === 'right') setPdfPosition('left');

    const iframe = document.querySelector('iframe[title="Visor PDF"]') as HTMLIFrameElement;
    if (iframe) {
      const newSrc = `/api/ai/files/${encodeURIComponent(userId)}_${encodeURIComponent(filename)}#page=${page}`;

      if (activePdf === filename) {
        iframe.contentWindow?.location.replace(newSrc);
      } else {
        iframe.src = newSrc;
      }
    }
  };

  const handleDeleteDocument = async (filename: string) => {
    try {
      const res = await fetch(`/api/ai/documents?user_id=${encodeURIComponent(userId)}&filename=${encodeURIComponent(filename)}`,{method: 'DELETE'});
      if (res.ok) {
        setDocuments(prev => prev.filter(doc => doc !== filename));
        if (activePdf === filename) setActivePdf(null);
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Document "${filename}" deleted.` }]);
      }
    } catch (e) {
      console.error("Failed to delete document", e);
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
      const res = await fetch('/api/ai/upload', {method: 'POST',body: formData,});
      if (res.ok) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Document "${file.name}" uploaded successfully.` }]);
        handleCitationClick(file.name, 1);
      } else {
        throw new Error('Upload failed');
      }
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Error uploading "${file.name}".` }]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    const historyToSend = messages.filter(msg => msg.role !== 'system').map(msg => ({ role: msg.role, content: msg.content }));

    const tempBotId = crypto.randomUUID(); 
    setMessages(prev => [ ...prev, { id: crypto.randomUUID(), role: 'user', content: userMessage }, { id: tempBotId, role: 'bot', content: '' } ]);
    setLoading(true); 

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage, user_id: userId, history: historyToSend })
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
              if (data === '[DONE]') { done = true; break; }

              botResponse += data.replace(/\\n/g, '\n');

              let displayContent = botResponse;
              let extractedCitations = undefined;

              if (botResponse.includes('__CITATIONS__')) {
                const parts = botResponse.split('__CITATIONS__');
                displayContent = parts[0]; 
                
                try {
                  extractedCitations = JSON.parse(parts[1]);
                } catch (e) {
                  // Si el JSON viene por la mitad, lo ignoramos y esperamos al siguiente pedazo
                }
              }
              setMessages(prev => prev.map(msg => {
                if (msg.id === tempBotId) {
                  return {
                    ...msg,
                    content: displayContent,
                    citations: extractedCitations || msg.citations
                  };
                }
                return msg;
              }));
            }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: 'Connection error.' }]);
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault(); 
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setPdfPosition(prev => prev === 'left' ? 'right' : 'left'); 
  };

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col font-sans overflow-hidden">
      
      <header className="w-full p-4 border-b border-neutral-800 bg-[#0a0a0a] flex-none z-10">
        <div className="w-full mx-auto flex justify-between items-center px-4">
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Agent<span className="text-neutral-500">.ai</span>
          </h1>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs font-medium bg-[#111111] hover:bg-red-900/30 text-neutral-400 hover:text-red-400 px-4 py-2 rounded-lg transition-all border border-neutral-800"
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      <main 
        className={`flex-1 flex w-full overflow-hidden transition-all duration-300 ${pdfPosition === 'left' ? 'flex-row' : 'flex-row-reverse'}`}
      >
        
        <div 
          className="w-1/2 h-full flex flex-col border-r border-neutral-800 bg-[#0c0c0c] relative group"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div 
            draggable
            className="h-10 bg-[#111111] border-b border-neutral-800 flex items-center justify-between px-4 cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Arrastra para cambiar de lado"
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
              {activePdf ? activePdf : 'Visor de Documentos'}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-4">
            {activePdf ? (
              <div className="w-full h-full border border-neutral-800 rounded-lg overflow-hidden bg-white">
                <iframe 
                  src={`/api/ai/files/${encodeURIComponent(userId)}_${encodeURIComponent(activePdf || '')}#page=${currentPage}`}
                  className="w-full h-full border-none"
                  title="Visor PDF"
                />
              </div>
            ) : (
              <div className="text-center text-neutral-600 text-sm">
                Sube un documento o selecciona uno del gestor para verlo aquí.
              </div>
            )}
          </div>
        </div>

        <div 
          className="w-1/2 h-full flex flex-col bg-[#0a0a0a]"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div 
            draggable
            className="h-10 bg-[#111111] border-b border-neutral-800 flex items-center justify-between px-4 cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
              Asistente de IA
            </div>

            <div className="flex gap-2">
              <button onClick={() => setMessages([{ id: crypto.randomUUID(), role: 'bot', content: 'Chat cleared.' }])} className="text-xs hover:text-white transition-colors" title="Limpiar Chat">🧹</button>
              <button onClick={() => setShowDocsModal(true)} className="text-xs hover:text-white transition-colors" title="Gestionar Documentos">📁</button>
              <input type="file" accept=".txt,.pdf" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-xs hover:text-white transition-colors disabled:opacity-50" title="Subir Archivo">
                {uploading ? '⏳' : '➕'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] text-sm leading-relaxed ${
                  msg.role === 'user' ? 'bg-neutral-800 text-white py-2 px-4 rounded-2xl rounded-tr-sm' 
                  : msg.role === 'system' ? 'text-neutral-500 text-xs font-mono py-1' 
                  : 'text-neutral-300 py-2 flex flex-col w-full'
                }`}>
                  {msg.role === 'bot' && <div className="font-bold text-white mb-2">AI:</div>}
                  
                  {msg.role === 'bot' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({node, inline, className, children, ...props}: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean, node?: unknown }) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <SyntaxHighlighter 
                              style={vscDarkPlus} 
                              language={match[1]} 
                              PreTag="div" 
                              className="rounded-md my-2 text-xs" 
                              {...(props as Record<string, unknown>)}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          ) : (
                            <code className="bg-neutral-800 text-red-300 px-1.5 py-0.5 rounded-md text-xs font-mono" {...props}>
                              {children}
                            </code>
                          )
                        },
                        table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-neutral-700 border border-neutral-700 rounded-lg" {...props} /></div>,
                        th: ({node, ...props}) => <th className="px-4 py-2 bg-neutral-800 text-left text-xs font-medium text-neutral-300 uppercase" {...props} />,
                        td: ({node, ...props}) => <td className="px-4 py-2 whitespace-nowrap text-sm text-neutral-400 border-t border-neutral-700" {...props} />,
                        a: ({node, ...props}) => <a className="text-blue-400 hover:underline cursor-pointer" {...props} />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-700/50 flex flex-wrap gap-2">
                      <span className="text-xs text-neutral-500 w-full mb-1">Fuentes consultadas:</span>
                      {msg.citations.map((cite, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            handleCitationClick(cite.file, cite.page);
                            if (pdfPosition === 'right') setPdfPosition('left');
                          }}
                          className="flex items-center gap-1.5 text-xs bg-blue-900/20 text-blue-300 border border-blue-800/50 hover:bg-blue-800/40 hover:border-blue-700 px-2.5 py-1.5 rounded-md transition-all shadow-sm"
                          title={`Ir a la página ${cite.page} de ${cite.file}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                          {cite.file} <span className="opacity-60">(Pág. {cite.page})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="text-neutral-500 text-sm py-2 animate-pulse font-bold">AI: Pensando...</div>}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-4 bg-[#0a0a0a] border-t border-neutral-800">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pregunta a tus documentos..."
                className="w-full bg-[#111111] border border-neutral-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition-colors shadow-inner"
                disabled={loading}
              />
              <button 
                type="submit" 
                disabled={loading || !input.trim()}
                className="absolute right-2 bg-white hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-black p-1.5 rounded-lg transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </form>

        </div>
      </main>

      {showDocsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-[#111111] border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-white font-medium">Tus Documentos</h2>
                <button onClick={() => setShowDocsModal(false)} className="text-neutral-500 hover:text-white">Cerrar</button>
              </div>
              <ul className="space-y-2">
                {documents.map((doc, idx) => (
                  <li key={idx} className="flex justify-between items-center p-3 bg-neutral-900 rounded-lg">
                    <span 
                      className="text-sm text-neutral-300 cursor-pointer hover:text-white truncate" 
                      onClick={() => { setActivePdf(doc); setShowDocsModal(false); }}
                    >📄 {doc}</span>
                    <button onClick={() => handleDeleteDocument(doc)} className="text-red-500 text-xs">Borrar</button>
                  </li>
                ))}
              </ul>
           </div>
        </div>
      )}

    </div>
  );
}