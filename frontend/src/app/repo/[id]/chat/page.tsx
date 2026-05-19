/**
 * Chat tab - RAG-powered Q&A interface with modern UI and thread sidebar
 */
'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/lib/api';
import { ChatMessage } from '@/lib/types';
import { Loader2, Send, MessageSquare, Code, Sparkles, Zap, Plus, Trash2, MoreVertical, Search, Pencil, Check, X } from 'lucide-react';
import ChatBubble from '@/components/ui/ChatBubble';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface Thread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export default function ChatPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const repoId = parseInt(params.id);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sidebar: search + inline rename + local title overrides
  const [threadSearch, setThreadSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`thread_titles_${repoId}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const persistOverrides = (next: Record<string, string>) => {
    setTitleOverrides(next);
    try {
      localStorage.setItem(`thread_titles_${repoId}`, JSON.stringify(next));
    } catch {}
  };

  const startRename = (thread: Thread) => {
    setRenamingId(thread.id);
    setRenameDraft(titleOverrides[thread.id] ?? thread.title);
  };
  const commitRename = () => {
    if (!renamingId) return;
    const t = renameDraft.trim();
    const next = { ...titleOverrides };
    if (t) next[renamingId] = t;
    else delete next[renamingId];
    persistOverrides(next);
    setRenamingId(null);
    setRenameDraft('');
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const titleOf = (t: Thread) => titleOverrides[t.id] ?? t.title;

  const filteredThreads = threads.filter((t) => {
    if (!threadSearch.trim()) return true;
    const q = threadSearch.trim().toLowerCase();
    if (titleOf(t).toLowerCase().includes(q)) return true;
    return t.messages.some((m) => m.question?.toLowerCase().includes(q) || (m as any).answer?.toLowerCase?.().includes(q));
  });

  // Group threads by date bucket while preserving sort order
  const dateBucket = (d: Date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400_000;
    const weekStart = today - 6 * 86400_000;
    const ts = d.getTime();
    if (ts >= today) return 'Today';
    if (ts >= yesterday) return 'Yesterday';
    if (ts >= weekStart) return 'This week';
    return 'Older';
  };
  const groupedThreads: Array<[string, Thread[]]> = (() => {
    const order = ['Today', 'Yesterday', 'This week', 'Older'];
    const map = new Map<string, Thread[]>();
    filteredThreads.forEach((t) => {
      const k = dateBucket(t.updatedAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    });
    return order.filter((k) => map.has(k)).map((k) => [k, map.get(k)!]);
  })();

  // Load threads from database (primary) and localStorage (fallback for current session)
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!session) {
        setLoadingHistory(false);
        return;
      }

      try {
        // Set auth token first
        const backendToken = (session as any).backendToken;
        if (backendToken) {
          apiClient.setAuthToken(backendToken);
        }

        // Load chat history from database
        const history = await apiClient.getChatHistory(repoId, 100);

        if (history && history.length > 0) {
          // Group messages into threads based on time proximity (30 minutes)
          const threadsMap = new Map<string, Thread>();
          const THREAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

          // Sort by created_at ascending to group chronologically
          const sortedHistory = [...history].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          let currentThreadId: string | null = null;
          let lastMessageTime: Date | null = null;

          for (const message of sortedHistory) {
            const messageTime = new Date(message.created_at);

            // Start a new thread if:
            // 1. No current thread exists
            // 2. More than 30 minutes since last message
            const shouldStartNewThread =
              !currentThreadId ||
              !lastMessageTime ||
              (messageTime.getTime() - lastMessageTime.getTime() > THREAD_TIMEOUT_MS);

            if (shouldStartNewThread) {
              // Create new thread with first question as title
              currentThreadId = `db_${message.id || messageTime.getTime()}`;
              const threadTitle = message.question.substring(0, 50) + (message.question.length > 50 ? '...' : '');

              threadsMap.set(currentThreadId, {
                id: currentThreadId,
                title: threadTitle,
                messages: [message],
                createdAt: messageTime,
                updatedAt: messageTime,
              });
            } else {
              // Add to existing thread
              const thread = threadsMap.get(currentThreadId!);
              if (thread) {
                thread.messages.push(message);
                thread.updatedAt = messageTime;
              }
            }

            lastMessageTime = messageTime;
          }

          // Convert map to array and sort by most recent first
          const threadsFromDB = Array.from(threadsMap.values())
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

          setThreads(threadsFromDB);

          // Set the most recent thread as active
          if (threadsFromDB.length > 0) {
            setActiveThreadId(threadsFromDB[0].id);
            setMessages(threadsFromDB[0].messages);
          }

          console.log(`✅ Loaded ${history.length} messages in ${threadsFromDB.length} threads from database`);
        } else {
          // No database history, try localStorage as fallback
          const savedThreads = localStorage.getItem(`threads_${repoId}`);
          const savedActiveThreadId = localStorage.getItem(`activeThreadId_${repoId}`);

          if (savedThreads) {
            try {
              const parsedThreads = JSON.parse(savedThreads);
              const threadsWithDates = parsedThreads.map((t: any) => ({
                ...t,
                createdAt: new Date(t.createdAt),
                updatedAt: new Date(t.updatedAt),
              }));
              setThreads(threadsWithDates);

              if (savedActiveThreadId && threadsWithDates.find((t: Thread) => t.id === savedActiveThreadId)) {
                setActiveThreadId(savedActiveThreadId);
                const activeThread = threadsWithDates.find((t: Thread) => t.id === savedActiveThreadId);
                if (activeThread) {
                  setMessages(activeThread.messages);
                }
              }
            } catch (error) {
              console.error('Failed to load threads from localStorage:', error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load chat history from database:', error);
        // Fallback to localStorage on error
        const savedThreads = localStorage.getItem(`threads_${repoId}`);
        if (savedThreads) {
          try {
            const parsedThreads = JSON.parse(savedThreads);
            const threadsWithDates = parsedThreads.map((t: any) => ({
              ...t,
              createdAt: new Date(t.createdAt),
              updatedAt: new Date(t.updatedAt),
            }));
            setThreads(threadsWithDates);
          } catch (e) {
            console.error('Failed to load threads from localStorage:', e);
          }
        }
      }

      setLoadingHistory(false);
    };

    loadChatHistory();
  }, [repoId, session]);

  // Save threads to localStorage whenever they change
  useEffect(() => {
    if (threads.length > 0) {
      localStorage.setItem(`threads_${repoId}`, JSON.stringify(threads));
    }
  }, [threads, repoId]);

  // Save active thread ID to localStorage
  useEffect(() => {
    if (activeThreadId) {
      localStorage.setItem(`activeThreadId_${repoId}`, activeThreadId);
    } else {
      localStorage.removeItem(`activeThreadId_${repoId}`);
    }
  }, [activeThreadId, repoId]);

  // Create a new thread
  const createNewThread = () => {
    const newThread: Thread = {
      id: Date.now().toString(),
      title: 'New conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setThreads(prev => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
    setMessages([]);
  };

  // Delete a thread (from both UI and database)
  const deleteThread = async (threadId: string) => {
    // Find the thread to get message IDs
    const threadToDelete = threads.find(t => t.id === threadId);

    // Delete from database if thread has messages with IDs
    if (threadToDelete && threadToDelete.messages.length > 0) {
      const messageIds = threadToDelete.messages
        .filter(m => m.id !== undefined)
        .map(m => m.id as number);

      if (messageIds.length > 0) {
        try {
          await apiClient.deleteChatMessages(repoId, messageIds);
          console.log(`✅ Deleted ${messageIds.length} messages from database`);
        } catch (error) {
          console.error('Failed to delete messages from database:', error);
          // Continue with local deletion even if DB delete fails
        }
      }
    }

    // Remove from local state
    const updatedThreads = threads.filter(t => t.id !== threadId);
    setThreads(updatedThreads);

    // Update localStorage
    if (updatedThreads.length === 0) {
      localStorage.removeItem(`threads_${repoId}`);
      localStorage.removeItem(`activeThreadId_${repoId}`);
    }

    if (activeThreadId === threadId) {
      // If we deleted the active thread, switch to the first remaining thread or clear
      if (updatedThreads.length > 0) {
        const firstThread = updatedThreads[0];
        setActiveThreadId(firstThread.id);
        setMessages(firstThread.messages);
      } else {
        setActiveThreadId(null);
        setMessages([]);
      }
    }
  };

  // Switch to a thread
  const switchThread = (threadId: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (thread) {
      setActiveThreadId(threadId);
      setMessages(thread.messages);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');
    setLoading(true);

    // Create new thread if none is active
    let currentThreadId = activeThreadId;
    let isNewThread = false;

    if (!currentThreadId) {
      const newThreadId = Date.now().toString();
      const newThread: Thread = {
        id: newThreadId,
        title: question.substring(0, 50),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setThreads(prev => [newThread, ...prev]);
      setActiveThreadId(newThreadId);
      setMessages([]); // Clear messages for new thread
      currentThreadId = newThreadId;
      isNewThread = true;
    }

    try {
      const response = await apiClient.sendChatMessage(repoId, question);
      const updatedMessages = isNewThread ? [response] : [...messages, response];
      setMessages(updatedMessages);

      // Update thread with new messages
      setThreads(prev => prev.map(t =>
        t.id === currentThreadId
          ? { ...t, messages: updatedMessages, updatedAt: new Date() }
          : t
      ));
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQuestions = [
    "Where is authentication handled?",
    "Explain how the API works",
    "Are there any security vulnerabilities?",
    "What does the main function do?",
  ];

  const handleSuggestedQuestion = (question: string) => {
    setInput(question);
  };

  if (loadingHistory) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent-cyan))]" />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[hsl(var(--bg-base))] overflow-hidden">
      {/* Threads sidebar */}
      <div className="w-64 bg-[hsl(var(--surface-1))] border-r border-[hsl(var(--hairline))] flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-[hsl(var(--hairline))] flex items-center justify-between">
          <h2 className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-cyan))]">
            Threads
          </h2>
          <motion.button
            onClick={createNewThread}
            className="p-1 rounded-md bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] shadow-[0_0_12px_-3px_hsl(var(--accent-cyan)/0.6)]"
            title="New thread"
            aria-label="New thread"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="w-3.5 h-3.5 text-white" />
          </motion.button>
        </div>

        {/* Search */}
        <div className="px-2 pt-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[hsl(var(--text-muted))]" />
            <input
              type="text"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search threads"
              aria-label="Search threads"
              className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-[hsl(var(--surface-2))] border border-[hsl(var(--hairline))] rounded-md text-[hsl(var(--text-primary))] placeholder:text-[hsl(var(--text-muted))] focus:outline-none focus:border-[hsl(var(--accent-cyan)/0.5)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mt-2">
          {threads.length === 0 ? (
            <div className="p-4 text-center">
              <MessageSquare className="w-6 h-6 text-[hsl(var(--text-muted))] mx-auto mb-2 opacity-60" />
              <p className="text-[11px] text-[hsl(var(--text-muted))]">No threads yet</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-[11px] text-[hsl(var(--text-muted))]">No matches</p>
            </div>
          ) : (
            <div className="p-1.5 space-y-2">
              {groupedThreads.map(([bucket, items]) => (
                <div key={bucket}>
                  <div className="mono text-[9px] uppercase tracking-widest text-[hsl(var(--text-muted))] px-2 py-1">
                    {bucket}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((thread) => {
                      const isActive = activeThreadId === thread.id;
                      const isRenaming = renamingId === thread.id;
                      return (
                        <div
                          key={thread.id}
                          className={`group relative rounded-md transition-colors border ${
                            isActive
                              ? 'bg-[hsl(var(--accent-cyan)/0.1)] border-[hsl(var(--accent-cyan)/0.3)]'
                              : 'border-transparent hover:bg-[hsl(var(--surface-2)/0.6)]'
                          }`}
                        >
                          {isRenaming ? (
                            <div className="flex items-center gap-1 px-2 py-1.5">
                              <input
                                autoFocus
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename();
                                  else if (e.key === 'Escape') cancelRename();
                                }}
                                aria-label="Thread title"
                                className="flex-1 min-w-0 text-[12px] bg-[hsl(var(--surface-2))] border border-[hsl(var(--accent-cyan)/0.4)] rounded px-1.5 py-0.5 text-[hsl(var(--text-primary))] focus:outline-none"
                              />
                              <button
                                onClick={commitRename}
                                aria-label="Save name"
                                className="p-0.5 rounded text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.15)]"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={cancelRename}
                                aria-label="Cancel rename"
                                className="p-0.5 rounded text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-2))]"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => switchThread(thread.id)}
                              onDoubleClick={() => startRename(thread)}
                              className={`w-full text-left px-2.5 py-2 rounded-md ${
                                isActive
                                  ? 'text-[hsl(var(--accent-cyan))]'
                                  : 'text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-medium truncate leading-tight">
                                    {titleOf(thread)}
                                  </p>
                                  <p className="mono text-[10px] text-[hsl(var(--text-muted))] mt-0.5">
                                    {thread.messages.length} msg ·{' '}
                                    {thread.updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                  </p>
                                </div>
                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startRename(thread);
                                    }}
                                    aria-label="Rename thread"
                                    title="Rename"
                                    className="p-0.5 rounded text-[hsl(var(--text-muted))] hover:text-[hsl(var(--accent-cyan))] hover:bg-[hsl(var(--accent-cyan)/0.12)]"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteThread(thread.id);
                                    }}
                                    aria-label="Delete thread"
                                    title="Delete"
                                    className="p-0.5 rounded text-[hsl(var(--text-muted))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.15)]"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8 space-y-6">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="text-center py-16"
              >
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] shadow-[0_0_30px_-6px_hsl(var(--accent-cyan)/0.6)]">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-[hsl(var(--text-primary))] mb-2 tracking-tight">
                  Ready when you are, {session?.user?.name?.split(' ')[0] || 'there'}
                </h3>
                <p className="text-[hsl(var(--text-secondary))] mb-8 max-w-md mx-auto text-[14px]">
                  Ask anything about this repository — architecture, security, where things live.
                </p>

                <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3">
                  {suggestedQuestions.map((question, idx) => (
                    <motion.button
                      key={idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      whileHover={{ y: -1 }}
                      onClick={() => handleSuggestedQuestion(question)}
                      className="text-left p-4 glass rounded-xl hover:border-[hsl(var(--accent-cyan)/0.5)] transition-colors group"
                    >
                      <Zap className="w-3.5 h-3.5 text-[hsl(var(--accent-cyan))] mb-2 opacity-70 group-hover:opacity-100 transition-opacity" />
                      <p className="text-[13px] text-[hsl(var(--text-secondary))] group-hover:text-[hsl(var(--text-primary))] transition-colors">
                        {question}
                      </p>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              messages.map((message, idx) => (
                <motion.div
                  key={message.id || `message-${idx}-${message.created_at}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <ChatBubble
                    message={message.question}
                    isUser={true}
                    timestamp={message.created_at}
                  />
                  <ChatBubble
                    message={message.answer}
                    isUser={false}
                    timestamp={message.created_at}
                    contextChunks={message.context_chunks}
                  />
                </motion.div>
              ))
            )}

            {loading && (
              <motion.div
                key="loading-indicator"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <ChatBubble message="Thinking..." isUser={false} loading={true} />
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-[hsl(var(--hairline))] backdrop-blur-xl bg-[hsl(var(--bg-base)/0.7)] px-6 sm:px-8 py-4">
          <div className="max-w-4xl mx-auto flex gap-2 items-center">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything about this repository…"
              disabled={loading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              variant="gradient"
              size="md"
              icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              loading={loading}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

