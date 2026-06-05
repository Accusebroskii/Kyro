import { Shell } from "@/components/layout/Shell";
import { GuildLayout } from "@/components/layout/GuildLayout";
import { useRoute } from "wouter";
import { useListTickets, getListTicketsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Ticket as TicketIcon } from "lucide-react";

export default function GuildTickets() {
  const [match, params] = useRoute("/guilds/:guildId/tickets");
  const guildId = params?.guildId || "";
  
  const { data: tickets, isLoading } = useListTickets(guildId, undefined, {
    query: { enabled: !!guildId, queryKey: getListTicketsQueryKey(guildId) }
  });

  return (
    <Shell>
      <GuildLayout guildId={guildId}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TicketIcon className="w-5 h-5" />
              Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Claimed By</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      </TableRow>
                    ))
                  ) : tickets?.length ? (
                    tickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium font-mono text-muted-foreground">
                          #{ticket.ticketNumber}
                        </TableCell>
                        <TableCell>
                          <div>{ticket.userTag}</div>
                          <div className="text-xs text-muted-foreground">{ticket.userId}</div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium">
                          {ticket.subject || "No subject"}
                        </TableCell>
                        <TableCell>
                          {ticket.status === "open" ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Open</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">Closed</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {ticket.claimedByTag ? (
                            <span className="text-sm">{ticket.claimedByTag}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">Unclaimed</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No tickets found.
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