import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { GuildLayout } from "@/components/layout/GuildLayout";
import { useRoute } from "wouter";
import { useListModLogs, getListModLogsQueryKey, useListWarnings, getListWarningsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function GuildModeration() {
  const [match, params] = useRoute("/guilds/:guildId/moderation");
  const guildId = params?.guildId || "";
  
  const [logFilter, setLogFilter] = useState<string>("");

  const { data: modLogs, isLoading: logsLoading } = useListModLogs(guildId, 
    logFilter ? { action: logFilter } : undefined, 
    { query: { enabled: !!guildId, queryKey: getListModLogsQueryKey(guildId, logFilter ? { action: logFilter } : undefined) } }
  );

  const { data: warnings, isLoading: warningsLoading } = useListWarnings(guildId, undefined, {
    query: { enabled: !!guildId, queryKey: getListWarningsQueryKey(guildId) }
  });

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case "ban": return "bg-destructive/10 text-destructive border-destructive/20";
      case "kick": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "mute":
      case "timeout": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "warn": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Shell>
      <GuildLayout guildId={guildId}>
        <div className="space-y-6">
          <Tabs defaultValue="logs" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="logs">Moderation Logs</TabsTrigger>
              <TabsTrigger value="warnings">Warnings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="logs">
              <Card>
                <CardHeader>
                  <CardTitle>Moderation Logs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Target User</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Moderator</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logsLoading ? (
                          Array(5).fill(0).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            </TableRow>
                          ))
                        ) : modLogs?.length ? (
                          modLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="font-medium">
                                <div>{log.targetTag}</div>
                                <div className="text-xs text-muted-foreground">{log.targetId}</div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={getActionColor(log.action)}>
                                  {log.action}
                                </Badge>
                                {log.duration && <span className="ml-2 text-xs text-muted-foreground">{log.duration}</span>}
                              </TableCell>
                              <TableCell>
                                <div>{log.moderatorTag}</div>
                                <div className="text-xs text-muted-foreground">{log.moderatorId}</div>
                              </TableCell>
                              <TableCell className="max-w-md truncate">
                                {log.reason || "No reason provided"}
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">
                                {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              No moderation logs found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="warnings">
              <Card>
                <CardHeader>
                  <CardTitle>Active Warnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Moderator</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {warningsLoading ? (
                          Array(5).fill(0).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            </TableRow>
                          ))
                        ) : warnings?.length ? (
                          warnings.map((warning) => (
                            <TableRow key={warning.id}>
                              <TableCell className="font-medium">
                                <div>{warning.userTag}</div>
                                <div className="text-xs text-muted-foreground">{warning.userId}</div>
                              </TableCell>
                              <TableCell>
                                <div>{warning.moderatorTag}</div>
                                <div className="text-xs text-muted-foreground">{warning.moderatorId}</div>
                              </TableCell>
                              <TableCell className="max-w-md truncate">
                                {warning.reason || "No reason provided"}
                              </TableCell>
                              <TableCell>
                                {warning.active ? (
                                  <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Active</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">
                                {formatDistanceToNow(new Date(warning.createdAt), { addSuffix: true })}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              No warnings found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </GuildLayout>
    </Shell>
  );
}