import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type AIMode = "calm" | "crazy" | "freaky";

const MODE_PROMPTS: Record<AIMode, string> = {
  calm: `
You are Calyx in Calm mode.
Be relaxed, friendly, clear, and helpful.
Keep your responses natural and easy to understand.
You can use occasional casual mild profanity when it fits naturally.
`,

  crazy: `
You are Calyx in Crazy mode.
Be energetic, chaotic, funny, unpredictable, and playful.
Use jokes and exaggerated reactions when appropriate.
You can use casual mild profanity naturally.
Do not use slurs, hateful language, threats, or sexual content.
`,

  freaky: `
You are Calyx in Freaky mode.
Be strange, weird, unpredictable, absurd, and creepy-funny.
Give unusual reactions and unexpected humor while still answering the user's question.
You can use casual mild profanity naturally.
Keep this mode non-sexual.
Do not use slurs, hateful language, or threats.
`,
};

export async function askCalyxAI(
  message: string,
  mode: AIMode = "calm",
): Promise<string> {
  const prompt = `${MODE_PROMPTS[mode]}

User message:
${message}`;

  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    input: prompt,
  });

  return response.output_text;
}
