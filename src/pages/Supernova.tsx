import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Download,
  ImagePlus,
  Loader2,
  Menu,
  MessageSquareText,
  PanelLeft,
  Plus,
  SendHorizontal,
  Sparkles,
  StopCircle,
  Trash2,
  User2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
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
} from "@/lib/supernovaChat";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  type SupernovaConversation,
  type SupernovaMessage,
  subscribeConversations,
  subscribeMessages,
} from "@/lib/supernovaStore";
import { cn } from "@/lib/utils";

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
const IMAGE_COUNTS = [1, 2, 4] as const;

const QUICK_ACTIONS = [
  {
    title: "Cinematic room redesign",
    subtitle: "Image edit with warm premium lighting",
    prompt: "/image redesign this living room into a warm cinematic luxury space with walnut, brass, soft ambient lighting",
  },
  {
    title: "Landing page art direction",
    subtitle: "Chat prompt for sharper UI thinking",
    prompt: "Design a premium SaaS landing page direction with strong hierarchy, modular cards, editorial typography, and conversion-focused sections.",
  },
  {
    title: "Product hero renders",
    subtitle: "Generate multiple image variations",
    prompt: "/image futuristic wearable product hero shot on obsidian stone with amber lighting and soft reflections",
  },
];

const FEATURE_TILES = [
  { kicker: "AI Space", title: "Designer Pro", body: "Moodboards, interiors, campaigns, and polished image compositions." },
  { kicker: "Chat Studio", title: "Think Better", body: "Context-aware replies, streaming output, and image-assisted reasoning." },
  { kicker: "Realtime Sync", title: "Firebase Live", body: "Conversations stay in sync across mobile, desktop, and future sessions." },
];

type ComposerMode = "chat" | "image";

type PendingAssistant = {
  kind: "text" | "image";
  content: string;
  images?: string[];
  prompt?: string;
};

function getDisplayName(emailOrName: string | null | undefined) {
  if (!emailOrName) return "Explorer";
  const value = emailOrName.includes("@") ? emailOrName.split("@")[0] : emailOrName;
  return value
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleFromPrompt(prompt: string, mode: ComposerMode) {
  const clean = prompt.replace(/^\/(image|img|draw|generate)\s+/i, "").trim();
  if (!clean) return mode === "image" ? "Image studio" : "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42).trim()}...` : clean;
}

function formatTimestamp(value: unknown) {
  const raw = value as { toDate?: () => Date } | undefined;
  const date = raw?.toDate?.();
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function buildUserChatContent(text: string, images: string[]) {
  if (!images.length) return text;
  const parts: ChatPart[] = [];
  if (text.trim()) parts.push({ type: "text", text });
  for (const url of images.slice(0, 4)) parts.push({ type: "image_url", image_url: { url } });
  return parts.length === 1 && parts[0].type === "text" ? text : parts;
}

function toChatHistory(history: SupernovaMessage[], currentText: string, currentImages: string[]): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are Supernova, a premium multimodal AI assistant inside Matrixbook. Be concise, helpful, and visually aware. When users ask for design, UI, code, branding, or layout advice, respond like a senior product designer and engineer. If images are attached, use them as real context instead of ignoring them.",
    },
  ];

  for (const item of history.slice(-18)) {
    if (item.role === "assistant") {
      messages.push({
        role: "assistant",
        content: item.content || (item.prompt ? `Generated images for: ${item.prompt}` : "Done."),
      });
      continue;
    }

    const body = item.content || item.prompt || "";
    messages.push({
      role: "user",
      content: buildUserChatContent(body, item.images ?? []),
    });
  }

  messages.push({
    role: "user",
    content: buildUserChatContent(currentText, currentImages),
  });

  return messages;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

function ShellBackground() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(133,92,248,0.32),transparent_26%),radial-gradient(circle_at_20%_80%,rgba(255,90,31,0.22),transparent_20%),radial-gradient(circle_at_80%_55%,rgba(255,171,73,0.22),transparent_22%),linear-gradient(180deg,#08080b_0%,#0f0b0d_48%,#08080b_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(120,119,198,0.26),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(circle_at_bottom,rgba(255,88,28,0.18),transparent_60%)]" />
    </>
  );
}

function ConversationRail(props: {
  currentId: string | null;
  conversations: SupernovaConversation[];
  onCreate: () => void;
  onDelete: (cid: string) => void;
  onSelect: (cid: string) => void;
  userLabel: string;
}) {
  const { currentId, conversations, onCreate, onDelete, onSelect, userLabel } = props;

  return (
    <div className="flex h-full flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
      <div className="flex items-center justify-between rounded-[1.6rem] border border-white/10 bg-black/25 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Supernova</p>
          <p className="mt-1 text-lg font-semibold text-white">{userLabel}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,168,76,0.95),rgba(255,90,31,0.92)_40%,rgba(17,17,17,0.9)_78%)] shadow-[0_12px_32px_rgba(255,111,31,0.22)]">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
      </div>

      <Button
        onClick={onCreate}
        className="mt-4 h-14 justify-start rounded-[1.4rem] border border-white/10 bg-white/[0.06] px-4 text-white shadow-none hover:bg-white/[0.1]"
      >
        <Plus className="mr-2 h-4 w-4" />
        New conversation
      </Button>

      <div className="mt-5 flex items-center justify-between px-1">
        <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">Realtime threads</p>
        <p className="text-xs text-white/42">{conversations.length}</p>
      </div>

      <ScrollArea className="mt-3 min-h-0 flex-1 pr-2">
        <div className="space-y-2">
          {conversations.map((item) => {
            const active = item.id === currentId;
            return (
              <div
                key={item.id}
                className={cn(
                  "group rounded-[1.4rem] border px-3 py-3 transition",
                  active
                    ? "border-white/20 bg-white/[0.11] shadow-[0_10px_35px_rgba(255,102,31,0.12)]"
                    : "border-white/8 bg-black/20 hover:border-white/14 hover:bg-white/[0.06]",
                )}
              >
                <button className="w-full text-left" onClick={() => onSelect(item.id)}>
                  <p className="line-clamp-1 text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-1 text-xs text-white/45">{formatTimestamp(item.updatedAt) || "Synced now"}</p>
                </button>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => onDelete(item.id)}
                    className="rounded-xl border border-white/8 p-2 text-white/40 transition hover:border-white/16 hover:text-white"
                    aria-label={`Delete ${item.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {!conversations.length && (
            <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/45">
              Start a new chat or image thread. Messages will sync to Firebase in realtime.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MessageBubble(props: {
  item: SupernovaMessage;
  isUser: boolean;
}) {
  const { item, isUser } = props;
  const hasImages = !!item.images?.length;

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,168,76,0.95),rgba(255,90,31,0.92)_40%,rgba(17,17,17,0.9)_78%)] shadow-[0_10px_32px_rgba(255,111,31,0.2)]">
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={cn("max-w-[86%] sm:max-w-[76%]", isUser && "order-first")}>
        <div
          className={cn(
            "rounded-[1.8rem] border px-4 py-3 shadow-[0_14px_45px_rgba(0,0,0,0.22)] backdrop-blur-xl",
            isUser
              ? "border-white/10 bg-white/[0.08] text-white"
              : "border-[rgba(255,164,84,0.18)] bg-[linear-gradient(180deg,rgba(255,144,56,0.16),rgba(255,97,31,0.08))] text-white/92",
          )}
        >
          {item.content ? <p className="whitespace-pre-wrap text-[15px] leading-7 text-white/92">{item.content}</p> : null}
          {hasImages && (
            <div className={cn("mt-4 grid gap-3", item.images!.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {item.images!.map((src, index) => (
                <div key={`${src}-${index}`} className="group relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-black/20">
                  <img src={src} alt={item.prompt || `Generated image ${index + 1}`} className="h-full w-full object-cover" />
                  <a
                    href={src}
                    download={`supernova-${index + 1}.jpg`}
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
                    title="Download image"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={cn("mt-2 flex items-center gap-2 px-1 text-[11px] text-white/35", isUser && "justify-end")}>
          <span>{formatTimestamp(item.createdAt) || "now"}</span>
          {item.kind === "image" && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.24em]">image</span>}
        </div>
      </div>

      {isUser && (
        <div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.07]">
          <User2 className="h-4 w-4 text-white/80" />
        </div>
      )}
    </div>
  );
}

function DraftBubble({ pending }: { pending: PendingAssistant }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,168,76,0.95),rgba(255,90,31,0.92)_40%,rgba(17,17,17,0.9)_78%)] shadow-[0_10px_32px_rgba(255,111,31,0.2)]">
        <Loader2 className="h-4 w-4 animate-spin text-white" />
      </div>
      <div className="max-w-[86%] sm:max-w-[76%] rounded-[1.8rem] border border-[rgba(255,164,84,0.18)] bg-[linear-gradient(180deg,rgba(255,144,56,0.16),rgba(255,97,31,0.08))] px-4 py-3 shadow-[0_14px_45px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        {pending.content ? (
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-white/92">{pending.content}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-white/70">
            <span className="h-2 w-2 animate-pulse rounded-full bg-orange-300" />
            Thinking...
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState(props: {
  userLabel: string;
  mode: ComposerMode;
  onPromptPick: (value: string, nextMode?: ComposerMode) => void;
}) {
  const { userLabel, mode, onPromptPick } = props;

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_25px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(140,87,255,0.34),transparent_24%),radial-gradient(circle_at_76%_65%,rgba(255,105,31,0.28),transparent_24%),radial-gradient(circle_at_54%_100%,rgba(255,188,73,0.18),transparent_20%)]" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Smart companion</p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
              AI studio in your pocket and on your desktop.
            </h1>
          </div>
          <div className="hidden h-14 w-14 items-center justify-center rounded-3xl border border-white/10 bg-black/20 sm:flex">
            <Sparkles className="h-6 w-6 text-orange-200" />
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">
          Hi {userLabel}. Supernova now combines live chat, image generation, and Firebase-backed conversation history in one responsive surface.
          The visual system follows your reference: soft glass layers, warm highlights, dense depth, and mobile-first spacing.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[1.8rem] border border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-white/38">Popular AI features</p>
                <p className="mt-2 text-2xl font-semibold text-white">Designer-grade AI interface</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">{mode}</div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {FEATURE_TILES.map((tile) => (
                <div key={tile.title} className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-orange-200/70">{tile.kicker}</p>
                  <p className="mt-3 text-lg font-semibold text-white">{tile.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/55">{tile.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-[rgba(255,164,84,0.16)] bg-[linear-gradient(180deg,rgba(255,146,58,0.16),rgba(0,0,0,0.16))] p-4 sm:p-5">
            <p className="text-[11px] uppercase tracking-[0.26em] text-white/38">Quick starts</p>
            <div className="mt-4 space-y-3">
              {QUICK_ACTIONS.map((item) => (
                <button
                  key={item.title}
                  onClick={() => onPromptPick(item.prompt, item.prompt.startsWith("/image") ? "image" : "chat")}
                  className="w-full rounded-[1.4rem] border border-white/10 bg-black/20 p-4 text-left transition hover:bg-white/[0.06]"
                >
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-white/50">{item.subtitle}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Supernova() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<SupernovaConversation[]>([]);
  const [messages, setMessages] = useState<SupernovaMessage[]>([]);
  const [pendingAssistant, setPendingAssistant] = useState<PendingAssistant | null>(null);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [mode, setMode] = useState<ComposerMode>("chat");
  const [style, setStyle] = useState<ImageStyle>("auto");
  const [ratio, setRatio] = useState<ImageRatio>("1:1");
  const [imageCount, setImageCount] = useState<(typeof IMAGE_COUNTS)[number]>(4);
  const [busy, setBusy] = useState(false);

  const userLabel = getDisplayName(user?.displayName || user?.email);
  const canSend = useMemo(() => !!prompt.trim() || attachments.length > 0, [prompt, attachments.length]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeConversations(user.uid, (rows) => {
      setConversations(rows);
      setActiveConversationId((current) => {
        if (!current) return rows[0]?.id ?? null;
        return rows.some((item) => item.id === current) ? current : rows[0]?.id ?? null;
      });
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user || !activeConversationId) {
      setMessages([]);
      return;
    }
    const unsubscribe = subscribeMessages(user.uid, activeConversationId, (rows) => {
      setMessages(rows);
    });
    return unsubscribe;
  }, [user, activeConversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pendingAssistant]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleAttach = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const next: string[] = [];
      for (const file of Array.from(files).filter((entry) => entry.type.startsWith("image/")).slice(0, 4)) {
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 8 MB`);
          continue;
        }
        next.push(await fileToDataUrl(file));
      }
      setAttachments((prev) => [...prev, ...next].slice(0, 4));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleNewConversation = () => {
    abortRef.current?.abort();
    setActiveConversationId(null);
    setMessages([]);
    setPendingAssistant(null);
    setPrompt("");
    setAttachments([]);
    setMode("chat");
    setSheetOpen(false);
  };

  const handleDeleteConversation = async (cid: string) => {
    if (!user) return;
    try {
      await deleteConversation(user.uid, cid);
      if (activeConversationId === cid) {
        setActiveConversationId(null);
        setMessages([]);
      }
      toast.success("Conversation deleted");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const stop = () => abortRef.current?.abort();

  const runSend = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!isOpenRouterConfigured) {
      toast.error("Configure VITE_OPENROUTER_API_KEY to use Supernova.");
      return;
    }
    if (!canSend || busy) return;

    const text = prompt.trim();
    const refs = [...attachments];
    const imageIntent = detectImageIntent(text);
    const effectiveMode: ComposerMode = mode === "image" || imageIntent.isImage ? "image" : "chat";
    const normalizedPrompt = effectiveMode === "image" ? imageIntent.prompt || text : text;
    const fallbackText =
      effectiveMode === "image"
        ? normalizedPrompt || "Edit these images with the current style."
        : text || "Analyze the attached image and help me with it.";
    const conversationId =
      activeConversationId ?? (await createConversation(user.uid, titleFromPrompt(fallbackText, effectiveMode)));

    if (!activeConversationId) setActiveConversationId(conversationId);

    const userMessage: SupernovaMessage = {
      role: "user",
      kind: refs.length ? "image" : "text",
      content: effectiveMode === "image" ? normalizedPrompt || "Image edit request" : fallbackText,
      images: refs.length ? refs : undefined,
      prompt: effectiveMode === "image" ? normalizedPrompt || undefined : undefined,
    };

    setBusy(true);
    setPendingAssistant(null);
    setPrompt("");
    setAttachments([]);
    setSheetOpen(false);

    try {
      await appendMessage(user.uid, conversationId, userMessage);

      const controller = new AbortController();
      abortRef.current = controller;

      if (effectiveMode === "image") {
        setPendingAssistant({ kind: "image", content: "Generating images..." });
        const generated = await generateImage({
          prompt: normalizedPrompt,
          style,
          ratio,
          count: imageCount,
          signal: controller.signal,
          referenceDataUrls: refs.length ? refs : undefined,
        });

        await appendMessage(user.uid, conversationId, {
          role: "assistant",
          kind: "image",
          content:
            refs.length && !normalizedPrompt
              ? "Edited your reference image set."
              : `Generated ${generated.length} image${generated.length > 1 ? "s" : ""} for "${normalizedPrompt}".`,
          images: generated.map((item) => item.url),
          prompt: normalizedPrompt,
        });
        toast.success("Images ready");
      } else {
        setPendingAssistant({ kind: "text", content: "" });
        const response = await streamChat(
          toChatHistory(messages, fallbackText, refs),
          (_chunk, full) => {
            setPendingAssistant({ kind: "text", content: full });
          },
          { signal: controller.signal, temperature: 0.55, maxTokens: 1800 },
        );

        await appendMessage(user.uid, conversationId, {
          role: "assistant",
          kind: "text",
          content: response,
        });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (/abort/i.test(message)) {
        toast("Generation stopped");
      } else {
        toast.error(message);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setPendingAssistant(null);
    }
  };

  const shellInner = (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.05] px-4 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/25 text-white/80 transition hover:text-white" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {isMobile ? (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/25 text-white/80 transition hover:text-white" aria-label="Open conversations">
                  <Menu className="h-4 w-4" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[92vw] max-w-[92vw] border-white/10 bg-[#0b090d]/95 p-3 text-white backdrop-blur-2xl"
              >
                <SheetHeader className="px-2 pb-3 pt-5 text-left">
                  <SheetTitle className="text-white">Supernova</SheetTitle>
                </SheetHeader>
                <ConversationRail
                  currentId={activeConversationId}
                  conversations={conversations}
                  onCreate={handleNewConversation}
                  onDelete={handleDeleteConversation}
                  onSelect={(cid) => {
                    setActiveConversationId(cid);
                    setSheetOpen(false);
                  }}
                  userLabel={userLabel}
                />
              </SheetContent>
            </Sheet>
          ) : (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/25 text-white/65">
              <PanelLeft className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/42">Chat AI</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="truncate text-lg font-semibold text-white">{activeConversationId ? conversations.find((item) => item.id === activeConversationId)?.title || "Supernova" : "New conversation"}</p>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-orange-100/70">
                {mode}
              </span>
            </div>
          </div>
        </div>
        <Button
          onClick={handleNewConversation}
          className="h-11 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,168,76,0.95),rgba(255,90,31,0.92)_40%,rgba(17,17,17,0.9)_78%)] px-4 text-white shadow-[0_14px_36px_rgba(255,111,31,0.2)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          {!isMobile && "New"}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {!isMobile && (
          <ConversationRail
            currentId={activeConversationId}
            conversations={conversations}
            onCreate={handleNewConversation}
            onDelete={handleDeleteConversation}
            onSelect={setActiveConversationId}
            userLabel={userLabel}
          />
        )}

        <div className="relative flex min-h-[78vh] flex-col overflow-hidden rounded-[2.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(32,19,9,0.78),rgba(10,10,12,0.9))] shadow-[0_25px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_20%,rgba(109,72,255,0.28),transparent_22%),radial-gradient(circle_at_55%_55%,rgba(255,125,33,0.22),transparent_24%),radial-gradient(circle_at_100%_0%,rgba(255,89,31,0.18),transparent_18%)]" />

          <div className="relative flex items-center justify-between border-b border-white/8 px-4 py-4 sm:px-6">
            <div>
              <p className="text-sm font-medium text-white">{busy ? "Working…" : "Ask smarter"}</p>
              <p className="mt-1 text-xs text-white/45">
                {busy ? "Streaming with OpenRouter and syncing to Firebase" : "Chat, analyze images, or generate visuals"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode("chat")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs transition",
                  mode === "chat" ? "bg-white/[0.11] text-white" : "text-white/45 hover:text-white",
                )}
              >
                Chat
              </button>
              <button
                onClick={() => setMode("image")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs transition",
                  mode === "image" ? "bg-white/[0.11] text-white" : "text-white/45 hover:text-white",
                )}
              >
                Image
              </button>
            </div>
          </div>

          <ScrollArea className="relative min-h-0 flex-1 px-3 py-4 sm:px-5">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-5">
              {messages.length === 0 ? (
                <EmptyState
                  userLabel={userLabel}
                  mode={mode}
                  onPromptPick={(value, nextMode) => {
                    setPrompt(value);
                    if (nextMode) setMode(nextMode);
                  }}
                />
              ) : (
                messages.map((item) => <MessageBubble key={item.id ?? `${item.role}-${item.content}`} item={item} isUser={item.role === "user"} />)
              )}

              {pendingAssistant && <DraftBubble pending={pendingAssistant} />}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="relative border-t border-white/8 p-3 sm:p-4">
            <div className="mx-auto max-w-4xl rounded-[1.8rem] border border-white/10 bg-black/30 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setMode("chat")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                    mode === "chat" ? "border-white/16 bg-white/[0.08] text-white" : "border-white/8 text-white/48 hover:text-white",
                  )}
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Chat
                </button>
                <button
                  onClick={() => setMode("image")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                    mode === "image" ? "border-white/16 bg-white/[0.08] text-white" : "border-white/8 text-white/48 hover:text-white",
                  )}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Image
                </button>
                {mode === "image" && (
                  <>
                    <select
                      value={style}
                      onChange={(event) => setStyle(event.target.value as ImageStyle)}
                      className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs text-white/78 outline-none"
                    >
                      {STYLES.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={ratio}
                      onChange={(event) => setRatio(event.target.value as ImageRatio)}
                      className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs text-white/78 outline-none"
                    >
                      {RATIOS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <div className="inline-flex rounded-full border border-white/8 bg-white/[0.04] p-1">
                      {IMAGE_COUNTS.map((value) => (
                        <button
                          key={value}
                          onClick={() => setImageCount(value)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs transition",
                            imageCount === value ? "bg-white/[0.12] text-white" : "text-white/45 hover:text-white",
                          )}
                        >
                          {value}x
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {attachments.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {attachments.map((src, index) => (
                    <div key={`${src}-${index}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10">
                      <img src={src} alt={`Attachment ${index + 1}`} className="h-full w-full object-cover" />
                      <button
                        onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== index))}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white/90"
                        aria-label="Remove attachment"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 sm:gap-3">
                <label className="grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/72 transition hover:text-white">
                  <ImagePlus className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void handleAttach(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void runSend();
                    }
                  }}
                  placeholder={
                    mode === "image"
                      ? "Describe the image you want, or attach images and describe the edit..."
                      : "Type your message... or attach images for visual context"
                  }
                  className="min-h-[56px] rounded-[1.6rem] border-white/10 bg-transparent px-4 py-3 text-[15px] text-white placeholder:text-white/28"
                />

                {busy ? (
                  <Button
                    onClick={stop}
                    className="h-12 rounded-2xl border border-red-400/20 bg-red-500/80 px-4 text-white hover:bg-red-500"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => void runSend()}
                    disabled={!canSend}
                    className="h-12 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,168,76,0.95),rgba(255,90,31,0.92)_40%,rgba(17,17,17,0.9)_78%)] px-4 text-white shadow-[0_14px_36px_rgba(255,111,31,0.2)] hover:opacity-95 disabled:opacity-35"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080b] text-white">
      <ShellBackground />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
        {!user ? (
          <div className="flex min-h-[calc(100vh-24px)] items-center justify-center">
            <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,168,76,0.95),rgba(255,90,31,0.92)_40%,rgba(17,17,17,0.9)_78%)]">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h1 className="mt-6 text-3xl font-semibold text-white">Supernova needs your account</h1>
              <p className="mt-3 text-sm leading-7 text-white/60">
                Sign in to unlock live conversations, chat streaming, image generation, and Firebase-backed sync across devices.
              </p>
              <Button
                onClick={() => navigate("/auth")}
                className="mt-6 h-12 rounded-2xl border border-white/10 bg-white/[0.08] px-6 text-white hover:bg-white/[0.12]"
              >
                Continue to sign in
              </Button>
            </div>
          </div>
        ) : (
          shellInner
        )}
      </div>
    </div>
  );
}
