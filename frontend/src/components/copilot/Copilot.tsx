import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CopilotContextValue } from "../../copilot/CopilotContext";

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a8 8 0 1 1-3.5-6.6M21 12l-4-1 1-4 3 5Z"
      />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

// Purely presentational — driven entirely by `value`, not tied to any one
// context. The tenant app passes CopilotContext's value (see Header.tsx);
// the admin panel passes AdminCopilotContext's value instead (see
// AdminPanelPage.tsx). Same component either way — the shell (.copilot-drawer
// and everything in it) is never duplicated, only the state source changes.
export function Copilot({ value }: { value: CopilotContextValue }) {
  const { t } = useTranslation();
  const {
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
  } = value;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="header-icon-wrap" ref={containerRef}>
      <button className="icon-btn icon-btn-accent" title={t("copilot.openButton")} onClick={toggleOpen}>
        <ChatIcon />
      </button>

      {open && (
        <div className="copilot-drawer">
          <div className="copilot-drawer-header">
            <span className="copilot-drawer-title">{t("copilot.title")}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="icon-btn"
                title={t("copilot.history")}
                onClick={() => setShowHistory((s) => !s)}
              >
                <HistoryIcon />
              </button>
              <button
                className="icon-btn"
                title={t("copilot.newConversation")}
                onClick={handleNewConversation}
              >
                <PlusIcon />
              </button>
            </div>

            {showHistory && (
              <div className="dropdown-panel">
                <div className="dropdown-title">{t("copilot.history")}</div>
                {conversations.length === 0 ? (
                  <p className="text-muted dropdown-empty">{t("copilot.historyEmpty")}</p>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.id}
                      className="dropdown-item copilot-history-item"
                      onClick={() => selectConversation(c.id)}
                    >
                      <span>{c.title || t("copilot.newConversation")}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="copilot-messages">
            {messages.length === 0 && <p className="text-muted copilot-empty">{t("copilot.emptyState")}</p>}
            {messages.map((m) => (
              <div key={m.id} className={`copilot-message ${m.role}`}>
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
              placeholder={t("copilot.placeholder")}
              rows={2}
            />
            <button className="btn btn-primary" onClick={handleSend} disabled={sending || !input.trim()}>
              {sending ? t("copilot.sending") : t("copilot.send")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
