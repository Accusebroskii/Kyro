import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const musicPlaylistsTable = pgTable("music_playlists", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  createdByTag: text("created_by_tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const musicPlaylistSongsTable = pgTable("music_playlist_songs", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  duration: text("duration").notNull(),
  thumbnail: text("thumbnail").notNull().default(""),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMusicPlaylistSchema = createInsertSchema(musicPlaylistsTable).omit({ id: true, createdAt: true });
export type InsertMusicPlaylist = z.infer<typeof insertMusicPlaylistSchema>;
export type MusicPlaylist = typeof musicPlaylistsTable.$inferSelect;

export const insertMusicPlaylistSongSchema = createInsertSchema(musicPlaylistSongsTable).omit({ id: true, addedAt: true });
export type InsertMusicPlaylistSong = z.infer<typeof insertMusicPlaylistSongSchema>;
export type MusicPlaylistSong = typeof musicPlaylistSongsTable.$inferSelect;
