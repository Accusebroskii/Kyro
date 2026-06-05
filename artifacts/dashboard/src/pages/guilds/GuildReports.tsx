import { Shell } from "@/components/layout/Shell";
import { GuildLayout } from "@/components/layout/GuildLayout";
import { useRoute } from "wouter";
import { useListReports, getListReportsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default function GuildReports() {
  const [match, params] = useRoute("/guilds/:guildId/reports");
  const guildId = params?.guildId || "";
  
  const { data: allReports, isLoading } = useListReports(guildId, undefined, {
    query: { enabled: !!guildId, queryKey: getListReportsQueryKey(guildId) }
  });

  const getPriorityColor = (priority: string = "low") => {
    switch (priority.toLowerCase()) {
      case "critical": return "bg-red-500/10 text-red-500 border-red-500/20";
      case "high": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "medium": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "low": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "open": return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Open</Badge>;
      case "in_progress": return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">In Progress</Badge>;
      case "resolved": return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Resolved</Badge>;
      case "closed": return <Badge variant="outline" className="bg-muted text-muted-foreground">Closed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderReportsTable = (reports: typeof allReports) => {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))
            ) : reports?.length ? (
              reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">
                    <div className="max-w-[300px] truncate">{report.title}</div>
                    {report.reportedUserTag && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Reported: {report.reportedUserTag}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{report.userTag}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getPriorityColor(report.priority)}>
                      {report.priority || "low"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(report.status)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No reports found for this category.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Shell>
      <GuildLayout guildId={guildId}>
        <div className="space-y-6">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Reports</TabsTrigger>
              <TabsTrigger value="player">Player Reports</TabsTrigger>
              <TabsTrigger value="bug">Bug Reports</TabsTrigger>
              <TabsTrigger value="support">Support</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all">
              <Card>
                <CardHeader>
                  <CardTitle>All Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderReportsTable(allReports)}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="player">
              <Card>
                <CardHeader>
                  <CardTitle>Player Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderReportsTable(allReports?.filter(r => r.type === 'player'))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bug">
              <Card>
                <CardHeader>
                  <CardTitle>Bug Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderReportsTable(allReports?.filter(r => r.type === 'bug'))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="support">
              <Card>
                <CardHeader>
                  <CardTitle>Support Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderReportsTable(allReports?.filter(r => r.type === 'support'))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </GuildLayout>
    </Shell>
  );
}