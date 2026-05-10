import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Image as ImageIcon,
  Loader2,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
  Wand2,
  X,
  StopCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer, DrawerContent, DrawerTrigger,
} from "@/components/ui/drawer";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  renameConversation,
  subscribeConversations,
  subscribeMessages,
  SupernovaConversation,
  SupernovaMessage,
} from "@/lib/supernovaStore";
import { isOpenRouterConfigured } from "@/lib/env";
import {
  ChatMessage,
  ChatPart,
  detectImageIntent,
  fileToDataUrl,
  generateImage,
  ImageRatio,
  ImageStyle,
  streamChat,
  chatOnce,
} from "@/lib/supernovaChat";

const STYLES: { id: ImageStyle; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "illustration", label: "Illustration" },
  { id: "3d", label: "3D" },
  { id: "pixel", label: "Pixel" },
  { id: "logo", label: "Logo" },
  { id: "sketch", label: "Sketch" },
  { id: "watercolor", label: "Watercolor" },
  { id: "cyberpunk", label: "Cyberpunk" },
];

const RATIOS: ImageRatio[] = ["1:1", "16:9", "9:16", "3:2", "2:3", "4:3"];

const SUGGESTED = [
  { icon: "🖼️", text: "Generate a cinematic poster of an astronaut on a neon planet", image: true },
  { icon: "🎨", text: "Draw a watercolor of a Japanese garden in autumn", image: true },
  { icon: "💡", text: "Explain quantum computing like I'm 10 years old", image: false },
  { icon: "📝", text: "Write a creative short story about time travel", image: false },
];

function autoTitle(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 48 ? t.slice(0, 45) + "…" : t || "New chat";
}

export default function Supernova() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [convos, setConvos] = useState<SupernovaConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupernovaMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]); // data URLs
  const [imageMode, setImageMode] = useState(false);
  const [style, setStyle] = useState<ImageStyle>("auto");
  const [ratio, setRatio] = useState<ImageRatio>("1:1");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [renameOpen, setRenameOpen] = useState<{ id: string; title: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Subscribe to conversations
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeConversations(user.uid, (rows) => {
      setConvos(rows);
      if (!activeId && rows.length > 0) setActiveId(rows[0].id);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Subscribe to messages of active conversation
  useEffect(() => {
    if (!user || !activeId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeMessages(user.uid, activeId, setMessages);
    return unsub;
  }, [user, activeId]);

  // ── Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamText]);

  // ── Mobile: collapse sidebar
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  // On mobile, open drawer automatically when entering a convo
  useEffect(() => {
    if (isMobile && activeId) setDrawerOpen(true);
  }, [isMobile, activeId]);

  const activeConvo = useMemo(
    () => convos.find((c) => c.id === activeId) ?? null,
    [convos, activeId],
  );

  const newChat = async () => {
    if (!user) return;
    const id = await createConversation(user.uid, "New chat");
    setActiveId(id);
    setMessages([]);
    setDraft("");
    setAttachments([]);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const onAttach = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const next: string[] = [];
      for (const f of Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 4)) {
        if (f.size > 8 * 1024 * 1024) {
          toast.error(`${f.name} is larger than 8 MB`);
          continue;
        }
        next.push(await fileToDataUrl(f));
      }
      setAttachments((prev) => [...prev, ...next].slice(0, 4));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read file");
    }
  };

  const removeAttachment = (i: number) =>
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  const stop = () => {
    abortRef.current?.abort();
  };

  const send = async () => {
    if (!user) return;
    const text = draft.trim();
    if (busy) return;
    if (!text && attachments.length === 0) return;

    const attachEditDefault =
      "Use the attached image(s) as reference. Generate a polished result matching the selected style and aspect ratio.";
    const intent = imageMode
      ? { isImage: true, prompt: text || (attachments.length ? attachEditDefault : "") }
      : detectImageIntent(text);

    if (!intent.isImage && !isOpenRouterConfigured) {
      toast.error("Configure VITE_OPENROUTER_API_KEY for Supernova chat.");
      return;
    }

    // ensure conversation exists
    let cid = activeId;
    if (!cid) {
      cid = await createConversation(user.uid, autoTitle(text || "Image"));
      setActiveId(cid);
    } else if (messages.length === 0 && text) {
      renameConversation(user.uid, cid, autoTitle(text)).catch(() => {});
    }

    const userImages = attachments.slice();

    // Persist user message
    await appendMessage(user.uid, cid, {
      role: "user",
      kind: intent.isImage ? "image" : "text",
      content: text || (intent.isImage ? "(image request)" : "(attachment)"),
      images: userImages,
      prompt: intent.isImage ? intent.prompt : undefined,
    });

    setDraft("");
    setAttachments([]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (intent.isImage) {
        // ── Image generation flow ──
        const placeholderText = `Generating · ${style} · ${ratio}`;
        const images = await generateImage({
          prompt: intent.prompt || "an image",
          style,
          ratio,
          count: 1,
          signal: controller.signal,
          referenceDataUrls: userImages.length ? userImages : undefined,
        });
        let caption = "";
        if (isOpenRouterConfigured) {
          try {
            caption = await chatOnce(
              [
                {
                  role: "system",
                  content:
                    "You are Supernova, a concise image studio assistant. Reply in 1-2 sentences describing what was generated.",
                },
                {
                  role: "user",
                  content: `Image prompt: "${intent.prompt}". Style: ${style}. Ratio: ${ratio}.`,
                },
              ],
              { signal: controller.signal, maxTokens: 120 },
            );
          } catch {
            /* ignore */
          }
        }

        await appendMessage(user.uid, cid, {
          role: "assistant",
          kind: "image",
          content: caption || `Here is your ${style} image.`,
          images: images.map((i) => i.url),
          prompt: intent.prompt,
        });
        toast.success("Image ready");
        void placeholderText;
      } else {
        // ── Text / vision chat flow with streaming ──
        const history: ChatMessage[] = [
          {
            role: "system",
            content:
              "You are Supernova, a friendly multimodal assistant. Answer clearly using markdown. When the user attaches images, describe and reason about them.",
          },
          ...messages.map<ChatMessage>((m) => {
            if (m.role === "assistant") {
              return { role: "assistant", content: m.content };
            }
            const parts: ChatPart[] = [];
            if (m.content) parts.push({ type: "text", text: m.content });
            (m.images ?? []).forEach((url) => parts.push({ type: "image_url", image_url: { url } }));
            return { role: "user", content: parts.length > 1 || (m.images && m.images.length) ? parts : m.content };
          }),
        ];

        const parts: ChatPart[] = [];
        if (text) parts.push({ type: "text", text });
        userImages.forEach((url) => parts.push({ type: "image_url", image_url: { url } }));
        if (!text && userImages.length) {
          parts.unshift({ type: "text", text: "Reply helpfully about the attached image(s)." });
        }
        history.push({
          role: "user",
          content: parts.length > 1 || userImages.length ? parts : text || "Hello",
        });

        setStreamText("▍");
        const final = await streamChat(
          history,
          (_d, full) => setStreamText(full + "▍"),
          { signal: controller.signal, maxTokens: 2048 },
        );
        setStreamText("");
        await appendMessage(user.uid, cid, {
          role: "assistant",
          kind: "text",
          content: final || "(empty response)",
        });
      }
    } catch (e: any) {
      const aborted = /aborted/i.test(String(e?.message)) || e?.name === "AbortError";
      if (!aborted) {
        console.error(e);
        toast.error(e?.message ?? "Something went wrong");
        await appendMessage(user.uid, cid, {
          role: "assistant",
          kind: "text",
          content: `⚠️ ${e?.message ?? "Failed to respond"}`,
        });
      } else {
        toast.message("Stopped");
      }
    } finally {
      setBusy(false);
      setStreamText("");
      abortRef.current = null;
    }
  };

  const regenerateImage = async (msg: SupernovaMessage) => {
    if (!user || !activeId || !msg.prompt) return;
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const images = await generateImage({
        prompt: msg.prompt,
        style,
        ratio,
        signal: controller.signal,
      });
      await appendMessage(user.uid, activeId, {
        role: "assistant",
        kind: "image",
        content: `Re-rolled with ${style} · ${ratio}`,
        images: images.map((i) => i.url),
        prompt: msg.prompt,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const removeChat = async (id: string) => {
    if (!user) return;
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    await deleteConversation(user.uid, id);
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    toast.success("Deleted");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <Button onClick={() => navigate("/auth")}>Sign in to use Supernova</Button>
      </div>
    );
  }

  /* ── Build chat panel (reused in both desktop & mobile drawer) ── */
  const chatPanel = (
    <div className="flex flex-col h-full bg-[#131314]">
      {!isOpenRouterConfigured && (
        <div className="shrink-0 mx-3 mt-3 px-3 py-2 rounded-xl border border-amber-500/35 bg-amber-500/10 text-[11px] text-amber-100/95 leading-snug">
          Set <span className="font-mono text-amber-200">VITE_OPENROUTER_API_KEY</span> for chat + image generation.
        </div>
      )}
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
          {messages.length === 0 && !streamText ? (
            <div className="flex flex-col items-center justify-center text-center pt-12 pb-8">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-xl shadow-purple-500/25">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                Hello{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
              </h2>
              <p className="text-zinc-500 mt-2 text-sm">How can I help you today?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-xl">
                {SUGGESTED.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => { setDraft(s.text); if (s.image) setImageMode(true); }}
                    className="text-left p-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] transition-all"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{s.icon}</span>
                      <span className="text-sm text-zinc-300 leading-snug">{s.text}</span>
                    </div>
                    {s.image && (
                      <span className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20">Image</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} msg={m} onRerollImage={() => regenerateImage(m)} />)
          )}
          {streamText && (
            <MessageBubble msg={{ role: "assistant", kind: "text", content: streamText }} streaming />
          )}
          {busy && !streamText && (
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="bg-[#131314] pb-safe">
        <div className="max-w-2xl mx-auto px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setImageMode((v) => !v)}
              className={`text-[11px] font-mono px-2.5 py-1 rounded-md border transition inline-flex items-center gap-1.5 ${
                imageMode ? "bg-fuchsia-500/15 border-fuchsia-400/40 text-fuchsia-200" : "border-white/10 text-zinc-400 hover:text-white hover:border-white/30"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {imageMode ? "🎨 Image" : "💬 Chat"}
            </button>
            {imageMode && (
              <>
                <select value={style} onChange={(e) => setStyle(e.target.value as ImageStyle)} className="text-[11px] bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-zinc-200">
                  {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <select value={ratio} onChange={(e) => setRatio(e.target.value as ImageRatio)} className="text-[11px] bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-zinc-200 font-mono">
                  {RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </>
            )}
          </div>
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachments.map((src, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/10">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeAttachment(i)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 bg-[#1e1f20] rounded-2xl border border-white/[0.08] focus-within:border-purple-400/40 px-3 py-2 transition-all">
            <label className="cursor-pointer text-zinc-400 hover:text-white p-1 shrink-0">
              <Paperclip className="w-4 h-4" />
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onAttach(e.target.files); e.currentTarget.value = ""; }} />
            </label>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={imageMode ? "Describe the image…" : "Message Supernova…"}
              rows={1}
              className="flex-1 min-h-[28px] max-h-32 resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm text-zinc-100 placeholder:text-zinc-500 px-1 py-0.5"
            />
            {busy ? (
              <Button onClick={stop} size="icon" className="bg-red-500/80 hover:bg-red-500 text-white rounded-full shrink-0 w-8 h-8"><StopCircle className="w-4 h-4" /></Button>
            ) : (
              <Button onClick={send} disabled={!draft.trim() && attachments.length === 0} size="icon" className="bg-gradient-to-br from-blue-500 to-purple-600 hover:opacity-90 text-white rounded-full shrink-0 w-8 h-8 disabled:opacity-30"><Send className="w-4 h-4" /></Button>
            )}
          </div>
          <p className="text-[10px] text-zinc-600 text-center">
            Supernova · OpenRouter chat + image (e.g. gpt-5.4-image-2) · or NVIDIA / fallback
          </p>
        </div>
      </div>
    </div>
  );

  /* ── Mobile layout: drawer-based ── */
  if (isMobile) {
    return (
      <div className="h-screen flex flex-col bg-[#131314] text-zinc-100">
        {/* Top bar */}
        <header className="h-12 px-4 flex items-center gap-2 border-b border-white/[0.06] shrink-0">
          <Link to="/" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="flex items-center gap-2 flex-1">
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="font-semibold text-sm">Supernova</span>
          </div>
          <Button onClick={newChat} size="icon" variant="ghost" className="text-zinc-400 hover:text-white w-8 h-8">
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
        </header>

        {/* Conversation list */}
        <div className="flex-1 overflow-auto px-3 py-3 space-y-1">
          {convos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-xl shadow-purple-500/25">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">Welcome to Supernova</h2>
              <p className="text-zinc-500 text-sm mt-2">Start a new chat to begin</p>
              <Button onClick={newChat} className="mt-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full gap-2">
                <MessageSquarePlus className="w-4 h-4" /> New chat
              </Button>
            </div>
          ) : (
            convos.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveId(c.id); setDrawerOpen(true); }}
                className={`w-full text-left px-4 py-3 rounded-2xl flex items-center gap-3 transition ${
                  activeId === c.id ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400/30 to-purple-500/30 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-purple-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate text-zinc-200">{c.title}</p>
                  <p className="text-[10px] text-zinc-500">Tap to open</p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Drawer for chat */}
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="h-[92vh] bg-[#131314] border-white/[0.08]">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
              <button onClick={() => setDrawerOpen(false)} className="text-zinc-400 hover:text-white p-1"><ArrowLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium truncate flex-1 text-zinc-200">{activeConvo?.title ?? "Chat"}</span>
            </div>
            <div className="flex-1 overflow-hidden">
              {chatPanel}
            </div>
          </DrawerContent>
        </Drawer>

        {/* Rename dialog */}
        <Dialog open={!!renameOpen} onOpenChange={(o) => !o && setRenameOpen(null)}>
          <DialogContent className="bg-[#1e1f20] border-white/[0.08] text-zinc-100">
            <DialogHeader><DialogTitle>Rename chat</DialogTitle></DialogHeader>
            <Input value={renameOpen?.title ?? ""} onChange={(e) => setRenameOpen((r) => (r ? { ...r, title: e.target.value } : r))} className="bg-[#131314] border-white/[0.08] rounded-xl" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRenameOpen(null)}>Cancel</Button>
              <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 rounded-full" onClick={async () => { if (!user || !renameOpen) return; await renameConversation(user.uid, renameOpen.id, renameOpen.title.trim() || "Untitled"); setRenameOpen(null); toast.success("Renamed"); }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  /* ── Desktop layout (unchanged) ── */
  return (
    <div className="h-screen flex bg-[#131314] text-zinc-100">
      {/* ─── Sidebar ─── */}
      <aside
        className={`${
          sidebarOpen ? "w-72" : "w-0"
        } shrink-0 transition-[width] duration-200 overflow-hidden border-r border-white/[0.06] bg-[#1e1f20] flex flex-col`}
      >
        <div className="p-3 flex items-center gap-2 border-b border-white/5">
          <Link to="/" className="text-zinc-400 hover:text-white" aria-label="Home">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="font-semibold text-base">Supernova</span>
          </div>
        </div>

        <div className="p-3">
          <Button
            onClick={newChat}
            className="w-full justify-start gap-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-100 rounded-full h-10"
          >
            <MessageSquarePlus className="w-4 h-4" /> New chat
          </Button>
        </div>

        {convos.length > 0 && (
          <div className="px-3 pb-1 pt-2 text-[11px] font-medium text-zinc-500">
            Recent
          </div>
        )}

        <nav className="flex-1 overflow-auto px-2 space-y-0.5">
          {convos.length === 0 ? (
            <p className="text-xs text-zinc-500 px-2 py-4 text-center">
              Your chats will appear here
            </p>
          ) : (
            convos.map((c) => (
              <div
                key={c.id}
                className={`group rounded-full flex items-center gap-1 ${
                  activeId === c.id ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                }`}
              >
                <button
                  onClick={() => setActiveId(c.id)}
                  className="flex-1 text-left text-sm px-3 py-2 truncate text-zinc-200"
                >
                  {c.title}
                </button>
                <button
                  onClick={() => setRenameOpen({ id: c.id, title: c.title })}
                  className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white p-1.5"
                  title="Rename"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeChat(c.id)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 p-1.5 mr-1"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </nav>

        <div className="p-3 border-t border-white/[0.06] flex items-center gap-2">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full ring-2 ring-white/10" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
              {(user.displayName || user.email || "U")[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs truncate">{user.displayName || user.email}</p>
            <button
              onClick={() => signOut().then(() => navigate("/"))}
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-12 px-4 flex items-center gap-2 border-b border-white/[0.06]">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="p-2 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-medium truncate flex-1 text-zinc-300">
            {activeConvo?.title ?? "Supernova"}
          </h1>
        </header>

        {chatPanel}
      </main>

      <Dialog open={!!renameOpen} onOpenChange={(o) => !o && setRenameOpen(null)}>
        <DialogContent className="bg-[#1e1f20] border-white/[0.08] text-zinc-100">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameOpen?.title ?? ""}
            onChange={(e) =>
              setRenameOpen((r) => (r ? { ...r, title: e.target.value } : r))
            }
            className="bg-[#131314] border-white/[0.08] rounded-xl"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(null)}>Cancel</Button>
            <Button
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 rounded-full"
              onClick={async () => {
                if (!user || !renameOpen) return;
                await renameConversation(user.uid, renameOpen.id, renameOpen.title.trim() || "Untitled");
                setRenameOpen(null);
                toast.success("Renamed");
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────── Message bubble ───────────── */

function MessageBubble({
  msg,
  streaming,
  onRerollImage,
}: {
  msg: SupernovaMessage;
  streaming?: boolean;
  onRerollImage?: () => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold ${
          isUser
            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
            : "bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/20"
        }`}
      >
        {isUser ? "U" : <Sparkles className="w-3.5 h-3.5" />}
      </div>

      <div className={`max-w-[85%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {/* Attached / generated images */}
        {msg.images && msg.images.length > 0 && (
          <div className={`grid gap-2 ${msg.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {msg.images.map((src, i) => (
              <div
                key={i}
                className="relative group rounded-xl overflow-hidden border border-white/10 bg-zinc-900"
              >
                <img src={src} alt="" className="w-full h-auto max-h-[420px] object-cover block" />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <a
                    href={src}
                    download={`supernova-${i}.jpg`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-black/70 backdrop-blur rounded-md text-white hover:bg-black"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {!isUser && msg.kind === "image" && onRerollImage && (
                    <button
                      onClick={onRerollImage}
                      className="p-1.5 bg-black/70 backdrop-blur rounded-md text-white hover:bg-black"
                      title="Re-roll"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Text content */}
        {msg.content && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isUser
                ? "bg-blue-500/15 text-blue-100 border border-blue-500/20"
                : "bg-transparent text-zinc-200"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-pre:my-2 prose-pre:bg-black/30 prose-pre:rounded-xl prose-code:text-purple-300">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            )}
            {streaming && <span className="text-blue-400 animate-pulse">▍</span>}
          </div>
        )}
      </div>
    </div>
  );
}
