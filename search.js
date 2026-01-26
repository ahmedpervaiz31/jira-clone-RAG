import Task from '../jira-backend/models/Task.model.js';
import Board from '../jira-backend/models/Board.model.js';
import User from '../jira-backend/models/User.model.js';
import { getEmbedding } from './embedder.js';
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

export async function ragSearch(query, userId, activeBoardId = null, topK = 10) {
    try {
        const index = pc.index(process.env.PINECONE_INDEX_NAME);
        const embedding = await getEmbedding(query, true);
        
        const accessibleBoards = await Board.find({
            $or: [
                { flag: 'public' }, 
                { flag: 'private', members: userId }]
        }).select('_id').lean();
        
        const allowedIds = accessibleBoards.map(b => b._id.toString());
        
        let pineconeFilter;

        if (activeBoardId && activeBoardId !== 'null' && activeBoardId !== '') {
            pineconeFilter = {
                $or: [
                    { boardId: { $eq: activeBoardId } }, 
                    { mongoId: { $eq: activeBoardId } }
                ]
            };
        } else {
            pineconeFilter = {
                $or: [
                    { boardId: { $in: allowedIds } },
                    { mongoId: { $in: allowedIds } },
                    { type: { $eq: 'user' } },
                    { type: { $eq: 'summary' } }
                ]
            };
        }

        const { matches } = await index.query({ 
            vector: embedding, 
            topK, 
            includeMetadata: true,
            filter: pineconeFilter 
        });

        const ids = { board: [], task: [], user: [] };

        matches.forEach(({ metadata }) => {
            if (!metadata) return;
            if (metadata.type === 'board' && metadata.mongoId) {
                ids.board.push(metadata.mongoId.toString());
            } else if (metadata.type === 'user' && metadata.mongoId) { 
                ids.user.push(metadata.mongoId.toString());
            } else if (metadata.type === 'task' && metadata.mongoId) {
                ids.task.push(metadata.mongoId.toString());
            }
        });
        
        const globalSummaryChunk = matches.find(({ metadata }) => metadata?.type === 'summary');
        const globalSummaryText = (activeBoardId && activeBoardId !== 'null') 
            ? '' 
            : (globalSummaryChunk?.metadata?.textChunk || '');

        const [boards, tasks, users] = await Promise.all([
            Board.find({ _id: { $in: ids.board } }).select('name key flag members').lean(),
            Task.find({ _id: { $in: ids.task } }).select('title status assignedTo boardId description dueDate').lean(),
            User.find({ _id: { $in: ids.user } }).select('username').lean()
        ]);

        const boardSummaries = matches
            .filter(({ metadata }) => metadata?.type === 'board')
            .map(({ metadata }) => ({
                name: metadata.name,
                key: metadata.key,
                summary: `Board ${metadata.name} (${metadata.key}) has ${metadata.taskCount || 0} tasks: ` +
                    `${metadata.toDoCount || 0} To Do, ${metadata.inProgressCount || 0} In Progress, ` +
                    `${metadata.doneCount || 0} Done.`
            }));

        return { boards, tasks, users, boardSummaries, globalSummaryText };
    } catch (err) {
        throw new Error(`RAG search failed: ${err.message}`);
    }
}