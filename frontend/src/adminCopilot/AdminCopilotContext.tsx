import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api/client";
import type { CopilotContextValue } from "../copilot/CopilotContext";
import type { CopilotConversation, CopilotMessage } from "../types";

// Same shape as CopilotContext (frontend/src/copilot/CopilotContext.tsx) —
// reused so the shared <Copilot> shell component works with either as its
// `value` prop — but backed by /admin/copilot/* (admin_copilot_* tables,
// admin_user_id) instead of /copilot/* (copilot_* tables, tenant_id).
// Completely separate provider, never nested inside CopilotProvider: an
// admin session has no tenant_id/user_id to begin with, so there's nothing
// to share even if they were combined.
const AdminCopilotContext = createContext<CopilotContextValue | null>(null);

export function AdminCopilotProvider({ children }: { children: ReactNode }) {
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
    const list = await api.get<CopilotMessage[]>(`/admin/copilot/conversations/${id}/messages`);
    setMessages(list);
  }

  async function toggleOpen() {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    const list = await api.get<CopilotConversation[]>("/admin/copilot/conversations");
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
        const conversation = await api.post<CopilotConversation>("/admin/copilot/conversations");
        conversationId = conversation.id;
        setActiveConversationId(conversationId);
        setConversations((prev) => [conversation, ...prev]);
      }

      const result = await api.post<{ conversation: CopilotConversation; message: CopilotMessage }>(
        `/admin/copilot/conversations/${conversationId}/messages`,
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
      const isNotConfigured = err instanceof ApiError && err.message.includes("no_script_credential");
      setError(isNotConfigured ? t("copilot.adminNotConfigured") : t("copilot.error"));
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
    <AdminCopilotContext.Provider
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
    </AdminCopilotContext.Provider>
  );
}

export function useAdminCopilot(): CopilotContextValue {
  const ctx = useContext(AdminCopilotContext);
  if (!ctx) throw new Error("useAdminCopilot must be used within AdminCopilotProvider");
  return ctx;
}
