import { getEmbedding } from './embedder.js';
import { Pinecone } from '@pinecone-database/pinecone';
import { condenseQuery } from './helpers/queryCondenser.js';
import { buildPineconeFilter, retrieveBoard, retrieveTask, retrieveUser } from './helpers/retrievalHelpers.js';
import { getGlobalSummary, getBoardSummary } from './helpers/summaryHelpers.js';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

export async function ragSearch(query, activeBoardId = null, topK = 10, history = [], activeBoardName = null) {
    try {
        const index = pc.index(process.env.PINECONE_INDEX_NAME);
        const currentDate = new Date().toISOString();

        const condensed = await condenseQuery(history, query, currentDate, activeBoardName);
        const { standalone_query, mode, intent, filters } = condensed;
        const embedding = await getEmbedding(standalone_query, true);

        let effectiveTopK = topK;
        if (mode === 'OPERATIONAL' || intent === 'ANALYTICAL_LIST' || filters.dueDateStart || filters.dueDateEnd) {
            effectiveTopK = 50;
        }

        const queryOptions = {
            vector: embedding,
            topK: effectiveTopK,
            includeMetadata: true
        };

        const pineconeFilter = buildPineconeFilter(activeBoardId, filters);
        if (pineconeFilter && Object.keys(pineconeFilter).length > 0) {
            queryOptions.filter = pineconeFilter;
        }

        let { matches } = await index.query(queryOptions);

        // relaxed retrieval 
        if (matches.length === 0) {
            const hasConstraints = (filters.boardName || filters.boardId || activeBoardId) || (filters.assignedTo || filters.dueDateStart || filters.dueDateEnd);

            if (hasConstraints) {
                if (filters.assignedTo) {
                    const relaxedFilters = { ...filters };
                    delete relaxedFilters.assignedTo;
                    const relaxedFilter = buildPineconeFilter(activeBoardId, relaxedFilters);

                    if (relaxedFilter && Object.keys(relaxedFilter).length > 0) {
                        const relaxedOptions = { ...queryOptions, filter: relaxedFilter };
                        const relaxedResults = await index.query(relaxedOptions);
                        matches = relaxedResults.matches;
                    }
                }

                // semantic retrieval
                if (matches.length === 0) {
                    const fallbackOptions = {
                        ...queryOptions,
                        topK: 20
                    };
                    delete fallbackOptions.filter;
                    const fallback = await index.query(fallbackOptions);
                    matches = fallback.matches;
                }
            } else if (intent === 'SPECIFIC_BOARD' || intent === 'SPECIFIC_TASK') {
                delete queryOptions.filter;
                queryOptions.topK = 20;
                const fallback = await index.query(queryOptions);
                matches = fallback.matches;
            }
        }

        const { boards } = retrieveBoard(matches);
        const { tasks } = retrieveTask(matches);
        const { users } = retrieveUser(matches);

        const boardSummaryText = await getBoardSummary(index, matches, activeBoardId, filters);
        let globalSummaryText = await getGlobalSummary(index, matches, intent, query);

        if (matches.length >= effectiveTopK) {
            const warning = `(Note: Search limited to top ${effectiveTopK} results. More items may exist concurrently.)`;
            globalSummaryText = globalSummaryText ? `${globalSummaryText}\n${warning}` : warning;
        }

        if (mode === 'OPERATIONAL') {
            return {
                condensed,
                boards,
                tasks,
                users,
                boardSummaryText: "",
                globalSummaryText: ""
            };
        }

        if (intent === 'GLOBAL_SUMMARY' && globalSummaryText) {
            return {
                condensed,
                boards: [],
                tasks: [],
                users: [],
                boardSummaryText: '',
                globalSummaryText,
                searchQueryUsed: standalone_query
            };
        }

        if (intent === 'SPECIFIC_BOARD' && boardSummaryText) {
            const specificBoards = boards.filter(b =>
                (filters.boardId && b._id === filters.boardId) ||
                b.name.toLowerCase().includes(standalone_query.toLowerCase()) ||
                standalone_query.toLowerCase().includes(b.name.toLowerCase())
            );
            return {
                condensed,
                boards: specificBoards,
                tasks: [],
                users: [],
                boardSummaryText,
                globalSummaryText: '',
                searchQueryUsed: standalone_query
            };
        }

        if (intent === 'SPECIFIC_TASK') {
            const specificTasks = tasks.filter(t =>
                (filters.taskId && t.displayId === filters.taskId) ||
                t.title.toLowerCase().includes(standalone_query.toLowerCase()) ||
                standalone_query.toLowerCase().includes(t.title.toLowerCase())
            );
            return {
                condensed,
                boards: [],
                tasks: specificTasks,
                users: [],
                boardSummaryText: '',
                globalSummaryText: '',
                searchQueryUsed: standalone_query
            };
        }
        if (intent === 'SPECIFIC_USER') {
            const specificUsers = users.filter(u =>
                (filters.userId && u._id === filters.userId) ||
                u.username.toLowerCase().includes(standalone_query.toLowerCase()) ||
                standalone_query.toLowerCase().includes(u.username.toLowerCase())
            );
            return {
                condensed,
                boards: [],
                tasks: [],
                users: specificUsers,
                boardSummaryText: '',
                globalSummaryText: '',
                searchQueryUsed: standalone_query
            };
        }
        return {
            condensed,
            boards,
            tasks,
            users,
            boardSummaryText,
            globalSummaryText,
            searchQueryUsed: standalone_query
        };
    } catch (err) {
        throw new Error(`RAG search failed: ${err.message}`);
    }
}