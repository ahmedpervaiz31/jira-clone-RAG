import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function askGroq(question, contextChunks, options = {}) {
    const model = options.model || "llama-3.3-70b-versatile";
    const context = contextChunks.join('\n---\n');
    
    const messages = [
        { 
            role: "system", 
            content: options.systemPrompt || "You are a helpful assistant. Use the provided context to answer the question." 
        },
        { 
            role: "user", 
            content: `Context:\n${context}\n\nQuestion: ${question}` 
        }
    ];

    const response = await groq.chat.completions.create({
        messages,
        model,
        temperature: options.temperature || 0.2,
        max_tokens: options.maxTokens || 1024,
    });

    return response.choices[0].message.content; 
}