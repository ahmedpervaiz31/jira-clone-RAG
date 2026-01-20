import { pipeline } from '@huggingface/transformers';

let extractor = null;

export async function getEmbedding(text, isQuery = false) {
    if (!extractor) {
        extractor = await pipeline('feature-extraction', 'Xenova/bge-large-en-v1.5');
    }

    const processedText = isQuery 
        ? `Represent this sentence for searching relevant passages: ${text}` 
        : text;

    const output = await extractor(processedText, { 
        pooling: 'mean', 
        normalize: true 
    });

    return Array.from(output.data);
}