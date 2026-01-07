
import { GoogleGenAI, Type } from "@google/genai";
import { ObjectType, GameObject } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateLevelIdea(theme: string): Promise<{ name: string, objects: GameObject[] }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `Generate a Geometry Dash level layout for: ${theme}.`,
    config: {
      systemInstruction: "You are a Geometry Dash designer. Respond in JSON. Objects: x (starts 400, inc 40), y (ground 360), type (BLOCK, SPIKE, PORTAL_SHIP (Red), PORTAL_BALL (Orange), PORTAL_UFO (Green), PORTAL_WAVE (Cyan), PORTAL_ROBOT (Yellow), PORTAL_SPIDER (Hot Pink), PORTAL_SWING (Deep Blue), PORTAL_JETPACK (Violet)). Swing mode allows mid-air gravity flipping. Jetpack mode behaves like a snappy ship. Ensure layouts are playable for each mode.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          objects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                type: { type: Type.STRING }
              },
              required: ["x", "y", "type"]
            }
          }
        },
        required: ["name", "objects"]
      }
    }
  });

  const data = JSON.parse(response.text);
  return {
    name: data.name,
    objects: data.objects.map((obj: any, index: number) => ({
      ...obj,
      id: `ai-${Date.now()}-${index}`
    }))
  };
}
