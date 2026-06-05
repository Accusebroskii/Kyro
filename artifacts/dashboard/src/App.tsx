import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/Dashboard";
// Import placeholder files, will be created next
import GuildDashboard from "@/pages/guilds/GuildDashboard";
import GuildModeration from "@/pages/guilds/GuildModeration";
import GuildTickets from "@/pages/guilds/GuildTickets";
import GuildModmail from "@/pages/guilds/GuildModmail";
import GuildReports from "@/pages/guilds/GuildReports";
import GuildConfig from "@/pages/guilds/GuildConfig";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/guilds/:guildId" component={GuildDashboard} />
      <Route path="/guilds/:guildId/moderation" component={GuildModeration} />
      <Route path="/guilds/:guildId/tickets" component={GuildTickets} />
      <Route path="/guilds/:guildId/modmail" component={GuildModmail} />
      <Route path="/guilds/:guildId/reports" component={GuildReports} />
      <Route path="/guilds/:guildId/config" component={GuildConfig} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;