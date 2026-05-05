import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Hash, Send, Smile, Image as ImageIcon, Users, Menu, Loader2 } from "lucide-react";
import * as Ably from "ably";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getAblyClient, ROOMS, ROOM_CHANNEL, RoomId } from "@/lib/ably";
import { ensureProfile, getProfile, Profile } from "@/lib/profiles";

type ChatMsg = {
  id: string;
  clientId: string;
  name: string;
  avatar?: string;
  text?: string;
  image?: string;
  ts: number;
};

function timeLabel(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export default function Rooms() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [active, setActive] = useState<RoomId>("lobby");
  const [messages, setMessages] = useState<Record<RoomId, ChatMsg[]>>({
    lobby: [], builds: [], supernova: [], help: [],
  });
  const [members, setMembers] = useState<Ably.PresenceMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connState, setConnState] = useState<string>("initialized");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const channelsRef = useRef<Map<RoomId, Ably.RealtimeChannel>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  // Load / ensure profile
  useEffect(() => {
    if (!user) return;
    ensureProfile({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    })
      .then(() => getProfile(user.uid))
      .then((p) => p && setProfile(p))
      .catch((e) => console.warn("profile init", e));
  }, [user]);

  // Connect to Ably + subscribe to all rooms
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    let realtime: Ably.Realtime;
    try {
      realtime = getAblyClient(user.uid);
    } catch (e: any) {
      toast.error(e?.message ?? "Ably failed to start");
      return;
    }

    const onState = (s: Ably.ConnectionStateChange) => setConnState(s.current);
    realtime.connection.on(onState);
    setConnState(realtime.connection.state);

    ROOMS.forEach((r) => {
      const ch = realtime.channels.get(ROOM_CHANNEL(r.id));
      channelsRef.current.set(r.id, ch);

      ch.subscribe("msg", (m: Ably.Message) => {
        if (cancelled) return;
        const data = m.data as Omit<ChatMsg, "id" | "ts" | "clientId">;
        const next: ChatMsg = {
          id: m.id ?? `${m.timestamp}-${Math.random()}`,
          clientId: m.clientId ?? "anon",
          ts: m.timestamp ?? Date.now(),
          ...data,
        };
        setMessages((prev) => ({ ...prev, [r.id]: [...prev[r.id], next].slice(-200) }));
      });

      // Hydrate recent history
      ch.history({ limit: 50 }).then((page) => {
        if (cancelled) return;
        const items = page.items.reverse().map((m) => {
          const data = m.data as Omit<ChatMsg, "id" | "ts" | "clientId">;
          return {
            id: m.id ?? `${m.timestamp}-${Math.random()}`,
            clientId: m.clientId ?? "anon",
            ts: m.timestamp ?? Date.now(),
            ...data,
          } as ChatMsg;
        });
        setMessages((prev) => ({ ...prev, [r.id]: items }));
      }).catch(() => {});
    });

    return () => {
      cancelled = true;
      realtime.connection.off(onState);
      channelsRef.current.forEach((ch) => {
        try { ch.unsubscribe(); ch.presence.leave().catch(() => {}); } catch {}
      });
      channelsRef.current.clear();
    };
  }, [user]);

  // Presence: enter active room, subscribe to its presence set
  useEffect(() => {
    if (!user) return;
    const ch = channelsRef.current.get(active);
    if (!ch) return;

    const presenceData = {
      name: profile?.displayName ?? user.displayName ?? "user",
      avatar: profile?.photoURL ?? user.photoURL ?? "",
      status: profile?.status ?? "online",
    };

    ch.presence.enter(presenceData).catch(() => {});
    const onChange = () => {
      ch.presence.get().then((set) => setMembers(set)).catch(() => {});
    };
    ch.presence.subscribe(onChange);
    onChange();

    return () => {
      ch.presence.unsubscribe(onChange);
      ch.presence.leave().catch(() => {});
    };
  }, [active, user, profile?.displayName, profile?.photoURL, profile?.status]);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, active]);

  const activeMessages = messages[active];
  const activeRoom = useMemo(() => ROOMS.find((r) => r.id === active)!, [active]);

  const send = async () => {
    if (!user) return;
    const text = draft.trim();
    if (!text && !pendingImage) return;
    const ch = channelsRef.current.get(active);
    if (!ch) return;
    try {
      await ch.publish("msg", {
        name: profile?.displayName ?? user.displayName ?? "user",
        avatar: profile?.photoURL ?? user.photoURL ?? "",
        text: text || undefined,
        image: pendingImage || undefined,
      });
      setDraft("");
      setPendingImage(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send");
    }
  };

  const onAttach = async (files: FileList | null) => {
    if (!files?.length) return;
    const f = files[0];
    if (!f.type.startsWith("image/")) {
      toast.error("Only images");
      return;
    }
    if (f.size > 1.5 * 1024 * 1024) {
      toast.error("Image must be under 1.5 MB");
      return;
    }
    setPendingImage(await fileToDataUrl(f));
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Button onClick={() => navigate("/auth")}>Sign in to enter Matrixbook rooms</Button>
      </div>
    );
  }

  const stateColor =
    connState === "connected" ? "bg-emerald-500" :
    connState === "connecting" || connState === "initialized" ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className="h-screen flex bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── Server / room list (Discord-like) ── */}
      <aside className={`${sidebarOpen ? "w-60" : "w-0"} shrink-0 transition-[width] duration-200 overflow-hidden border-r border-white/5 bg-zinc-950/95 backdrop-blur flex flex-col`}>
        <div className="px-3 py-3 border-b border-white/5 flex items-center gap-2">
          <Link to="/" className="text-zinc-400 hover:text-white" aria-label="Home">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-blue-500 flex items-center justify-center text-[10px] font-bold">MB</span>
            <span className="font-semibold text-sm tracking-wide">Matrixbook</span>
          </div>
          <span className={`w-2 h-2 rounded-full ${stateColor}`} title={`Ably: ${connState}`} />
        </div>

        <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
          Channels
        </div>
        <nav className="flex-1 overflow-auto px-1 space-y-0.5">
          {ROOMS.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 text-sm transition ${
                active === r.id ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Hash className="w-4 h-4 opacity-70" />
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-white/5 flex items-center gap-2">
          {profile?.photoURL || user.photoURL ? (
            <img src={profile?.photoURL || user.photoURL!} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-blue-500 grid place-items-center text-xs font-bold">
              {(profile?.displayName ?? user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs truncate font-medium">{profile?.displayName ?? user.displayName ?? user.email}</p>
            <p className="text-[10px] text-zinc-500 truncate">{profile?.status ?? "online"}</p>
          </div>
          <Link to="/dashboard" className="text-[10px] text-zinc-400 hover:text-white">Edit</Link>
        </div>
      </aside>

      {/* ── Channel main ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 px-3 flex items-center gap-2 border-b border-white/5">
          <button onClick={() => setSidebarOpen((s) => !s)} className="p-2 rounded-md hover:bg-white/5 text-zinc-400 hover:text-white" aria-label="Toggle sidebar">
            <Menu className="w-4 h-4" />
          </button>
          <Hash className="w-4 h-4 text-zinc-400" />
          <h1 className="text-sm font-semibold">{activeRoom.label}</h1>
          <span className="hidden md:inline text-xs text-zinc-500 truncate ml-2">— {activeRoom.description}</span>
          <div className="ml-auto flex items-center gap-1 text-xs text-zinc-400">
            <Users className="w-4 h-4" /> {members.length}
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {activeMessages.length === 0 ? (
              <div className="text-center text-zinc-500 text-sm py-12">
                <Hash className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>Welcome to <span className="text-zinc-200 font-medium">#{activeRoom.label}</span>.</p>
                <p className="text-xs mt-1">{activeRoom.description}</p>
              </div>
            ) : (
              activeMessages.map((m, i) => {
                const prev = activeMessages[i - 1];
                const stacked = prev && prev.clientId === m.clientId && m.ts - prev.ts < 60_000;
                return (
                  <div key={m.id} className={`flex gap-3 ${stacked ? "mt-0.5" : "mt-3"}`}>
                    {!stacked ? (
                      m.avatar ? (
                        <img src={m.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-blue-500 grid place-items-center text-xs font-bold">
                          {(m.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )
                    ) : (
                      <div className="w-9" />
                    )}
                    <div className="flex-1 min-w-0">
                      {!stacked && (
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-sm">{m.name}</span>
                          {m.clientId === user.uid && (
                            <span className="text-[10px] uppercase font-mono text-blue-400">you</span>
                          )}
                          <span className="text-[10px] text-zinc-500">{timeLabel(m.ts)}</span>
                        </div>
                      )}
                      {m.text && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>}
                      {m.image && (
                        <img src={m.image} alt="" className="mt-1 max-w-sm rounded-lg border border-white/10" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-white/5 bg-zinc-950">
          <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
            {pendingImage && (
              <div className="flex items-center gap-2">
                <img src={pendingImage} alt="" className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                <button onClick={() => setPendingImage(null)} className="text-xs text-zinc-400 hover:text-white">Remove</button>
              </div>
            )}
            <div className="flex items-end gap-2 bg-zinc-900 rounded-2xl border border-white/10 focus-within:border-blue-400/50 px-3 py-2 transition-colors">
              <label className="cursor-pointer text-zinc-400 hover:text-white p-1.5 shrink-0" title="Attach image">
                <ImageIcon className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { onAttach(e.target.files); e.currentTarget.value = ""; }} />
              </label>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Message #${activeRoom.label}`}
                rows={1}
                className="flex-1 min-h-[28px] max-h-40 resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm text-zinc-100 placeholder:text-zinc-500 px-1 py-1"
              />
              <Smile className="w-4 h-4 text-zinc-500 hidden sm:block" />
              <Button
                onClick={send}
                disabled={!draft.trim() && !pendingImage}
                size="icon"
                className="bg-gradient-to-br from-fuchsia-500 to-blue-600 hover:opacity-90 text-white rounded-xl shrink-0 disabled:opacity-40"
              >
                {connState === "connected" ? <Send className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
              </Button>
            </div>
            <p className="text-[10px] text-zinc-500 text-center">
              Realtime via Ably · message history is kept for 2 minutes by default
            </p>
          </div>
        </div>
      </main>

      {/* ── Members panel ── */}
      <aside className="hidden lg:flex w-56 shrink-0 border-l border-white/5 bg-zinc-950/95 flex-col">
        <div className="px-3 py-3 border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
          Online — {members.length}
        </div>
        <div className="flex-1 overflow-auto py-2">
          {members.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center mt-6">No one here yet</p>
          ) : (
            members.map((m) => {
              const data = (m.data ?? {}) as { name?: string; avatar?: string; status?: string };
              const name = data.name || m.clientId || "user";
              return (
                <div key={m.connectionId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5">
                  <div className="relative">
                    {data.avatar ? (
                      <img src={data.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-blue-500 grid place-items-center text-xs font-bold">
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs truncate font-medium">{name}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{data.status ?? "online"}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}