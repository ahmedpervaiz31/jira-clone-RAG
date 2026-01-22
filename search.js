import Task from '../jira-backend/models/Task.model.js';
import Board from '../jira-backend/models/Board.model.js';
import User from '../jira-backend/models/User.model.js';
import { getEmbedding } from './embedder.js';
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

export async function ragSearch(query, userId, topK = 5) {
    try {
        const index = pc.index(process.env.PINECONE_INDEX_NAME);
        const embedding = await getEmbedding(query, true);
        const { matches } = await index.query({ vector: embedding, topK, includeMetadata: true });

        const accessibleBoards = await Board.find({
            $or: [{ flag: 'public' }, { flag: 'private', members: userId }]
        }).select('_id').lean();
        
        const allowedIds = new Set(accessibleBoards.map(b => b._id.toString()));
        const ids = { board: [], task: [], user: [] };

        const validators = {
			user: () => true,
			board: (m) => m.mongoId && allowedIds.has(m.mongoId.toString()),
			task: (m) => m.boardId && allowedIds.has(m.boardId.toString())
		};

		matches.forEach(({ metadata }) => {
			if (metadata?.type && validators[metadata.type]?.(metadata)) {
				if (metadata.mongoId && metadata.type === 'board') {
					ids.board.push(metadata.mongoId.toString());
				} else if (metadata.id && metadata.type === 'user') {
					ids.user.push(metadata.id.toString());
				} else if (metadata.mongoId && metadata.type === 'task') {
					ids.task.push(metadata.mongoId.toString());
				}
			}
		});

		const globalSummaryChunk = matches.find(({ metadata }) => metadata?.type === 'summary');
    	const globalSummaryText = globalSummaryChunk ? globalSummaryChunk.metadata.textChunk : '';

        const [boards, tasks, users] = await Promise.all([
            Board.find({ _id: { $in: ids.board } }).select('name key flag').lean(),
            Task.find({ _id: { $in: ids.task } }).select('title status assignedTo boardId').lean(),
            User.find({ _id: { $in: ids.user } }).select('username').lean()
        ]);

        const boardSummaries = matches
            .filter(({ metadata }) => metadata?.type === 'board' && metadata.mongoId && allowedIds.has(metadata.mongoId.toString()))
            .map(({ metadata }) => ({
                name: metadata.name,
                key: metadata.key,
                flag: metadata.flag,
                members: metadata.members || [],
                tasks: metadata.tasks || [],
                taskCount: metadata.taskCount || 0,
                toDoCount: metadata.toDoCount || 0,
                inProgressCount: metadata.inProgressCount || 0,
                doneCount: metadata.doneCount || 0,
                taskTitles: metadata.taskTitles || [],
                summary: `Board ${metadata.name} has ${metadata.taskCount || 0} tasks: ` +
                    `${metadata.toDoCount || 0} to do, ` +
                    `${metadata.inProgressCount || 0} in progress, ` +
                    `${metadata.doneCount || 0} done.`
            }));

        return { boards, tasks, users, boardSummaries, globalSummaryText };
    } catch (err) {
        throw new Error(`RAG search failed: ${err.message}`);
    }
}