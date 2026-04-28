import { Link, useNavigate } from "react-router-dom";
import { LogOut, Sparkles, User as UserIcon, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { Brand } from "./Brand";

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.displayName || user?.email || "?";
  const initial = displayName.trim().charAt(0).toUpperCase();
  const avatarUrl = user?.photoURL ?? undefined;

  return (
    <header className="fixed top-0 inset-x-0 z-50 glass border-b border-border/50">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center">
          <Brand />
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="/#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="/#templates" className="hover:text-foreground transition-colors">Templates</a>
          <a href="/#how" className="hover:text-foreground transition-colors">How it works</a>
          {user && (
            <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
          )}
        </nav>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-muted/40 transition-colors">
                <Avatar className="h-8 w-8 ring-1 ring-border">
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs font-semibold">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
                  {user.displayName || user.email}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 glass-strong">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Signed in as
                <div className="text-foreground font-medium truncate">
                  {user.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/dashboard">
                  <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/#builder")}>
                <Sparkles className="w-4 h-4 mr-2" /> New build
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth"></Link>
            </Button>
            <Button variant="hero" size="sm" asChild>
              <Link to="/auth?mode=signup">
                <UserIcon className="w-3.5 h-3.5" /> Get started
              </Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
