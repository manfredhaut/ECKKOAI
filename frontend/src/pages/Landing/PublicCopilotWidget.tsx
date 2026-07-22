import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";

interface PublicCopilotMessage {
  role: "user" | "assistant";
  content: string;
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a8 8 0 1 1-3.5-6.6M21 12l-4-1 1-4 3 5Z"
      />
    </svg>
  );
}

// Stateless demo copilot for anonymous visitors on the public landing page —
// no CopilotContext, no persisted history (that's the authenticated
// in-app copilot, see components/copilot/Copilot.tsx). Every send round-trips
// the whole local history to POST /public/copilot/messages.
export function PublicCopilotWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PublicCopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setError(null);

    const nextHistory = [...messages, { role: "user" as const, content }];
    setMessages(nextHistory);
    setSending(true);
    try {
      const result = await api.post<{ content: string }>("/public/copilot/messages", {
        history: nextHistory,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: result.content }]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t("landing.copilot.rateLimited"));
      } else if (err instanceof ApiError && err.message.includes("no_script_credential")) {
        setError(t("landing.copilot.notConfigured"));
      } else {
        setError(t("landing.copilot.error"));
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="landing-copilot-wrap" ref={containerRef}>
      <button
        className="btn btn-primary landing-copilot-launcher"
        title={t("landing.copilot.openButton")}
        onClick={() => setOpen((o) => !o)}
      >
        <ChatIcon />
        {t("landing.copilot.openButton")}
      </button>

      {open && (
        <div className="copilot-drawer">
          <div className="copilot-drawer-header">
            <span className="copilot-drawer-title">{t("landing.copilot.title")}</span>
          </div>

          <div className="copilot-messages">
            {messages.length === 0 && <p className="text-muted copilot-empty">{t("landing.copilot.emptyState")}</p>}
            {messages.map((m, i) => (
              <div key={i} className={`copilot-message ${m.role}`}>
                {m.content}
              </div>
            ))}
            {error && <p style={{ color: "var(--color-tertiary)", fontSize: 13 }}>{error}</p>}
            <div ref={messagesEndRef} />
          </div>

          <div className="copilot-input-row">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("landing.copilot.placeholder")}
              rows={2}
            />
            <button className="btn btn-primary" onClick={handleSend} disabled={sending || !input.trim()}>
              {sending ? t("landing.copilot.sending") : t("landing.copilot.send")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
