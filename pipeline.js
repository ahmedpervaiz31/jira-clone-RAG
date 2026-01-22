import Task from '../jira-backend/models/Task.model.js';
import Board from '../jira-backend/models/Board.model.js';
import User from '../jira-backend/models/User.model.js';
import { Pinecone } from '@pinecone-database/pinecone';

import { chunkBoard, chunkTask, chunkUser } from './helpers/chunker.js';
import { extractMetadata } from './helpers/metadata.js';
import { upsertGlobalSummary } from './helpers/summary.js';
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
            mongoId: id.toString(),
            textChunk: text,
            ...metadata
        }
    }]);
}

export async function syncToPinecone(type, entity) {
    let text = '';
    let metadata = {};
    const data = entity.toObject ? entity.toObject() : entity;

    if (type === 'task') {
        const board = await Board.findById(data.boardId).lean();
        const boardName = board?.name || 'Unknown';
        text = chunkTask(data, boardName);
        metadata = extractMetadata('task', data, { boardName });
    } else if (type === 'user') {
        const taskCount = await Task.countDocuments({ assignedTo: data.username });
        text = chunkUser(data, taskCount);
        metadata = extractMetadata('user', data, { taskCount });
    } else if (type === 'board') {
        const boardTasks = await Task.find({ boardId: data._id }).lean();
        text = chunkBoard(data);
        metadata = extractMetadata('board', data, { boardTasks });
    } else if (type === 'summary') {
        return await upsertGlobalSummary(index, performUpsert);
    }
    
    await performUpsert(type, data._id, text, metadata);
}

export async function batchIndexer() {
    const [boards, tasks, users] = await Promise.all([
        Board.find().lean(),
        Task.find().lean(),
        User.find().lean()
    ]);

    const boardMap = Object.fromEntries(boards.map(b => [b._id.toString(), b.name]));
    const userWorkloads = tasks.reduce((acc, t) => {
        if (t.assignedTo) acc[t.assignedTo] = (acc[t.assignedTo] || 0) + 1;
        return acc;
    }, {});
    const boardTasksMap = tasks.reduce((acc, t) => {
        const bId = t.boardId.toString();
        if (!acc[bId]) acc[bId] = [];
        acc[bId].push(t);
        return acc;
    }, {});

    await upsertGlobalSummary(index, performUpsert);

	for (const b of boards) {
		const bTasks = boardTasksMap[b._id.toString()] || [];
		const boardMetaData = extractMetadata('board', b, { boardTasks: bTasks });
		await performUpsert('board', b._id, chunkBoard(b), boardMetaData);
	}

	for (const t of tasks) {
		const bName = boardMap[t.boardId?.toString()] || 'Unknown';
		const taskMetaData = extractMetadata('task', t, { boardName: bName });
		await performUpsert('task', t._id, chunkTask(t, bName), taskMetaData);
	}

	for (const u of users) {
		const count = userWorkloads[u.username] || 0;
		const userMetaData = extractMetadata('user', u, { taskCount: count });
		await performUpsert('user', u._id, chunkUser(u, count), userMetaData);
	}
}

export async function deleteFromIndex(type, id) {
    try {
        await index.deleteOne(`${type}-${id}`);
    } catch (err) {
		throw new Error(`Failed to delete ${type} with id ${id} from Pinecone: ${err.message}`);
    }
}

export async function upsertToIndex(type, entity) {
    try {
        let id = entity && (entity._id || entity.id);
		console.log('Upserting to Pinecone:', { type, id });
        if (!id) 
			throw new Error('Entity must have _id or id');
        await syncToPinecone(type, entity);
        await upsertGlobalSummary(index, performUpsert);
    } catch (err) {
        let id = entity && (entity._id || entity.id) || 'unknown';
        throw new Error(`Failed to upsert ${type} with id ${id} to Pinecone: ${err.message}`);
    }
}