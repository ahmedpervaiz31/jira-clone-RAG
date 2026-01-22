import Groq from "groq-sdk";
import { SYSTEM_PROMPTS } from "./groqPrompt.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
export async function askGroq(question, contextChunks, options = {}) {
    const model = options.model || "llama-3.3-70b-versatile";
    const context = contextChunks.join('\n---\n');
    
    const basePrompt = options.systemPrompt || SYSTEM_PROMPTS.JIRA_ASSISTANT;
    const dynamicPrompt = basePrompt.replace(/{{TARGET}}/g, question);

    const messages = [
        { 
            role: "system", 
            content: dynamicPrompt 
        },
        { 
            role: "user", 
            content: `Context:\n${context}\n\nQuestion: ${question}` 
        }
    ];

    const response = await groq.chat.completions.create({
        messages,
        model,
        temperature: options.temperature ?? 0, 
        max_tokens: options.maxTokens || 1024,
    });

    return response.choices[0].message.content; 
}

export function processGroqResponse(response) {
    if (typeof response === "string") {
        return response.trim();
    }
    return response;
}
