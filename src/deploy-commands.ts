import { getAllCommands } from "../artifacts/api-server/src/bot/commands/index.js";

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;

const commands = getAllCommands().map(command => command.data.toJSON());

console.log(`Registering ${commands.length} commands globally...`);

async function deploy() {
  console.log("Updating global application commands...");

  const response = await fetch(
    `https://discord.com/api/v10/applications/${clientId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    }
  );

  const data = await response.text();

  console.log(`Discord response: ${response.status}`);

  if (!response.ok) {
    console.error(data);
    process.exit(1);
  }

  console.log(`✅ Successfully registered ${commands.length} global commands!`);
}

deploy().catch(console.error);
