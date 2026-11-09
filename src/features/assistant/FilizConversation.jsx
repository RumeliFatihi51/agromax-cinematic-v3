import { useLayoutEffect, useRef } from "react";
import { FilizAvatar } from "../../components/Brand";

/** @param {{messages: {question: string}[], renderAnswer: (message: any) => import("react").ReactNode, label?: string, userLabel?: string, empty?: string, pending?: {question: string, text: string}}} props */
export default function FilizConversation({
  messages, renderAnswer, label = "Filiz sohbeti", userLabel = "Sen",
  empty = "Filiz’e bir soru yaz veya bir öneri seç.", pending = undefined,
}) {
  const log = useRef(null);
  useLayoutEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, pending]);

  return (
    <div ref={log} className="filiz-chat-log" role="log" aria-label={label} tabIndex={0}>
      {!messages.length && !pending && <p className="filiz-chat-empty">{empty}</p>}
      {messages.map((message, index) => (
        <div className="filiz-chat-turn" key={index}>
          <div className="filiz-chat-question"><small>{userLabel}</small><p>{message.question}</p></div>
          <div className="filiz-chat-reply">
            <FilizAvatar size={28} />
            <div className="filiz-answer"><small>Filiz</small>{renderAnswer(message)}</div>
          </div>
        </div>
      ))}
      {pending && <div className="filiz-chat-turn">
        <div className="filiz-chat-question"><small>{userLabel}</small><p>{pending.question}</p></div>
        <div className="filiz-chat-reply">
          <FilizAvatar size={28} />
          <div className="filiz-answer"><small>Filiz</small><p>{pending.text}</p></div>
        </div>
      </div>}
    </div>
  );
}
