import { Shell } from "@/components/layout/Shell";
import { GuildLayout } from "@/components/layout/GuildLayout";
import { useRoute } from "wouter";
import { useListModmailThreads, getListModmailThreadsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Mail } from "lucide-react";

export default function GuildModmail() {
  const [match, params] = useRoute("/guilds/:guildId/modmail");
  const guildId = params?.guildId || "";
  
  const { data: threads, isLoading } = useListModmailThreads(guildId, undefined, {
    query: { enabled: !!guildId, queryKey: getListModmailThreadsQueryKey(guildId) }
  });

  return (
    <Shell>
      <GuildLayout guildId={guildId}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Modmail Threads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Closed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      </TableRow>
                    ))
                  ) : threads?.length ? (
                    threads.map((thread) => (
                      <TableRow key={thread.id}>
                        <TableCell>
                          <div className="font-medium">{thread.userTag}</div>
                          <div className="text-xs text-muted-foreground">{thread.userId}</div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium">
                          {thread.subject || "No subject"}
                        </TableCell>
                        <TableCell>
                          {thread.status === "open" ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Open</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">Closed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          {thread.closedBy ? (
                            <span className="text-sm">{thread.closedBy}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No Modmail threads found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </GuildLayout>
    </Shell>
  );
}