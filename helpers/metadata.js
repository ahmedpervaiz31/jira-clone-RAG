export function boardMeta(board, boardTasks = []) {
    const stats = {
        to_do: boardTasks.filter(t => t.status === 'to_do').length,
        in_progress: boardTasks.filter(t => t.status === 'in_progress').length,
        done: boardTasks.filter(t => t.status === 'done').length
    };
    const titles = boardTasks.map(t => t.title).slice(0, 10);
    
    return {
        name: board.name,
        key: board.key,
        flag: board.flag,
        mongoId: board._id?.toString() || '',
        boardId: board._id?.toString() || '', 
        members: board.members?.map(id => id.toString()) || [],
        tasks: board.tasks?.map(id => id.toString()) || [],
        taskCount: boardTasks.length,
        toDoCount: stats.to_do,
        inProgressCount: stats.in_progress,
        doneCount: stats.done,
        taskTitles: titles
    };
}

export function taskMeta(task, boardName = 'Unknown') {
    return {
        title: task.title ?? '',
        status: task.status ?? '',
        assignedTo: task.assignedTo ?? '',
        boardName: boardName ?? '',
        boardId: task.boardId?.toString() ?? '', 
        mongoId: task._id?.toString() || '',
        description: task.description ?? '',
        dueDate: task.dueDate ? String(task.dueDate) : '',
        createdAt: task.createdAt ? String(task.createdAt) : '',
        order: task.order ?? '',
        displayId: task.displayId ?? '',
        dependencies: Array.isArray(task.dependencies) ? task.dependencies.map(id => id.toString()) : []
    };
}

export function userMeta(user, taskCount = 0) {
    return {
        username: user.username,
        mongoId: user._id?.toString() || '',
        workload: taskCount
    };
}

export function extractMetadata(type, entity, extra = {}) {
    let metadata = {};
    const data = entity.toObject ? entity.toObject() : entity;
    switch (type) {
        case 'board':
            metadata = boardMeta(data, extra.boardTasks || []);
            break;
        case 'task':
            metadata = taskMeta(data, extra.boardName || 'Unknown');
            break;
        case 'user':
            metadata = userMeta(data, extra.taskCount || 0);
            break;
    }
    return metadata;
}

export function parseMetadata(metadata) {
    const parsed = { ...metadata };
    if (metadata.members) {
        parsed.members = metadata.members.map(id => id.toString());
    }
    if (metadata.tasks) {
        parsed.tasks = metadata.tasks.map(id => id.toString());
    }
    return parsed;
}

export function formatPineconeMetadata(type, entity, extra = {}) {
    const data = entity.toObject ? entity.toObject() : entity;
    let metadata = extractMetadata(type, data, extra);
    
    return {
        type,
        mongoId: data._id?.toString() || '',
        ...metadata
    };
}