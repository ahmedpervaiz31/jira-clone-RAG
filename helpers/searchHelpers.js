import Board from '../../jira-backend/models/Board.model.js';
import Task from '../../jira-backend/models/Task.model.js';

function extractIdsFromMatches(matches, ids) {
    matches.forEach(({ metadata }) => {
        if (!metadata || !metadata.mongoId || metadata.type === 'summary') return;
        const type = metadata.type;
        const mId = metadata.mongoId.toString();
        
        if (ids[type] && !ids[type].includes(mId)) {
            ids[type].push(mId);
        }
    });
}

function parseDate(dateStr) {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

export async function getSearchContext(query, userId, activeBoardId, filters = {}) {
    const accessibleBoards = await Board.find({
        $or: [{ flag: 'public' }, { flag: 'private', members: userId }]
    }).select('_id').lean();
    
    const allowedIds = accessibleBoards.map(b => b._id.toString());

    let effectiveBoardId = filters.boardId || (activeBoardId && activeBoardId !== 'null' ? activeBoardId : null);
    
    if (!effectiveBoardId && query) {
        const boardMatch = query.match(/board\s+(\d+|[a-zA-Z0-9]+)/i);
        if (boardMatch) {
            const detected = await Board.findOne({ 
                $or: [
                    { name: new RegExp(boardMatch[1], 'i') },
                    { key: boardMatch[1].toUpperCase() }
                ]
            }).select('_id').lean();
            if (detected) effectiveBoardId = detected._id.toString();
        }
    }

    return { effectiveBoardId, allowedIds };
}

export function buildPineconeFilter(effectiveBoardId, allowedIds, filters = {}) {
    let baseFilter = {
        boardId: effectiveBoardId && allowedIds.includes(effectiveBoardId) 
            ? { $eq: effectiveBoardId } 
            : { $in: allowedIds }
    };

    if (!filters.status && filters.isAssigned === undefined) {
        return {
            $or: [
                baseFilter, 
                {   type: { $eq: 'summary' }, 
                    mongoId: { $eq: 'global' }  }
            ]
        };
    }

    if (filters.status) {
        baseFilter.status = Array.isArray(filters.status) 
            ? { $in: filters.status } 
            : { $eq: filters.status };
    }
    
    if (filters.isAssigned !== undefined && filters.isAssigned !== null) {
        baseFilter.isAssigned = { $eq: filters.isAssigned };
    }

    return baseFilter;
}

async function augmentTaskIds(ids, allowedIds, intent, filters) {
    const { timeframe, username, isAssigned, status } = filters;

    const needsAugmentation = intent === 'ANALYTICAL_LIST' || timeframe || username || isAssigned !== undefined || status;
    if (!needsAugmentation) return;

    let extraTaskQuery = allowedIds.length > 0 ? { boardId: { $in: allowedIds } } : {};

    const dateField = timeframe?.field || 'dueDate'; 
    if (timeframe?.start || timeframe?.end) {
        const dateFilter = {};
        if (timeframe.start) dateFilter.$gte = parseDate(timeframe.start);
        if (timeframe.end) dateFilter.$lte = parseDate(timeframe.end);
        extraTaskQuery[dateField] = dateFilter;
    }

    if (username) {
        extraTaskQuery.assignedTo = new RegExp(`^${username}$`, 'i');
    } else if (isAssigned === true) {
        extraTaskQuery.assignedTo = { $ne: "" };
    }

    if (status) {
        extraTaskQuery.status = Array.isArray(status) ? { $in: status } : { $eq: status };
    }

    const extraTasks = await Task.find(extraTaskQuery)
        .limit(30) 
        .select('_id')
        .lean();

    extraTasks.forEach(t => {
        const tid = t._id.toString();
        if (!ids.task.includes(tid)) ids.task.push(tid);
    });
}

export async function collectSearchIds(matches, allowedIds, intent, filters) {
    const ids = { board: [], task: [], user: [] };

    if (intent === 'GLOBAL_SUMMARY') return ids;

    extractIdsFromMatches(matches, ids);

    if (intent === 'ANALYTICAL_LIST') {
        await augmentTaskIds(ids, allowedIds, intent, filters);
    }

    return ids;
}

export function buildBoardSummaries(matches) {
    return matches
        .filter(m => m.metadata && m.metadata.type === 'board')
        .map(m => ({
            name: m.metadata.name || 'Unknown Board',
            stats: {
                total: m.metadata.taskCount,
                toDo: m.metadata.toDoCount,
                inProgress: m.metadata.inProgressCount,
                done: m.metadata.doneCount
            },
            taskTitles: m.metadata.taskTitles || []
        }));
}
export function getGlobalSummary(matches, effectiveBoardId) {
    const globalSummary = matches.find(m => 
        m.metadata && 
        m.metadata.type === 'summary' && 
        m.metadata.mongoId === 'global'
    );

    if (effectiveBoardId) {
        const boardSummary = matches.find(m => 
            m.metadata && 
            m.metadata.type === 'summary' && 
            m.metadata.mongoId === effectiveBoardId
        );
        if (boardSummary) return boardSummary.metadata.textChunk;
    }

    return globalSummary ? globalSummary.metadata.textChunk : '';
}