import { Link } from "wouter";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useGetBotStatus, useListGuilds } from "@workspace/api-client-react";
import { Bot, Server, Settings, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Sidebar() {
  const [location] = useLocation();
  const { data: guilds, isLoading } = useListGuilds();
  const { data: status } = useGetBotStatus();

  return (
    <div className="w-64 bg-sidebar border-r flex flex-col flex-shrink-0">
      <div className="p-4 border-b h-[60px] flex items-center justify-between flex-shrink-0">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground hover:opacity-80 transition-opacity">
          <Bot className="w-6 h-6 text-primary" />
          <span>Bot Control</span>
        </Link>
        {status && (
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", status.online ? "bg-green-500" : "bg-red-500")} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="space-y-1">
          <Link href="/">
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              location === "/" 
                ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}>
              <Activity className="w-4 h-4" />
              Overview
            </div>
          </Link>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
            Guilds
          </h4>
          
          <div className="space-y-1">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="w-6 h-6 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))
            ) : guilds?.length ? (
              guilds.map((guild) => {
                const isActive = location.startsWith(`/guilds/${guild.guildId}`);
                return (
                  <Link key={guild.id} href={`/guilds/${guild.guildId}`}>
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}>
                      <Avatar className="w-6 h-6 border bg-background">
                        <AvatarImage src={guild.iconUrl || undefined} />
                        <AvatarFallback className="text-[10px]">{guild.name.substring(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate flex-1">{guild.name}</span>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">No guilds found</div>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
        <Settings className="w-4 h-4" />
        <span className="truncate flex-1">{status?.tag || "System"}</span>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/30">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
        <div className="flex-1 overflow-y-auto p-6 md:p-8 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}