import Task from '../jira-backend/models/Task.model.js';
import Board from '../jira-backend/models/Board.model.js';
import User from '../jira-backend/models/User.model.js';
import { getEmbedding } from './embedder.js';
import { Pinecone } from '@pinecone-database/pinecone';
import { condenseQuery } from './helpers/queryCondenser.js';
import { getSearchContext, buildPineconeFilter, collectSearchIds, buildBoardSummaries, getGlobalSummary } from './helpers/searchHelpers.js';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

export async function ragSearch(query, userId, activeBoardId = null, topK = 10, history = []) {
    try {
        const index = pc.index(process.env.PINECONE_INDEX_NAME);
        const currentDate = new Date().toISOString(); 

        const condensed = await condenseQuery(history, query, currentDate);

        const { standalone_query, intent, filters } = condensed;
        const { effectiveBoardId, allowedIds } = await getSearchContext(standalone_query, userId, activeBoardId, filters);        
        
        const embedding = await getEmbedding(standalone_query, true); 

        const { matches } = await index.query({ 
            vector: embedding, 
            topK, 
            includeMetadata: true,
            filter: buildPineconeFilter(effectiveBoardId, allowedIds, filters) 
        });

        let boardSummaries = buildBoardSummaries(matches); 
        let globalSummaryText = getGlobalSummary(matches, effectiveBoardId);

        if (!globalSummaryText && (intent === 'GLOBAL_SUMMARY' || query.toLowerCase().includes('all boards'))) {
            const directFetch = await index.fetch(['summary-global']); 
            globalSummaryText = directFetch.records?.['summary-global']?.metadata?.textChunk || "";
        }

        if (intent === 'SPECIFIC_ENTITY' && filters?.boardId) {
            if (boardSummaries.length === 0) {
                const boardSumId = `board-SUMMARY-${filters.boardId}`;
                const directBoardFetch = await index.fetch([boardSumId]);
                if (directBoardFetch.records?.[boardSumId]) {
                    boardSummaries = buildBoardSummaries([directBoardFetch.records[boardSumId]]);
                }
            }

            let boards = [];
            const isObjectId = /^[a-f\d]{24}$/i.test(filters.boardId);
            if (isObjectId) {
                boards = await Board.find({ _id: filters.boardId }).select('name key flag members').lean();
            } else {
                boards = await Board.find({ key: filters.boardId }).select('name key flag members').lean();
            }
            return {
                boards,
                tasks: [],
                users: [],
                boardSummaries,
                globalSummaryText,
                searchQueryUsed: standalone_query
            };
        }

        if (intent === 'GLOBAL_SUMMARY' && globalSummaryText) {
            return { 
                boards: [], tasks: [], users: [], 
                boardSummaries: [], globalSummaryText, 
                searchQueryUsed: standalone_query 
            };
        }

        const ids = await collectSearchIds(matches, allowedIds, intent, filters);
        const [tasks, initialUsers] = await Promise.all([
            Task.find({ _id: { $in: ids.task } }).select('title status assignedTo boardId description dueDate').lean(),
            User.find({ _id: { $in: ids.user } }).select('username').lean()
        ]);

        const allUsernames = [...new Set([...initialUsers.map(u => u.username), ...tasks.map(t => t.assignedTo).filter(Boolean)])];
        const users = await User.find({ username: { $in: allUsernames } }).select('username').lean();

        const allBoardIds = [...new Set([...ids.board, ...tasks.map(t => t.boardId.toString())])];
        const boards = await Board.find({ _id: { $in: allBoardIds } }).select('name key flag members').lean();

        return { 
            boards, 
            tasks, 
            users, 
            boardSummaries,
            globalSummaryText, 
            searchQueryUsed: standalone_query 
        };
    } catch (err) {
        throw new Error(`RAG search failed: ${err.message}`);
    }
}