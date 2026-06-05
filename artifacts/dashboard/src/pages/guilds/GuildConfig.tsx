import { Shell } from "@/components/layout/Shell";
import { GuildLayout } from "@/components/layout/GuildLayout";
import { useRoute } from "wouter";
import { useGetGuildConfig, getGetGuildConfigQueryKey, useUpdateGuildConfig } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const configSchema = z.object({
  welcomeChannelId: z.string().nullable().optional(),
  welcomeMessage: z.string().nullable().optional(),
  logChannelId: z.string().nullable().optional(),
  modLogChannelId: z.string().nullable().optional(),
  ticketCategoryId: z.string().nullable().optional(),
  ticketLogChannelId: z.string().nullable().optional(),
  modmailForumId: z.string().nullable().optional(),
  muteRoleId: z.string().nullable().optional(),
  modRoleId: z.string().nullable().optional(),
  adminRoleId: z.string().nullable().optional(),
  antispamEnabled: z.boolean().optional(),
  antiRaidEnabled: z.boolean().optional(),
  automodEnabled: z.boolean().optional(),
  maxWarnings: z.coerce.number().min(1).max(20).optional(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function GuildConfig() {
  const [match, params] = useRoute("/guilds/:guildId/config");
  const guildId = params?.guildId || "";
  const { toast } = useToast();
  
  const { data: config, isLoading } = useGetGuildConfig(guildId, {
    query: { enabled: !!guildId, queryKey: getGetGuildConfigQueryKey(guildId) }
  });

  const updateConfig = useUpdateGuildConfig();

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      welcomeChannelId: "",
      welcomeMessage: "",
      logChannelId: "",
      modLogChannelId: "",
      ticketCategoryId: "",
      ticketLogChannelId: "",
      modmailForumId: "",
      muteRoleId: "",
      modRoleId: "",
      adminRoleId: "",
      antispamEnabled: false,
      antiRaidEnabled: false,
      automodEnabled: false,
      maxWarnings: 3,
    }
  });

  const initRef = useRef(false);

  useEffect(() => {
    if (config && !initRef.current) {
      form.reset({
        welcomeChannelId: config.welcomeChannelId || "",
        welcomeMessage: config.welcomeMessage || "",
        logChannelId: config.logChannelId || "",
        modLogChannelId: config.modLogChannelId || "",
        ticketCategoryId: config.ticketCategoryId || "",
        ticketLogChannelId: config.ticketLogChannelId || "",
        modmailForumId: config.modmailForumId || "",
        muteRoleId: config.muteRoleId || "",
        modRoleId: config.modRoleId || "",
        adminRoleId: config.adminRoleId || "",
        antispamEnabled: config.antispamEnabled ?? false,
        antiRaidEnabled: config.antiRaidEnabled ?? false,
        automodEnabled: config.automodEnabled ?? false,
        maxWarnings: config.maxWarnings || 3,
      });
      initRef.current = true;
    }
  }, [config, form]);

  const onSubmit = (data: ConfigFormValues) => {
    updateConfig.mutate(
      { guildId, data },
      {
        onSuccess: () => {
          toast({
            title: "Configuration Saved",
            description: "Guild configuration has been updated successfully.",
          });
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to save configuration. Please try again.",
          });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <Shell>
        <GuildLayout guildId={guildId}>
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </GuildLayout>
      </Shell>
    );
  }

  return (
    <Shell>
      <GuildLayout guildId={guildId}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-12">
            
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Protection & Automod</CardTitle>
                  <CardDescription>Configure automatic moderation and raid protection</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="automodEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Auto Moderation</FormLabel>
                          <FormDescription>
                            Automatically filter bad words and links
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="antispamEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Anti-Spam</FormLabel>
                          <FormDescription>
                            Detect and mute spammers automatically
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="antiRaidEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Anti-Raid</FormLabel>
                          <FormDescription>
                            Enable strict join filters during raids
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxWarnings"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Warnings Before Ban</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Channels</CardTitle>
                  <CardDescription>Configure logging and welcome channels (Channel IDs)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="logChannelId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>General Log Channel ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="modLogChannelId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Moderation Log Channel ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="welcomeChannelId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Welcome Channel ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="welcomeMessage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Welcome Message</FormLabel>
                        <FormControl>
                          <Input placeholder="Welcome {user} to the server!" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Roles</CardTitle>
                  <CardDescription>Configure moderation and permission roles (Role IDs)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="adminRoleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin Role ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="modRoleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Moderator Role ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="muteRoleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mute Role ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tickets & Modmail</CardTitle>
                  <CardDescription>Configure support systems (Category/Forum IDs)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="ticketCategoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ticket Category ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ticketLogChannelId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ticket Log Channel ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="modmailForumId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modmail Forum Channel ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123456789012345678" value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateConfig.isPending} size="lg">
                {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </GuildLayout>
    </Shell>
  );
}