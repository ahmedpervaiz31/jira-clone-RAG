import Task from '../jira-backend/models/Task.model.js';
import Board from '../jira-backend/models/Board.model.js';
import User from '../jira-backend/models/User.model.js';
import { Pinecone } from '@pinecone-database/pinecone'; //
import { chunkBoard, chunkTask, chunkUser } from './chunker.js';
import { getEmbedding } from './embedder.js';
import { keywordSearch, semanticSearch } from './search.js';

const pc = new Pinecone({ 
    apiKey: process.env.PINECONE_API_KEY 
});

export async function batchIndexer() {
	const index = pc.index(process.env.PINECONE_INDEX_NAME);

	const boards = await Board.find().populate('members');
	for (const board of boards) {
		const text = chunkBoard(board);
		const embedding = await getEmbedding(text);
		await index.upsert([
			{
				id: `board-${board.id}`,
				values: embedding,
				metadata: {
					type: 'board',
					name: board.name,
					key: board.key,
					flag: board.flag,
				},
			},
		]);
	}

	const tasks = await Task.find();
	for (const task of tasks) {
		const text = chunkTask(task);
		const embedding = await getEmbedding(text);
		await index.upsert([
			{
				id: `task-${task.id}`,
				values: embedding,
				metadata: {
					type: 'task',
					title: task.title,
					status: task.status,
					assignedTo: task.assignedTo,
					boardId: task.boardId?.toString(),
				},
			},
		]);
	}

	const users = await User.find();
	for (const user of users) {
		const text = chunkUser(user);
		const embedding = await getEmbedding(text);
		await index.upsert([
			{
				id: `user-${user.id}`,
				values: embedding,
				metadata: {
					type: 'user',
					username: user.username,
				},
			},
		]);
	}
}

export async function upsertToIndex({ type, id, text, metadata }) {
	try {
		const index = pc.index(process.env.PINECONE_INDEX_NAME);
		const embedding = await getEmbedding(text);
		await index.upsert([
			{
				id: `${type}-${id}`,
				values: embedding,
				metadata: {
					type,
					...metadata,
				},
			},
		]);
	} catch (err) {
		return { error: 'Failed to upsert to index' };
	}
}

export async function deleteFromIndex({ type, id }) {
	try {
		const index = pc.index(process.env.PINECONE_INDEX_NAME);
		await index.deleteOne(`${type}-${id}`);
	} catch (err) {
		return { error: 'Failed to delete from index' };
	}
}

export async function ragSearch(query, userId, options = { type: 'keyword', topK: 5 }) {
	if (options.type === 'semantic') {
		return await semanticSearch(query, userId, options.topK);
	}
	return await keywordSearch(query, userId);
}