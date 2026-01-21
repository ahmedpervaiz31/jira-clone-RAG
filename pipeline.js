import Task from '../jira-backend/models/Task.model.js';
import Board from '../jira-backend/models/Board.model.js';
import User from '../jira-backend/models/User.model.js';
import { Pinecone } from '@pinecone-database/pinecone';
import { chunkBoard, chunkTask, chunkUser } from './chunker.js';
import { getEmbedding } from './embedder.js';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index(process.env.PINECONE_INDEX_NAME);

async function performUpsert(type, id, text, metadata) {
    const embedding = await getEmbedding(text);
    await index.upsert([{
        id: `${type}-${id}`,
        values: embedding,
        metadata: { 
            type, 
            id: id.toString(),
            ...metadata 
        }
    }]);
}

export async function batchIndexer() {
    const boards = await Board.find().select('name key flag').lean();
    for (const b of boards) 
        await performUpsert('board', b._id, chunkBoard(b), { name: b.name, key: b.key, flag: b.flag });

    const tasks = await Task.find().select('title status assignedTo boardId').lean();
    for (const t of tasks) 
        await performUpsert('task', t._id, chunkTask(t), { 
            title: t.title,
            status: t.status,
            assignedTo: t.assignedTo,
            boardId: t.boardId?.toString() 
        });

    const users = await User.find().select('username').lean();
    for (const u of users) 
        await performUpsert('user', u._id, chunkUser(u), { username: u.username });
}

export async function upsertToIndex({ type, id, entity }) {
    try {
        const text = extractText(entity);
        const metadata = extractMetadata(entity);
        await performUpsert(type, id, text, metadata);
    } catch (err) {
        return { error: 'Failed to upsert to index' };
    }
}

export async function deleteFromIndex({ type, id }) {
    try {
        await index.deleteOne(`${type}-${id}`);
    } catch (err) {
        return { error: 'Failed to delete from index' };
    }
}

export function extractText(entity) {
    if (entity instanceof Board)
		return chunkBoard(entity);
    if (entity instanceof Task) 
		return chunkTask(entity);
    if (entity instanceof User) 
		return chunkUser(entity);
    return '';
}

export function extractMetadata(entity) {
    const meta = {
        board: { name: entity.name, key: entity.key, flag: entity.flag },
        task: { title: entity.title, status: entity.status, assignedTo: entity.assignedTo, boardId: entity.boardId?.toString() },
        user: { username: entity.username }
    };

    if (entity instanceof Board) 
		return meta.board;
    if (entity instanceof Task) 
		return meta.task;
    if (entity instanceof User) 
		return meta.user;
    return {};
}