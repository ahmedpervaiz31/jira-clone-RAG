import { boardMeta, taskMeta, userMeta } from './metadata.js';

export function buildSearchQuery(question, options = {}) {
    let query = question || '';
    if (options.context) {
        query = `${options.context}\n\nQuestion: ${query}`;
    }
    return query;
}

export function buildPineconeFilter(effectiveBoardId, filters = {}) {
    let baseFilter = {};

    const targetBoardId = filters.boardId || effectiveBoardId;

    if (filters.boardName) {
        baseFilter.boardName = { $eq: filters.boardName };
    } else if (targetBoardId) {
        baseFilter.boardId = { $eq: targetBoardId };
    }

    const hasStatus = !!filters.status;
    const hasUrgency = filters.dueDateStart || filters.dueDateEnd;
    const hasAssignee = filters.isAssigned !== undefined && filters.isAssigned !== null;
    const hasUser = !!filters.username;

    if (!hasStatus && !hasUrgency && !hasAssignee && !hasUser) {
        if (Object.keys(baseFilter).length === 0) {
            return { type: { $eq: 'summary' }, mongoId: { $eq: 'global' } };
        }
        return {
            $or: [
                baseFilter,
                { type: { $eq: 'summary' }, mongoId: { $eq: 'global' } }
            ]
        };
    }

    if (filters.status) {
        baseFilter.status = Array.isArray(filters.status)
            ? { $in: filters.status }
            : { $eq: filters.status };
    }

    if (filters.assignedTo) {
        baseFilter.assignedTo = { $eq: filters.assignedTo };
    }

    if (filters.isAssigned !== undefined && filters.isAssigned !== null) {
        baseFilter.isAssigned = { $eq: filters.isAssigned };
    }

    if (filters.dueDateStart || filters.dueDateEnd) {
        baseFilter.dueDateTimestamp = {};
        if (filters.dueDateStart) {
            baseFilter.dueDateTimestamp['$gte'] = filters.dueDateStart - 86400;
        }
        if (filters.dueDateEnd) {
            baseFilter.dueDateTimestamp['$lte'] = filters.dueDateEnd + 86400;
        }
    }

    return baseFilter;
}

export function retrieveBoard(matches) {
    if (!matches) {
        return { boards: [] };
    }

    const boards = matches
        .filter(m => m.metadata && m.metadata.type === 'board')
        .map(m => m.metadata);

    return {
        boards: boards.map(b => boardMeta(b, [])),
    };
}

export function retrieveTask(matches) {
    if (!matches) return { tasks: [] };

    const tasks = matches
        .filter(m => m.metadata && m.metadata.type === 'task')
        .map(m => m.metadata);

    return { tasks: tasks.map(t => taskMeta(t, '')) };
}

export function retrieveUser(matches) {
    if (!matches) return { users: [] };

    const users = matches
        .filter(m => m.metadata && m.metadata.type === 'user')
        .map(m => m.metadata);

    return { users: users.map(u => userMeta(u, 0)) };
}
