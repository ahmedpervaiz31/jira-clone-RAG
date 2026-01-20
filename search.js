import Task from '../jira-backend/models/Task.model.js';
import Board from '../jira-backend/models/Board.model.js';
import User from '../jira-backend/models/User.model.js';
import { getEmbedding } from './embedder.js';
import { Pinecone } from '@pinecone-database/pinecone';

export async function keywordSearch(query, userId) {
    const regex = new RegExp(query, 'i');
    
	const boards = await Board.find({
		$and: [
			{
				$or: [
					{ flag: 'public' },
					{ $and: [ { flag: 'private' }, { members: userId } ] }
				]
			},
			{
				$or: [
					{ name: regex },
					{ key: regex }
				]
			}
		]
	});

	const boardIds = boards.map(b => b._id);
	const tasks = await Task.find({
		boardId: { $in: boardIds },
		$or: [
			{ title: regex },
			{ description: regex },
			{ assignedTo: regex }
		]
	});

    const users = await User.find({ username: regex });

	return { boards, tasks, users };
}

const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

export async function semanticSearch(query, userId, topK = 5) {
	const index = pc.index(process.env.PINECONE_INDEX_NAME);
	const embedding = await getEmbedding(query);
	
	const results = await index.query({
		vector: embedding,
		topK,
		includeMetadata: true,
	});

	const accessibleBoards = await Board.find({
		$or: [
			{ flag: 'public' },
			{ $and: [ { flag: 'private' }, { members: userId } ] }
		]
	});

	const accessibleBoardIds = new Set(accessibleBoards.map(b => b._id.toString())); 
	
	const filtered = results.matches.filter(match => {
		if (match.metadata.type === 'board') {
			return accessibleBoardIds.has(match.metadata.boardId);
		}
		if (match.metadata.type === 'task') {
			return accessibleBoardIds.has(match.metadata.boardId);
		}
		return true;
	});
	return filtered;
}