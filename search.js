import Task from '../jira-backend/models/Task.model.js';
import Board from '../jira-backend/models/Board.model.js';
import User from '../jira-backend/models/User.model.js';
import { getEmbedding } from './embedder.js';
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
export async function ragSearch(query, userId, topK = 5) {
    try {
        const index = pc.index(process.env.PINECONE_INDEX_NAME);
        const embedding = await getEmbedding(query);
        const { matches } = await index.query({ vector: embedding, topK, includeMetadata: true });

        const accessibleBoards = await Board.find({
            $or: [
                { flag: 'public' },
                { flag: 'private', members: userId }
            ]
        }).select('_id').lean();
        
        const allowedBoardIds = new Set(accessibleBoards.map(b => b._id.toString()));
        const ids = { board: [], task: [], user: [] };

        matches.forEach(({ metadata }) => {
			if (!metadata || !metadata.id) return;

			const metadataId = metadata.id.toString();

			if (metadata.type === 'user') {
				ids.user.push(metadataId);
			} 
			else if (metadata.type === 'board') {
				if (allowedBoardIds.has(metadataId)) {
					ids.board.push(metadataId);
				}
			} 
			else if (metadata.type === 'task') {
				const parentBoardId = metadata.boardId?.toString();
				if (allowedBoardIds.has(parentBoardId)) {
					ids.task.push(metadataId);
				}
			}
		});

		const [boards, tasks, users] = await Promise.all([
            Board.find({ _id: { $in: ids.board } }).select('name key flag').lean(),
            Task.find({ _id: { $in: ids.task } }).select('title status assignedTo boardId').lean(),
            User.find({ _id: { $in: ids.user } }).select('username').lean()
        ]);

        return { boards, tasks, users };
    } catch (err) {
        throw new Error(`RAG search failed: ${err.message}`);
    }
}