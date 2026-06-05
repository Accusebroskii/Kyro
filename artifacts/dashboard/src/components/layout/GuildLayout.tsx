import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useGetGuild } from "@workspace/api-client-react";
import { getGetGuildQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LayoutDashboard, Shield, Ticket, Mail, Flag, Settings } from "lucide-react";

export function GuildLayout({ guildId, children }: { guildId: string, children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: guild, isLoading } = useGetGuild(guildId, {
    query: { enabled: !!guildId, queryKey: getGetGuildQueryKey(guildId) }
  });

  const tabs = [
    { name: "Overview", href: `/guilds/${guildId}`, icon: LayoutDashboard },
    { name: "Moderation", href: `/guilds/${guildId}/moderation`, icon: Shield },
    { name: "Tickets", href: `/guilds/${guildId}/tickets`, icon: Ticket },
    { name: "ModMail", href: `/guilds/${guildId}/modmail`, icon: Mail },
    { name: "Reports", href: `/guilds/${guildId}/reports`, icon: Flag },
    { name: "Configuration", href: `/guilds/${guildId}/config`, icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center gap-4">
        {isLoading ? (
          <Skeleton className="w-16 h-16 rounded-2xl" />
        ) : (
          <Avatar className="w-16 h-16 rounded-2xl border-2 border-border bg-card">
            <AvatarImage src={guild?.iconUrl || undefined} />
            <AvatarFallback className="rounded-2xl text-xl font-bold">{guild?.name.substring(0, 2)}</AvatarFallback>
          </Avatar>
        )}
        <div className="space-y-1">
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">{guild?.name}</h1>
              <p className="text-sm text-muted-foreground">ID: {guild?.guildId} • {guild?.memberCount?.toLocaleString()} Members</p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b overflow-x-auto pb-px scrollbar-none">
        {tabs.map((tab) => {
          const isActive = location === tab.href;
          return (
            <Link key={tab.name} href={tab.href}>
              <div
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.name}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}