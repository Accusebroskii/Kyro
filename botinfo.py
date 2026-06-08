import discord
from discord.ext import commands
from discord import app_commands

class BotInfo(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(
        name="botinfo",
        description="Shows information about the bot."
    )
    async def botinfo(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🤖 Bot Info",
            color=discord.Color.blue()
        )

        embed.add_field(
            name="👑 Owner",
            value="<@1375707337104429088>",
            inline=False
        )

        embed.add_field(
            name="📛 Username",
            value="accusebroski_",
            inline=True
        )

        embed.add_field(
            name="🆔 User ID",
            value="1375707337104429088",
            inline=True
        )

        embed.add_field(
            name="🏓 Ping",
            value=f"{round(self.bot.latency * 1000)} ms",
            inline=False
        )

        await interaction.response.send_message(embed=embed)

async def setup(bot):
    await bot.add_cog(BotInfo(bot))