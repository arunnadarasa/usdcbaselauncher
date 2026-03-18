import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Index = () => {
  const [text, setText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const mouseTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const hasContent = text.length > 0;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setIsTyping(true);
    setShowStatus(false);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1500);
  }, []);

  const handleMouseMove = useCallback(() => {
    if (mouseTimeoutRef.current) clearTimeout(mouseTimeoutRef.current);
    if (!isTyping && hasContent) {
      setShowStatus(true);
      mouseTimeoutRef.current = setTimeout(() => {
        setShowStatus(false);
      }, 3000);
    }
  }, [isTyping, hasContent]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (mouseTimeoutRef.current) clearTimeout(mouseTimeoutRef.current);
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-background cursor-text"
      onMouseMove={handleMouseMove}
      onClick={() => textareaRef.current?.focus()}
    >
      <div className="mx-auto max-w-prose px-[15vw] pt-[33vh] pb-32">
        <motion.div
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            placeholder="Begin here."
            spellCheck={false}
            className="w-full min-h-[60vh] resize-none bg-transparent text-foreground placeholder:text-muted-foreground/40 focus:outline-none font-serif leading-[1.7] tracking-[-0.01em] caret-accent"
            style={{
              fontSize: "clamp(1.125rem, 1.2vw, 1.5rem)",
              textWrap: "pretty" as any,
            }}
          />
        </motion.div>
      </div>

      {/* Status bar */}
      <AnimatePresence>
        {(showStatus || !hasContent) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: hasContent ? 0.6 : 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 font-mono text-xs tracking-[0.08em] uppercase text-muted-foreground select-none"
          >
            {hasContent ? `${wordCount} word${wordCount !== 1 ? "s" : ""}` : "tabula"}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
