import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Image as ImageIcon, Loader2, Plus, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { generateImage, ImageRatio, ImageStyle } from "@/lib/supernovaChat";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  subscribeConversations,
  subscribeMessages,
  SupernovaConversation,
  SupernovaMessage,
} from "@/lib/supernovaStore";

const STYLES: { id: ImageStyle; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "realistic", label: "Realistic" },
  { id: "illustration", label: "Illustration" },
  { id: "3d", label: "3D" },
  { id: "anime", label: "Anime" },
  { id: "logo", label: "Logo" },
];

const RATIOS: ImageRatio[] = ["1:1", "16:9", "9:16", "3:2", "2:3", "4:3"];

const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function titleFromPrompt(prompt: string) {
  const title = prompt.trim().replace(/\s+/g, " ").slice(0, 48);
  return title || "Untitled image";
}

function downloadName(message: SupernovaMessage, index: number) {
  const stamp = Date.now();
  const slug = (message.prompt || "supernova").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "supernova"}-${stamp}-${index + 1}.png`;
}

export default function Supernova() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageStyle>("auto");
  const [ratio, setRatio] = useState<ImageRatio>("1:1");
  const [conversations, setConversations] = useState<SupernovaConversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<SupernovaMessage[]>([]);
  const [localMessages, setLocalMessages] = useState<SupernovaMessage[]>([]);
  const [busy, setBusy] = useState(false);

  const canGenerate = useMemo(() => prompt.trim().length > 0 && !busy, [busy, prompt]);
  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? "New image chat";
  const visibleMessages = useMemo(() => {
    const seen = new Set(messages.map((message) => message.id).filter(Boolean));
    return [...messages, ...localMessages.filter((message) => !message.id || !seen.has(message.id))];
  }, [localMessages, messages]);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setActiveId("");
      setMessages([]);
      return;
    }
    return subscribeConversations(user.uid, setConversations);
  }, [user]);

  useEffect(() => {
    if (!activeId && conversations.length) setActiveId(conversations[0].id);
  }, [activeId, conversations]);

  useEffect(() => {
    if (!user || !activeId) {
      setMessages([]);
      return;
    }
    return subscribeMessages(user.uid, activeId, setMessages);
  }, [activeId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages.length, busy]);

  const startChat = async () => {
    if (!user) return navigate("/auth");
    try {
      const id = await createConversation(user.uid, "New image chat");
      setActiveId(id);
      setLocalMessages([]);
    } catch (error: any) {
      console.error(error);
      setActiveId("");
      setLocalMessages([]);
      toast.error("Realtime storage is unavailable. Starting a local chat.");
    }
    setPrompt("");
  };

  const removeChat = async (id: string) => {
    if (!user) return;
    try {
      await deleteConversation(user.uid, id);
      if (activeId === id) {
        const next = conversations.find((c) => c.id !== id);
        setActiveId(next?.id ?? "");
      }
    } catch (error: any) {
      toast.error(error?.message ?? "Could not delete chat");
    }
  };

  const runGenerate = async () => {
    if (!user) return navigate("/auth");
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setPrompt("");

    try {
      let cid = activeId;
      const userMessage: SupernovaMessage = {
        id: localId(),
        role: "user",
        kind: "text",
        content: cleanPrompt,
        prompt: cleanPrompt,
      };
      let canPersist = true;

      try {
        if (!cid) {
          cid = await createConversation(user.uid, titleFromPrompt(cleanPrompt));
          setActiveId(cid);
        }
        await appendMessage(user.uid, cid, userMessage);
      } catch (storageError) {
        canPersist = false;
        console.error(storageError);
        setLocalMessages((prev) => [...prev, userMessage]);
        toast.error("Realtime chat storage failed. Generating locally.");
      }

      const images = await generateImage({
        prompt: cleanPrompt,
        style,
        ratio,
        count: 1,
        signal: controller.signal,
      });

      const assistantMessage: SupernovaMessage = {
        id: localId(),
        role: "assistant",
        kind: "image",
        content: `Generated ${ratio} ${style === "auto" ? "image" : style} image`,
        images: images.map((image) => image.url),
        prompt: cleanPrompt,
      };

      if (canPersist && cid) {
        try {
          await appendMessage(user.uid, cid, assistantMessage);
        } catch (storageError) {
          console.error(storageError);
          setLocalMessages((prev) => [...prev, userMessage, assistantMessage]);
          toast.error("Image generated, but realtime storage failed.");
        }
      } else {
        setLocalMessages((prev) => [...prev, assistantMessage]);
      }
      toast.success("Image generated");
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error(error);
        toast.error(error?.message ?? "Image generation failed");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const stopGenerate = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-zinc-400 hover:text-white" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-cyan-500 text-zinc-950">
                  <Sparkles className="h-4 w-4" />
                </span>
                <h1 className="truncate text-sm font-semibold">Supernova</h1>
              </div>
            </div>
          </div>
          <Button onClick={startChat} size="sm" className="rounded-md bg-white text-zinc-950 hover:bg-zinc-200">
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      </header>

      <main className="container grid min-h-[calc(100vh-3.5rem)] gap-4 py-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-md border border-white/10 bg-white/[0.03] lg:min-h-[calc(100vh-5.5rem)]">
          <div className="flex items-center justify-between border-b border-white/10 p-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Realtime chats</p>
            <ImageIcon className="h-4 w-4 text-zinc-500" />
          </div>
          <ScrollArea className="h-28 lg:h-[calc(100vh-9rem)]">
            <div className="flex gap-2 p-3 lg:flex-col">
              {conversations.length ? (
                conversations.map((chat) => (
                  <div
                    key={chat.id}
                    className={cn(
                      "group flex min-w-[220px] items-center gap-1 rounded-md border p-1 transition lg:min-w-0",
                      activeId === chat.id
                        ? "border-cyan-400/50 bg-cyan-400/10"
                        : "border-white/10 bg-zinc-950/40 hover:bg-white/5",
                    )}
                  >
                    <button
                      onClick={() => setActiveId(chat.id)}
                      className={cn(
                        "min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm",
                        activeId === chat.id ? "text-white" : "text-zinc-400 group-hover:text-white",
                      )}
                    >
                      {chat.title}
                    </button>
                    <button
                      onClick={() => removeChat(chat.id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-500 opacity-100 hover:bg-white/10 hover:text-white lg:opacity-0 lg:group-hover:opacity-100"
                      aria-label="Delete chat"
                      title="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-1 py-4 text-sm text-zinc-500">No image chats yet.</div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <section className="flex min-h-[calc(100vh-12rem)] flex-col rounded-md border border-white/10 bg-white/[0.03] lg:min-h-[calc(100vh-5.5rem)]">
          <div className="border-b border-white/10 p-4">
            <p className="truncate text-sm font-medium">{activeTitle}</p>
            <p className="mt-1 text-xs text-zinc-500">Mistral image generation with synced prompt history.</p>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-5 p-4 sm:p-6">
              {visibleMessages.length ? (
                visibleMessages.map((message) => (
                  <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[92%] rounded-md border p-3 sm:max-w-[760px]",
                        message.role === "user" ? "border-cyan-400/30 bg-cyan-400/10" : "border-white/10 bg-zinc-950/70",
                      )}
                    >
                      {message.kind === "image" && message.images?.length ? (
                        <div className="grid gap-3">
                          {message.images.map((src, index) => (
                            <div key={`${message.id}-${index}`} className="overflow-hidden rounded-md border border-white/10 bg-black">
                              <img src={src} alt={message.prompt || "Generated image"} className="max-h-[70vh] w-full object-contain" />
                              <div className="flex items-center justify-between gap-3 border-t border-white/10 p-3">
                                <p className="line-clamp-2 text-xs text-zinc-400">{message.prompt}</p>
                                <a
                                  href={src}
                                  download={downloadName(message, index)}
                                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
                                  title="Download"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">{message.content}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid min-h-[42vh] place-items-center text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-white/10 bg-zinc-950">
                      <Wand2 className="h-5 w-5 text-cyan-300" />
                    </div>
                    <p className="mt-4 text-sm font-medium">Generate from one prompt</p>
                    <p className="mt-2 text-sm text-zinc-500">Your prompts and results sync into realtime Supernova chats.</p>
                  </div>
                </div>
              )}
              {busy && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-md border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                    Generating image
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-white/10 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {STYLES.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setStyle(item.id)}
                  className={cn(
                    "h-8 rounded-md border px-3 text-xs transition",
                    style === item.id ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-zinc-400 hover:bg-white/5",
                  )}
                >
                  {item.label}
                </button>
              ))}
              <div className="h-8 w-px bg-white/10" />
              {RATIOS.map((item) => (
                <button
                  key={item}
                  onClick={() => setRatio(item)}
                  className={cn(
                    "h-8 rounded-md border px-3 font-mono text-xs transition",
                    ratio === item ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100" : "border-white/10 text-zinc-400 hover:bg-white/5",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    runGenerate();
                  }
                }}
                placeholder="Describe the image you want..."
                className="min-h-12 flex-1 resize-none rounded-md border-white/10 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
              {busy ? (
                <Button onClick={stopGenerate} className="h-auto w-12 rounded-md border border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25" aria-label="Stop">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </Button>
              ) : (
                <Button onClick={runGenerate} disabled={!canGenerate} className="h-auto w-12 rounded-md bg-cyan-400 text-zinc-950 hover:bg-cyan-300" aria-label="Generate">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
