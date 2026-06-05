import { Shell } from "@/components/layout/Shell";
import { GuildLayout } from "@/components/layout/GuildLayout";
import { useRoute } from "wouter";
import { useGetGuildStats, getGetGuildStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Ban, MicOff, Ticket, Mail, Flag, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function GuildDashboard() {
  const [match, params] = useRoute("/guilds/:guildId");
  const guildId = params?.guildId || "";
  
  const { data: stats, isLoading } = useGetGuildStats(guildId, {
    query: { enabled: !!guildId, queryKey: getGetGuildStatsQueryKey(guildId) }
  });

  return (
    <Shell>
      <GuildLayout guildId={guildId}>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Warnings</CardTitle>
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.totalWarnings || 0}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bans</CardTitle>
                <Ban className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.totalBans || 0}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
                <Ticket className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.openTickets || 0}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Modmail</CardTitle>
                <Mail className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.openModmail || 0}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Mutes / Timeouts</CardTitle>
                <MicOff className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.totalMutes || 0}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Reports</CardTitle>
                <Flag className="h-4 w-4 text-red-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.openReports || 0}</div>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Recent Moderation Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : stats?.recentActions?.length ? (
                <div className="space-y-0">
                  {stats.recentActions.map((action) => (
                    <div key={action.id} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">
                          <span className="text-primary">{action.targetTag}</span> was {action.action}ed by <span className="text-muted-foreground">{action.moderatorTag}</span>
                        </p>
                        {action.reason && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">"{action.reason}"</p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                        {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  No recent moderation activity.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </GuildLayout>
    </Shell>
  );
}