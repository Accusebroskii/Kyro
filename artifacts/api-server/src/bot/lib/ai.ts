import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function askCalyxAI(message: string): Promise<string> {
  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    input: message,
  });

  return response.output_text;
}
