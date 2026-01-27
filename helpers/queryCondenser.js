import Groq from "groq-sdk"; 
import { SYSTEM_PROMPTS } from '../groqPrompt.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function condenseQuery(history, question, currentDate) {
    if (!history || history.length === 0) {
        return {
            standalone_query: question,
            intent: 'SPECIFIC_ENTITY',
            filters: {}
        };
    }

    const chatContext = history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n');
    
    const response = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: 'You are a query condensation assistant. Output ONLY valid JSON.' },
            { 
                role: 'user', 
                content: SYSTEM_PROMPTS.CONDENSE_PROMPT
                    .replace('{chat_history}', chatContext)
                    .replace('{question}', question)
                    .replace('{current_date}', currentDate) 
            }
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: "json_object" } 
    });

    const content = response.choices[0]?.message?.content;

    try {
        const cleanedContent = content.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanedContent);
    } catch (err) {
        console.error("Failed to parse LLM JSON, falling back to basic query:", err);
        return {
            standalone_query: question,
            intent: 'SPECIFIC_ENTITY',
            filters: {}
        };
    }
}