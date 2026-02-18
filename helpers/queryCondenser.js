import Groq from "groq-sdk";
import { SYSTEM_PROMPTS } from '../groqPrompt.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function condenseQuery(history, question, currentDate, activeBoardName = null) {
    let chatContext = "No prior conversation.";
    if (history.length > 0) {
        chatContext = history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n');
    }

    const response = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: 'You are a query condensation assistant. Output ONLY valid JSON.' },
            {
                role: 'user',
                content: SYSTEM_PROMPTS.CONDENSE_PROMPT
                    .replace('{chat_history}', chatContext)
                    .replace('{question}', question)
                    .replace('{current_date}', currentDate)
                    .replace('{active_board_name}', activeBoardName || "None")
            }
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;

    try {
        const cleanedContent = content.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanedContent);

        if (!parsed.filters) parsed.filters = {};

        if (parsed.filters.dueDateStart) {
            const startTs = Math.floor(new Date(parsed.filters.dueDateStart).getTime() / 1000);
            parsed.filters.dueDateStart = isNaN(startTs) ? null : startTs;
        }
        if (parsed.filters.dueDateEnd) {
            const endTs = Math.floor(new Date(parsed.filters.dueDateEnd).getTime() / 1000);
            parsed.filters.dueDateEnd = isNaN(endTs) ? null : endTs;
        }

        if (parsed.filters.assignedTo) {
            parsed.filters.assignedTo = parsed.filters.assignedTo.toLowerCase();
        }

        return parsed;
    } catch (err) {
        console.error("Failed to parse LLM JSON, falling back to basic query:", err);
        return {
            standalone_query: question,
            intent: "GLOBAL_SUMMARY",
            filters: {}
        };
    }
}