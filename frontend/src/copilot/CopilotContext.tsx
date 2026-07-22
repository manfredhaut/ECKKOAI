import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api/client";
import type { CopilotConversation, CopilotMessage } from "../types";

export interface CopilotContextValue {
  open: boolean;
  showHistory: boolean;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  conversations: CopilotConversation[];
  messages: CopilotMessage[];
  input: string;
  setInput: (value: string) => void;
  sending: boolean;
  error: string | null;
  close: () => void;
  toggleOpen: () => void;
  selectConversation: (id: string) => void;
  handleNewConversation: () => void;
  handleSend: () => void;
  openWithPrompt: (promptText: string) => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<CopilotConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setShowHistory(false);
  }

  async function selectConversation(id: string) {
    setActiveConversationId(id);
    setShowHistory(false);
    setError(null);
    const list = await api.get<CopilotMessage[]>(`/copilot/conversations/${id}/messages`);
    setMessages(list);
  }

  async function toggleOpen() {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    const list = await api.get<CopilotConversation[]>("/copilot/conversations");
    setConversations(list);
    if (list.length > 0) {
      await selectConversation(list[0].id);
    } else {
      setActiveConversationId(null);
      setMessages([]);
    }
  }

  function handleNewConversation() {
    setActiveConversationId(null);
    setMessages([]);
    setShowHistory(false);
    setError(null);
  }

  async function sendMessage(content: string, forceNewConversation: boolean): Promise<void> {
    if (!content || sending) return;

    setSending(true);
    setError(null);

    const conversationIdAtStart = forceNewConversation ? null : activeConversationId;
    const optimisticUserMessage: CopilotMessage = {
      id: `pending-${Date.now()}`,
      conversation_id: conversationIdAtStart ?? "",
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => (forceNewConversation ? [optimisticUserMessage] : [...prev, optimisticUserMessage]));

    try {
      let conversationId = conversationIdAtStart;
      if (!conversationId) {
        const conversation = await api.post<CopilotConversation>("/copilot/conversations");
        conversationId = conversation.id;
        setActiveConversationId(conversationId);
        setConversations((prev) => [conversation, ...prev]);
      }

      const result = await api.post<{ conversation: CopilotConversation; message: CopilotMessage }>(
        `/copilot/conversations/${conversationId}/messages`,
        { content },
      );
      setMessages((prev) => [...prev, result.message]);
      setConversations((prev) => {
        const withoutCurrent = prev.filter((c) => c.id !== result.conversation.id);
        return [result.conversation, ...withoutCurrent].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
      });
    } catch (err) {
      const isMissingCredential = err instanceof ApiError && err.message.includes("no_script_credential");
      setError(isMissingCredential ? t("copilot.notConfigured") : t("copilot.error"));
    } finally {
      setSending(false);
    }
  }

  function handleSend() {
    const content = input.trim();
    if (!content) return;
    setInput("");
    void sendMessage(content, false);
  }

  function openWithPrompt(promptText: string) {
    setOpen(true);
    setShowHistory(false);
    void sendMessage(promptText, true);
  }

  return (
    <CopilotContext.Provider
      value={{
        open,
        showHistory,
        setShowHistory,
        conversations,
        messages,
        input,
        setInput,
        sending,
        error,
        close,
        toggleOpen,
        selectConversation,
        handleNewConversation,
        handleSend,
        openWithPrompt,
      }}
    >
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot must be used within a CopilotProvider");
  return ctx;
}
