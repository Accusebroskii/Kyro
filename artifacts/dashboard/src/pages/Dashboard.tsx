import { useGetBotStatus, useListGuilds } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Server, Users, Terminal, Clock, Signal } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: status, isLoading: statusLoading } = useGetBotStatus();
  const { data: guilds, isLoading: guildsLoading } = useListGuilds();

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <Shell>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bot Overview</h2>
          <p className="text-muted-foreground">Monitor your bot's real-time status and connected guilds.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${status?.online ? "bg-green-500" : "bg-destructive animate-pulse"}`} />
                  <span className="text-2xl font-bold">{status?.online ? "Online" : "Offline"}</span>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uptime</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-bold">{status ? formatUptime(status.uptime) : "N/A"}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Latency</CardTitle>
              <Signal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="flex items-baseline gap-1">
                  <div className="text-2xl font-bold">{status?.latency || 0}</div>
                  <span className="text-sm text-muted-foreground">ms</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Guilds</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{status?.guildCount?.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{status?.userCount?.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Commands Run</CardTitle>
              <Terminal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{status?.commandCount?.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-bold tracking-tight">Configured Guilds</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {guildsLoading ? (
              Array(6).fill(0).map((_, i) => (
                <Card key={i} className="bg-card">
                  <CardContent className="p-6 flex items-center gap-4">
                    <Skeleton className="w-12 h-12 rounded-xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : guilds?.length ? (
              guilds.map((guild) => (
                <Link key={guild.id} href={`/guilds/${guild.guildId}`}>
                  <Card className="bg-card hover-elevate transition-all cursor-pointer overflow-hidden border-border/50 hover:border-primary/50 group">
                    <CardContent className="p-6 flex items-center gap-4">
                      <Avatar className="w-12 h-12 rounded-xl border-2 border-background group-hover:border-primary/20 transition-colors">
                        <AvatarImage src={guild.iconUrl || undefined} />
                        <AvatarFallback className="rounded-xl font-semibold">{guild.name.substring(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-base truncate">{guild.name}</h4>
                        <p className="text-sm text-muted-foreground truncate">{guild.memberCount?.toLocaleString() || 0} members</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg">
                No guilds configured. Invite the bot to a server to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}