import { performUpsert } from '../pipeline.js';

export async function upsertGlobalSummary(data) {
    if (!data) throw new Error('Missing summary data');
    const boards = Array.isArray(data.boards) ? data.boards : [];
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const users = Array.isArray(data.users) ? data.users : [];

    const summaryText = `Boards: ${boards.length}. Tasks: ${tasks.length}. Users: ${users.length}. 
        Board names: ${boards.map(b => b.name).join(', ')}. 
        Usernames: ${users.map(u => u.username).join(', ')}`;

    await performUpsert('summary', 'global', summaryText, {
        type: 'summary',
        boardCount: boards.length || 0,
        taskCount: tasks.length || 0,
        userCount: users.length || 0,
        boardNames: boards.map(b => b.name) || [],
        userNames: users.map(u => u.username) || [],
        textChunk: summaryText || ''
    });
}

export async function upsertBoardSummaries(data) {
    if (!data) throw new Error('Missing board summary data');
    const boards = Array.isArray(data.boards) ? data.boards : [];
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const users = Array.isArray(data.users) ? data.users : [];

    for (const board of boards) {
        const boardTasks = tasks.filter(t => t.boardId && board._id && t.boardId.toString() === board._id.toString());
        const assignedUsernames = [...new Set(boardTasks.map(t => t.assignedTo))].filter(Boolean);
        const boardUsers = users.filter(u => assignedUsernames.includes(u.username));

        const summaryText = `Board: ${board.name} (${board.key}). 
            Total Tasks: ${boardTasks.length}. 
            Assigned Users: ${boardUsers.length}. 
            Task Titles: ${boardTasks.map(t => t.title).join(', ')}. 
            Usernames: ${boardUsers.map(u => u.username).join(', ')}`;
        await performUpsert('summary', board._id, summaryText, {
            type: 'summary',
            mongoId: board._id ? board._id.toString() : '',
            boardId: board._id ? board._id.toString() : '',
            boardName: board.name || '',
            taskCount: boardTasks.length || 0,
            to_doCount: boardTasks.filter(t => t.status === 'To Do').length || 0,
            in_progressCount: boardTasks.filter(t => t.status === 'In Progress').length || 0,
            doneCount: boardTasks.filter(t => t.status === 'Done').length || 0,
            taskTitles: boardTasks.map(t => t.title) || [],
            usernames: boardUsers.map(u => u.username) || [],
            textChunk: summaryText || ''
        });
    }
}

export async function getGlobalSummary(index, matches, intent, query) {
    let globalSummary = matches.find(m =>
        m.metadata &&
        m.metadata.type === 'summary' &&
        m.metadata.mongoId === 'global'
    );
    if (globalSummary && globalSummary.metadata.textChunk) {
        return globalSummary.metadata.textChunk;
    }
    if (intent === 'GLOBAL_SUMMARY' || (query && query.toLowerCase().includes('all boards'))) {
        const directFetch = await index.fetch(['summary-global']);
        return directFetch.records?.['summary-global']?.metadata?.textChunk || '';
    }
    return '';
}

export async function getBoardSummary(index, matches, boardId, filters) {
    const targetBoardId = filters?.boardId || boardId;
    const targetBoardName = filters?.boardName;

    const matchedSummary = matches.find(m =>
        m.metadata && m.metadata.type === 'summary' &&
        (m.metadata.mongoId === targetBoardId || m.metadata.boardName === targetBoardName)
    );

    if (matchedSummary && matchedSummary.metadata.textChunk) {
        return matchedSummary.metadata.textChunk;
    }

    if (targetBoardId) {
        const boardSumId = `summary-${targetBoardId}`;
        const direct = await index.fetch([boardSumId]);
        if (direct.records?.[boardSumId]) {
            return direct.records[boardSumId].metadata.textChunk;
        }
    }

    return '';
}