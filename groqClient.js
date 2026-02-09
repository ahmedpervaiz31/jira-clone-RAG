import Groq from "groq-sdk";
import { SYSTEM_PROMPTS } from "./groqPrompt.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function askGroq(question, contextChunks, options = {}) {
    const model = options.model || "llama-3.3-70b-versatile";

    const context = contextChunks.join('\n---\n');

    const activeBoardName = options.activeBoardName || 'Global (All Boards)';
    let dynamicPrompt = (options.systemPrompt || SYSTEM_PROMPTS.JIRA_ASSISTANT)
        .replace(/{{TARGET}}/g, question)
        .replace(/{{ACTIVE_BOARD_NAME}}/g, activeBoardName)
        .replace(/{current_date}/g, options.currentDate || new Date().toISOString());

    const history = options.history || [];

    const messages = [
        {
            role: "system",
            content: dynamicPrompt
        },
        ...history.slice(-3),
        {
            role: "user",
            content: `Context for reference:\n${context}\n\nActual User Question: ${question}`
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